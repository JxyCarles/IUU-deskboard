//! AI 调用（创造台的「AI 整理」「AI 生成小组件」用）和自定义小组件的通用 JSON 抓取。
//!
//! 支持的服务：
//! - deepseek / glm / custom：OpenAI 兼容的 /chat/completions 接口
//! - claude：Anthropic Messages API（Rust 没有官方 SDK，这里直接发 HTTP）
//! 密钥都从 Windows 凭据管理器读取，不经过前端。

use crate::secrets;
use serde::Deserialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Duration;

fn ai_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(240))
        .user_agent("desk-board/0.1")
        .build()
        .expect("创建 HTTP 客户端失败")
}

async fn post_json(req: reqwest::RequestBuilder) -> Result<Value, String> {
    let resp = req.send().await.map_err(|e| format!("网络错误：{e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    let v: Value = serde_json::from_str(&text).unwrap_or(Value::String(text.clone()));
    if !status.is_success() {
        let msg = v
            .pointer("/error/message")
            .and_then(|m| m.as_str())
            .map(String::from)
            .unwrap_or_else(|| text.chars().take(300).collect());
        return Err(format!("HTTP {}：{msg}", status.as_u16()));
    }
    Ok(v)
}

/// 调用 AI，返回模型输出的文本。json = true 时要求模型只输出 JSON。
#[tauri::command]
pub async fn ai_chat(
    provider: String,
    model: Option<String>,
    base_url: Option<String>,
    system: String,
    user: String,
    json: bool,
) -> Result<String, String> {
    let model = model.filter(|m| !m.trim().is_empty());
    if provider == "claude" {
        return claude(model, system, user).await;
    }
    let (url, secret, default_model) = match provider.as_str() {
        "deepseek" => ("https://api.deepseek.com/chat/completions".to_string(), "provider:deepseek", "deepseek-chat"),
        "glm" => ("https://open.bigmodel.cn/api/paas/v4/chat/completions".to_string(), "provider:glm", "glm-4-flash"),
        "custom" => {
            let base = base_url.filter(|b| !b.trim().is_empty()).ok_or("请在设置里填写接口地址")?;
            (format!("{}/chat/completions", base.trim_end_matches('/')), "ai:custom", "")
        }
        _ => return Err(format!("未知的 AI 服务：{provider}")),
    };
    let key = secrets::get(secret).map_err(|_| match provider.as_str() {
        "deepseek" => "还没有保存 DeepSeek 的 API Key，请在「AI 额度」页面填写".to_string(),
        "glm" => "还没有保存智谱的 API Key，请在「AI 额度」页面填写".to_string(),
        _ => "还没有保存这个 AI 服务的 API Key，请在设置里填写".to_string(),
    })?;
    let model = model.unwrap_or_else(|| default_model.to_string());
    if model.is_empty() {
        return Err("请在设置里填写模型名称".into());
    }
    let mut body = json!({
        "model": model,
        "messages": [{ "role": "system", "content": system }, { "role": "user", "content": user }],
        "temperature": 0.2,
        "max_tokens": 8192,
    });
    if json {
        body["response_format"] = json!({ "type": "json_object" });
    }
    let v = post_json(ai_client().post(url).bearer_auth(key).json(&body)).await?;
    v.pointer("/choices/0/message/content")
        .and_then(|c| c.as_str())
        .map(String::from)
        .ok_or_else(|| format!("AI 返回格式不对：{}", v.to_string().chars().take(200).collect::<String>()))
}

async fn claude(model: Option<String>, system: String, user: String) -> Result<String, String> {
    let key = secrets::get("ai:claude").map_err(|_| "还没有保存 Claude 的 API Key，请在设置里填写".to_string())?;
    let body = json!({
        "model": model.unwrap_or_else(|| "claude-opus-5".into()),
        "max_tokens": 16000,
        "system": system,
        "messages": [{ "role": "user", "content": user }],
        // 模型因安全分类器拒答时，由服务端自动换用备用模型重试
        "fallbacks": "default",
    });
    let v = post_json(
        ai_client()
            .post("https://api.anthropic.com/v1/messages")
            .header("x-api-key", key)
            .header("anthropic-version", "2023-06-01")
            .header("anthropic-beta", "server-side-fallback-2026-07-01")
            .json(&body),
    )
    .await?;
    if v.get("stop_reason").and_then(|s| s.as_str()) == Some("refusal") {
        return Err("Claude 拒绝了这次请求，请调整输入内容后再试".into());
    }
    let text: String = v
        .get("content")
        .and_then(|c| c.as_array())
        .map(|blocks| {
            blocks
                .iter()
                .filter(|b| b.get("type").and_then(|t| t.as_str()) == Some("text"))
                .filter_map(|b| b.get("text").and_then(|t| t.as_str()))
                .collect::<Vec<_>>()
                .join("")
        })
        .unwrap_or_default();
    if text.is_empty() {
        return Err("Claude 没有返回文本".into());
    }
    Ok(text)
}

// ---------- 自定义小组件：通用 JSON 抓取 ----------

#[derive(Deserialize)]
pub struct Auth {
    header: String,
    prefix: Option<String>,
    secret: String,
}

#[tauri::command]
pub async fn fetch_json(url: String, headers: Option<HashMap<String, String>>, auth: Option<Auth>) -> Result<Value, String> {
    let ok_scheme = url.starts_with("https://") || url.starts_with("http://localhost") || url.starts_with("http://127.0.0.1");
    if !ok_scheme {
        return Err("只支持 https:// 地址".into());
    }
    let mut req = crate::http::client().get(&url).header("Accept", "application/json");
    for (k, v) in headers.unwrap_or_default() {
        req = req.header(k, v);
    }
    if let Some(a) = auth {
        let key = secrets::get(&format!("widget:{}", a.secret)).map_err(|_| format!("还没有填写密钥「{}」，请在创造台里填写", a.secret))?;
        req = req.header(a.header, format!("{}{}", a.prefix.unwrap_or_default(), key));
    }
    let resp = req.send().await.map_err(|e| format!("网络错误：{e}"))?;
    let status = resp.status();
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    if bytes.len() > 8 * 1024 * 1024 {
        return Err("返回内容超过 8 MB".into());
    }
    if !status.is_success() {
        return Err(format!("HTTP {}：{}", status.as_u16(), String::from_utf8_lossy(&bytes).chars().take(200).collect::<String>()));
    }
    serde_json::from_slice(&bytes).map_err(|e| format!("返回的不是 JSON：{e}"))
}
