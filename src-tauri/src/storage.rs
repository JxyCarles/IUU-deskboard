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
