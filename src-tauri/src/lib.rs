mod claude_code;
mod feeds;
mod github;
mod http;
mod providers;
mod secrets;
mod storage;
mod wallpaper;
mod we_scene;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WebviewWindow, WindowEvent};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

/// 桌面挂件模式：窗口置于最底层、不显示在任务栏
static DESKTOP_MODE: AtomicBool = AtomicBool::new(false);

/// 记住窗口大小、位置、是否最大化；不记“是否可见”，否则隐藏到托盘时退出，下次启动就看不见了
fn state_flags() -> StateFlags {
    StateFlags::all() & !StateFlags::VISIBLE & !StateFlags::DECORATIONS
}

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

/// 从托盘唤出。挂件模式下窗口平时在最底层，唤出时先临时提到前面，失去焦点后再放回底层
fn show_main(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let _ = w.unminimize();
        let _ = w.show();
        if DESKTOP_MODE.load(Ordering::Relaxed) {
            let _ = w.set_always_on_bottom(false);
        }
        let _ = w.set_focus();
    }
}

#[tauri::command]
fn set_desktop_mode(app: AppHandle, enabled: bool) {
    DESKTOP_MODE.store(enabled, Ordering::Relaxed);
    if let Some(w) = main_window(&app) {
        let _ = w.set_always_on_bottom(enabled);
        let _ = w.set_skip_taskbar(enabled);
    }
}

/// 标题栏的“最小化”。挂件模式下没有任务栏按钮，最小化后就找不回来了，所以改成隐藏到托盘
#[tauri::command]
fn minimize_main(app: AppHandle) {
    if let Some(w) = main_window(&app) {
        if DESKTOP_MODE.load(Ordering::Relaxed) {
            let _ = w.hide();
        } else {
            let _ = w.minimize();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::default().with_state_flags(state_flags()).build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .setup(|app| {
            let show = MenuItem::with_id(app, "show", "显示看板", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("桌面看板")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, e| match e.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => {
                        let _ = app.save_window_state(state_flags());
                        app.exit(0)
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, e| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = e
                    {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;
            Ok(())
        })
        .on_window_event(|window, event| match event {
            // 关闭窗口时隐藏到托盘，真正退出走托盘菜单；顺便保存窗口位置
            WindowEvent::CloseRequested { api, .. } => {
                api.prevent_close();
                let _ = window.app_handle().save_window_state(state_flags());
                let _ = window.hide();
            }
            WindowEvent::Focused(false) if DESKTOP_MODE.load(Ordering::Relaxed) => {
                let _ = window.set_always_on_bottom(true);
            }
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            set_desktop_mode,
            minimize_main,
            storage::load_data,
            storage::save_data,
            storage::data_dir,
            secrets::set_secret,
            secrets::has_secret,
            providers::fetch_deepseek,
            providers::fetch_glm_quota,
            providers::fetch_claude_cost,
            claude_code::claude_code_usage,
            feeds::fetch_feed,
            wallpaper::import_wallpaper,
            wallpaper::import_font,
            wallpaper::remove_wallpaper_files,
            github::github_trending,
            we_scene::we_scene,
        ])
        .run(tauri::generate_context!())
        .expect("启动桌面看板失败");
}
