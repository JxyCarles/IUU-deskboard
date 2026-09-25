//! 各 AI 平台的额度/用量接口。统一返回平台原始 JSON，由前端解析展示。
//! `secret` 参数是凭据管理器里的条目名，真正的 Key 只在后端读取。

use crate::http::{client, send_json};
use crate::secrets;
use serde_json::{json, Value};

/// DeepSeek 余额：GET /user/balance
#[tauri::command]
pub async fn fetch_deepseek(secret: String) -> Result<Value, String> {
    let key = secrets::get(&secret)?;
    send_json(
        client()
            .get("https://api.deepseek.com/user/balance")
            .bearer_auth(key),
    )
    .await
}

/// 智谱 GLM Coding Plan 额度：GET /api/monitor/usage/quota/limit
/// Authorization 直接放 Key，不带 Bearer 前缀。国际版 host 为 api.z.ai。
#[tauri::command]
pub async fn fetch_glm_quota(secret: String, host: Option<String>) -> Result<Value, String> {
    let key = secrets::get(&secret)?;
    let host = host
        .filter(|h| !h.trim().is_empty())
        .unwrap_or_else(|| "https://open.bigmodel.cn".to_string());
    send_json(
        client()
            .get(format!("{}/api/monitor/usage/quota/limit", host.trim_end_matches('/')))
            .header("Authorization", key)
            .header("Accept-Language", "zh-CN,zh"),
    )
    .await
}

/// Anthropic 组织费用报表（需要 Admin Key：sk-ant-admin...）。
/// 自动翻页，把所有日桶合并成 { data: [...] } 返回。金额单位是“美分”的十进制字符串。
#[tauri::command]
pub async fn fetch_claude_cost(
    secret: String,
    starting_at: String,
    ending_at: String,
) -> Result<Value, String> {
    let key = secrets::get(&secret)?;
    let mut all: Vec<Value> = Vec::new();
    let mut page: Option<String> = None;
    for _ in 0..10 {
        let mut query = vec![
            ("starting_at", starting_at.clone()),
            ("ending_at", ending_at.clone()),
            ("bucket_width", "1d".to_string()),
            ("limit", "31".to_string()),
        ];
        if let Some(p) = &page {
            query.push(("page", p.clone()));
        }
        let v = send_json(
            client()
                .get("https://api.anthropic.com/v1/organizations/cost_report")
                .query(&query)
                .header("x-api-key", &key)
                .header("anthropic-version", "2023-06-01"),
        )
        .await?;
        if let Some(arr) = v.get("data").and_then(|d| d.as_array()) {
            all.extend(arr.iter().cloned());
        }
        let has_more = v.get("has_more").and_then(|b| b.as_bool()).unwrap_or(false);
        page = v.get("next_page").and_then(|p| p.as_str()).map(String::from);
        if !has_more || page.is_none() {
            break;
        }
    }
    Ok(json!({ "data": all }))
}
