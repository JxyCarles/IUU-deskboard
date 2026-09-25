//! 解析本地 Claude Code 会话日志（~/.claude/projects/**/*.jsonl），按 日期×模型×项目 汇总 token。
//! 同一条消息会因为多个内容块被写成多行，按 message.id + requestId 去重。

use chrono::{DateTime, Local, NaiveDate};
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Default, Clone)]
pub struct UsageRow {
    date: String,
    model: String,
    project: String,
    input: u64,
    output: u64,
    cache_read: u64,
    cache_write: u64,
    cache_write_1h: u64,
    requests: u64,
}

fn collect_jsonl(dir: &Path, since: SystemTime, out: &mut Vec<PathBuf>) {
    let Ok(entries) = fs::read_dir(dir) else { return };
    for e in entries.flatten() {
        let p = e.path();
        if p.is_dir() {
            collect_jsonl(&p, since, out);
        } else if p.extension().is_some_and(|x| x == "jsonl") {
            let fresh = e
                .metadata()
                .and_then(|m| m.modified())
                .map(|t| t >= since)
                .unwrap_or(true);
            if fresh {
                out.push(p);
            }
        }
    }
}

fn u(v: &Value, k: &str) -> u64 {
    v.get(k).and_then(|x| x.as_u64()).unwrap_or(0)
}

fn scan(root: PathBuf, days: u32) -> Vec<UsageRow> {
    let since_sys = SystemTime::now() - Duration::from_secs(days as u64 * 86_400);
    let since_date: NaiveDate =
        Local::now().date_naive() - chrono::Days::new(days.saturating_sub(1) as u64);

    let mut files = Vec::new();
    collect_jsonl(&root, since_sys, &mut files);

    let mut seen: HashSet<String> = HashSet::new();
    let mut agg: HashMap<(String, String, String), UsageRow> = HashMap::new();

    for f in files {
        let Ok(file) = fs::File::open(&f) else { continue };
        for line in BufReader::new(file).lines().map_while(Result::ok) {
            if !line.contains("\"usage\"") {
                continue;
            }
            let Ok(v) = serde_json::from_str::<Value>(&line) else { continue };
            if v.get("type").and_then(|t| t.as_str()) != Some("assistant") {
                continue;
            }
            let Some(msg) = v.get("message") else { continue };
            let Some(usage) = msg.get("usage") else { continue };
            let model = msg.get("model").and_then(|m| m.as_str()).unwrap_or("unknown");
            if model == "<synthetic>" {
                continue;
            }
            let key = format!(
                "{}:{}",
                msg.get("id").and_then(|x| x.as_str()).unwrap_or(""),
                v.get("requestId").and_then(|x| x.as_str()).unwrap_or("")
            );
            if key != ":" && !seen.insert(key) {
                continue;
            }
            let Some(date) = v
                .get("timestamp")
                .and_then(|t| t.as_str())
                .and_then(|t| DateTime::parse_from_rfc3339(t).ok())
                .map(|t| t.with_timezone(&Local).date_naive())
            else {
                continue;
            };
            if date < since_date {
                continue;
            }
            let project = v
                .get("cwd")
                .and_then(|c| c.as_str())
                .map(|c| {
                    Path::new(c)
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_else(|| c.to_string())
                })
                .unwrap_or_else(|| "未知".into());

            let row = agg
                .entry((date.to_string(), model.to_string(), project.clone()))
                .or_insert_with(|| UsageRow {
                    date: date.to_string(),
                    model: model.to_string(),
                    project,
                    ..Default::default()
                });
            row.input += u(usage, "input_tokens");
            row.output += u(usage, "output_tokens");
            row.cache_read += u(usage, "cache_read_input_tokens");
            row.cache_write += u(usage, "cache_creation_input_tokens");
            // 1 小时缓存写入按 2 倍输入价计费，5 分钟缓存是 1.25 倍，单独记下来方便估算
            row.cache_write_1h += usage
                .get("cache_creation")
                .map(|c| u(c, "ephemeral_1h_input_tokens"))
                .unwrap_or(0);
            row.requests += 1;
        }
    }
    let mut rows: Vec<UsageRow> = agg.into_values().collect();
    rows.sort_by(|a, b| a.date.cmp(&b.date));
    rows
}

#[tauri::command]
pub async fn claude_code_usage(app: AppHandle, days: Option<u32>) -> Result<Vec<UsageRow>, String> {
    let home = app.path().home_dir().map_err(|e| e.to_string())?;
    let root = std::env::var("CLAUDE_CONFIG_DIR")
        .map(PathBuf::from)
        .unwrap_or_else(|_| home.join(".claude"))
        .join("projects");
    if !root.exists() {
        return Err(format!("未找到 Claude Code 日志目录：{}", root.display()));
    }
    let days = days.unwrap_or(30).clamp(1, 365);
    tauri::async_runtime::spawn_blocking(move || scan(root, days))
        .await
        .map_err(|e| e.to_string())
}
