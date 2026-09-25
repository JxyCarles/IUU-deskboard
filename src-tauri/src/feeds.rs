//! 抓取 RSS / Atom 资讯源。放在后端做是为了绕开浏览器的跨域限制。

use crate::http::client;
use serde::Serialize;

#[derive(Serialize)]
pub struct FeedItem {
    title: String,
    link: String,
    published: Option<String>,
    summary: Option<String>,
    /// 正文 HTML（RSS 里带了才有，前端快速浏览用）
    content: Option<String>,
}

fn strip_html(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut in_tag = false;
    for c in s.chars() {
        match c {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(c),
            _ => {}
        }
    }
    let collapsed = out.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed.chars().take(160).collect()
}

#[tauri::command]
pub async fn fetch_feed(url: String) -> Result<Vec<FeedItem>, String> {
    let resp = client()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("网络错误：{e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    let feed =
        feed_rs::parser::parse(&bytes[..]).map_err(|e| format!("不是有效的 RSS/Atom：{e}"))?;
    Ok(feed
        .entries
        .into_iter()
        .take(40)
        .map(|e| {
            // 有的源把全文放在 content 里，有的只放在 summary（HTML）里
            let content = e
                .content
                .as_ref()
                .and_then(|c| c.body.clone())
                .or_else(|| e.summary.as_ref().map(|s| s.content.clone()))
                .filter(|c| !c.trim().is_empty())
                .map(|c| c.chars().take(60_000).collect::<String>());
            FeedItem {
                title: e.title.map(|t| t.content).unwrap_or_default(),
                link: e.links.first().map(|l| l.href.clone()).unwrap_or_default(),
                published: e.published.or(e.updated).map(|d| d.to_rfc3339()),
                summary: e
                    .summary
                    .map(|s| strip_html(&s.content))
                    .filter(|s| !s.is_empty()),
                content,
            }
        })
        .collect())
}
