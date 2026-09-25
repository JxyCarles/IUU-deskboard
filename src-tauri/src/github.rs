//! GitHub Trending。
//! GitHub 没有官方的 Trending API，默认直接解析 github.com/trending 页面（和网页看到的一致，含“今日新增星标”）；
//! 另提供官方 Search API 模式：按“最近 N 天创建、星标最多”近似 Trending，可选填 Token 提高频率限制。

use crate::http::{client, send_json};
use crate::secrets;
use scraper::{Html, Selector};
use serde::Serialize;

#[derive(Serialize)]
pub struct Repo {
    name: String, // owner/repo
    url: String,
    description: String,
    language: Option<String>,
    color: Option<String>,
    stars: u64,
    forks: u64,
    /// 本周期新增星标（仅网页模式）
    period_stars: Option<u64>,
}

fn num(s: &str) -> u64 {
    s.chars().filter(|c| c.is_ascii_digit()).collect::<String>().parse().unwrap_or(0)
}

fn text(el: scraper::ElementRef) -> String {
    el.text().collect::<String>().split_whitespace().collect::<Vec<_>>().join(" ")
}

fn parse_trending(html: &str) -> Vec<Repo> {
    let doc = Html::parse_document(html);
    let sel = |s: &str| Selector::parse(s).unwrap();
    let (row, title, desc, lang, color, link, today) = (
        sel("article.Box-row"),
        sel("h2 a"),
        sel("p"),
        sel("[itemprop=programmingLanguage]"),
        sel(".repo-language-color"),
        sel("a.Link--muted"),
        sel("span.float-sm-right"),
    );
    doc.select(&row)
        .filter_map(|r| {
            let a = r.select(&title).next()?;
            let path = a.value().attr("href")?.trim_matches('/').to_string();
            let mut stars = 0;
            let mut forks = 0;
            for l in r.select(&link) {
                let href = l.value().attr("href").unwrap_or("");
                if href.ends_with("/stargazers") {
                    stars = num(&text(l));
                } else if href.ends_with("/forks") {
                    forks = num(&text(l));
                }
            }
            Some(Repo {
                url: format!("https://github.com/{path}"),
                name: path,
                description: r.select(&desc).next().map(text).unwrap_or_default(),
                language: r.select(&lang).next().map(text),
                color: r
                    .select(&color)
                    .next()
                    .and_then(|c| c.value().attr("style"))
                    .and_then(|s| s.split("background-color:").nth(1))
                    .map(|c| c.trim().trim_end_matches(';').to_string()),
                stars,
                forks,
                period_stars: r.select(&today).next().map(|t| num(&text(t))),
            })
        })
        .collect()
}

/// since: daily / weekly / monthly；language: 如 "rust"、"typescript"，空为全部
#[tauri::command]
pub async fn github_trending(since: String, language: Option<String>, mode: Option<String>) -> Result<Vec<Repo>, String> {
    let lang = language.unwrap_or_default().trim().to_lowercase();
    if mode.as_deref() == Some("api") {
        return search_api(&since, &lang).await;
    }
    let url = format!(
        "https://github.com/trending/{}?since={}",
        urlencode(&lang),
        match since.as_str() {
            "weekly" | "monthly" => since.as_str(),
            _ => "daily",
        }
    );
    let resp = client()
        .get(&url)
        .header("Accept-Language", "en-US,en")
        .send()
        .await
        .map_err(|e| format!("网络错误：{e}"))?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status().as_u16()));
    }
    let html = resp.text().await.map_err(|e| e.to_string())?;
    let repos = parse_trending(&html);
    if repos.is_empty() {
        return Err("没有解析到仓库，GitHub 页面结构可能变了，可以先切换到 API 模式".into());
    }
    Ok(repos)
}

fn urlencode(s: &str) -> String {
    s.bytes()
        .map(|b| match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'-' | b'_' | b'.' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

async fn search_api(since: &str, lang: &str) -> Result<Vec<Repo>, String> {
    let days = match since {
        "weekly" => 7,
        "monthly" => 30,
        _ => 1,
    };
    let from = (chrono::Local::now() - chrono::Duration::days(days)).format("%Y-%m-%d");
    let mut q = format!("created:>{from}");
    if !lang.is_empty() {
        q.push_str(&format!(" language:{lang}"));
    }
    let mut req = client()
        .get("https://api.github.com/search/repositories")
        .query(&[("q", q.as_str()), ("sort", "stars"), ("order", "desc"), ("per_page", "30")])
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28");
    if let Ok(token) = secrets::get("github") {
        req = req.bearer_auth(token);
    }
    let v = send_json(req).await?;
    let items = v.get("items").and_then(|i| i.as_array()).ok_or("GitHub API 返回格式不对")?;
    Ok(items
        .iter()
        .map(|it| Repo {
            name: it.get("full_name").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            url: it.get("html_url").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            description: it.get("description").and_then(|x| x.as_str()).unwrap_or("").to_string(),
            language: it.get("language").and_then(|x| x.as_str()).map(String::from),
            color: None,
            stars: it.get("stargazers_count").and_then(|x| x.as_u64()).unwrap_or(0),
            forks: it.get("forks_count").and_then(|x| x.as_u64()).unwrap_or(0),
            period_stars: None,
        })
        .collect())
}

#[cfg(test)]
mod tests {
    #[test]
    #[ignore]
    fn parse_saved_page() {
        let html = std::fs::read_to_string(std::env::var("TRENDING_HTML").unwrap()).unwrap();
        let r = super::parse_trending(&html);
        for x in &r {
            println!("{} | {:?} {:?} ★{} ⑂{} +{:?} | {}", x.name, x.language, x.color, x.stars, x.forks, x.period_stars, x.description);
        }
        assert!(!r.is_empty());
    }
}
