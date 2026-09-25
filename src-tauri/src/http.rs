use serde_json::Value;
use std::time::Duration;

pub fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent("Mozilla/5.0 desk-board/0.1")
        .build()
        .expect("创建 HTTP 客户端失败")
}

fn clip(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

pub async fn send_json(req: reqwest::RequestBuilder) -> Result<Value, String> {
    let resp = req.send().await.map_err(|e| format!("网络错误：{e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("HTTP {}：{}", status.as_u16(), clip(&text, 300)));
    }
    serde_json::from_str(&text).map_err(|e| format!("解析失败：{e}；原始内容：{}", clip(&text, 200)))
}
