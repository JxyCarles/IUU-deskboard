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
use tauri::window::Color;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

/// 桌面挂件模式：窗口置于最底层、不显示在任务栏
static DESKTOP_MODE: AtomicBool = AtomicBool::new(false);

/// 本次启动的窗口是否是透明窗口
static TRANSPARENT: AtomicBool = AtomicBool::new(false);

/// 只有“透明”壁纸需要透明窗口。透明窗口在 Windows 上调整大小时 WebView2 来不及重绘，
/// 内容会整片消失，所以平时用不透明窗口；透明属性只能在创建窗口时设置，切换后需要重启。
fn create_main_window(app: &AppHandle) -> tauri::Result<()> {
    let transparent = storage::wants_transparent(app);
    TRANSPARENT.store(transparent, Ordering::Relaxed);
    let mut b = WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
        .title("桌面看板")
        .inner_size(1180.0, 780.0)
        .min_inner_size(420.0, 360.0)
        .decorations(false)
        .center()
        .disable_drag_drop_handler();
    b = if transparent { b.transparent(true) } else { b.background_color(Color(27, 25, 48, 255)) };
    b.build()?;
    Ok(())
}

/// 挂件模式下的层级管理：每 250ms 看一次前台窗口是不是看板。
/// - 变成前台（点了看板、拖边框调整大小）：解除钉底并提到最前，按普通窗口操作；
/// - 不再是前台（点了别的程序）：钉回最底层。
/// 不用 WindowEvent::Focused，因为键盘焦点在 WebView 里时，切到别的程序经常收不到失焦事件。
/// 以前一直钉在底层时，点击看板的“提到前面”会被改写成“放到最底”，拖动调整大小时窗口就被压到其他窗口后面，看起来像消失了。
#[cfg(windows)]
fn watch_foreground(app: AppHandle) {
    use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
    std::thread::spawn(move || {
        let mut was_front = true;
        loop {
            std::thread::sleep(std::time::Duration::from_millis(250));
            if !DESKTOP_MODE.load(Ordering::Relaxed) {
                was_front = true;
                continue;
            }
            let Some(w) = main_window(&app) else { continue };
            let Ok(hwnd) = w.hwnd() else { continue };
            let front = unsafe { GetForegroundWindow() } == hwnd.0 as _;
            if front && !was_front {
                let _ = w.set_always_on_bottom(false);
                // 临时置顶再取消，相当于提到普通窗口的最前面
                let _ = w.set_always_on_top(true);
                let _ = w.set_always_on_top(false);
            } else if !front && was_front {
                let _ = w.set_always_on_bottom(true);
            }
            was_front = front;
        }
    });
}

#[tauri::command]
fn is_transparent_window() -> bool {
    TRANSPARENT.load(Ordering::Relaxed)
}

#[tauri::command]
fn restart_app(app: AppHandle) {
    let _ = app.save_window_state(state_flags());
    app.restart();
}

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
        // 当前正在操作窗口时先不压到底层，等失去焦点再压
        let _ = w.set_always_on_bottom(enabled && !is_front(&w));
        let _ = w.set_skip_taskbar(enabled);
    }
}

fn is_front(w: &WebviewWindow) -> bool {
    #[cfg(windows)]
    {
        use windows_sys::Win32::UI::WindowsAndMessaging::GetForegroundWindow;
        if let Ok(h) = w.hwnd() {
            return unsafe { GetForegroundWindow() } == h.0 as _;
        }
    }
    let _ = w;
    false
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
            create_main_window(app.handle())?;
            #[cfg(windows)]
            watch_foreground(app.handle().clone());
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
            _ => {}
        })
        .invoke_handler(tauri::generate_handler![
            set_desktop_mode,
            is_transparent_window,
            restart_app,
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
