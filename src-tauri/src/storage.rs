//! 全部业务数据存成一个 JSON 文件（%APPDATA%\com.iuu.deskboard\data.json）。
//! 写入时先写临时文件再改名，避免写一半断电导致数据损坏。

use std::fs;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

fn data_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("data.json"))
}

/// 启动时读取：当前壁纸是否为“透明”模式（决定窗口是否创建为透明窗口）
pub fn wants_transparent(app: &AppHandle) -> bool {
    data_path(app)
        .ok()
        .and_then(|p| fs::read_to_string(p).ok())
        .and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok())
        .and_then(|v| v.pointer("/settings/background/kind").and_then(|k| k.as_str()).map(|k| k == "transparent"))
        .unwrap_or(false)
}

#[tauri::command]
pub fn load_data(app: AppHandle) -> Result<Option<String>, String> {
    let path = data_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    fs::read_to_string(path).map(Some).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn save_data(app: AppHandle, data: String) -> Result<(), String> {
    let path = data_path(&app)?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, data).map_err(|e| e.to_string())?;
    fs::rename(&tmp, &path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn data_dir(app: AppHandle) -> Result<String, String> {
    Ok(data_path(&app)?
        .parent()
        .map(|p| p.display().to_string())
        .unwrap_or_default())
}

/// 批量导入前备份一份 data.json 到 backups/，返回备份文件路径
#[tauri::command]
pub fn backup_data(app: AppHandle, tag: String) -> Result<String, String> {
    let path = data_path(&app)?;
    let dir = path.parent().unwrap().join("backups");
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S");
    let safe: String = tag.chars().filter(|c| c.is_alphanumeric() || *c == '-').collect();
    let dest = dir.join(format!("data-{stamp}-{safe}.json"));
    if path.exists() {
        fs::copy(&path, &dest).map_err(|e| e.to_string())?;
    }
    Ok(dest.display().to_string())
}
