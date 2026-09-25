//! API Key 存在 Windows 凭据管理器里，不进 data.json，也不回传给前端。

const SERVICE: &str = "com.iuu.deskboard";

fn entry(name: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(SERVICE, name).map_err(|e| e.to_string())
}

/// 供后端请求使用，读取已保存的密钥
pub fn get(name: &str) -> Result<String, String> {
    entry(name)?.get_password().map_err(|e| match e {
        keyring::Error::NoEntry => "尚未填写 API Key".to_string(),
        e => e.to_string(),
    })
}

/// value 为空表示删除
#[tauri::command]
pub fn set_secret(name: String, value: String) -> Result<(), String> {
    let e = entry(&name)?;
    let value = value.trim();
    if value.is_empty() {
        match e.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(err.to_string()),
        }
    } else {
        e.set_password(value).map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn has_secret(name: String) -> bool {
    entry(&name)
        .and_then(|e| e.get_password().map_err(|e| e.to_string()))
        .is_ok()
}
