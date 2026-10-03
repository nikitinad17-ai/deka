// Windows: local player + VK window. Android: VK with Deka's isolated UI overlay.
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const VK_BRIDGE: &str = include_str!("../../src/vk-bridge.js");
const LIBRARY_CORE: &str = include_str!("../../src/library-engine.js");
const LIBRARY_RUNTIME: &str = include_str!("../../src/library-runtime.js");
#[cfg(mobile)]
const DECK_ENGINE: &str = include_str!("../../src/deck-engine.js");
#[cfg(mobile)]
const VIRTUAL_LIST: &str = include_str!("../../src/virtual-list.js");
#[cfg(mobile)]
const MOBILE_OVERLAY: &str = include_str!("../../src/mobile-overlay.js");
const VK_URL: &str = "https://vk.ru/audio";
#[cfg(windows)]
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion,IntensiveWakeUpThrottling --autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows";

#[tauri::command]
fn vk_show(app: tauri::AppHandle, show: bool) -> Result<(), String> {
    let w = app.get_webview_window("vk").ok_or("окно ВК не создано")?;
    #[cfg(desktop)]
    {
        if show {
            w.show().map_err(|e| e.to_string())?;
            let _ = w.unminimize();
            let _ = w.set_focus();
        } else {
            w.hide().map_err(|e| e.to_string())?;
        }
    }
    #[cfg(mobile)]
    let _ = (w, show);
    Ok(())
}

#[tauri::command]
fn vk_cmd(app: tauri::AppHandle, cmd: serde_json::Value) -> Result<(), String> {
    let w = app.get_webview_window("vk").ok_or("окно ВК не создано")?;
    let js = format!("window.__deka && window.__deka.cmd({});", cmd);
    w.eval(&js).map_err(|e| e.to_string())
}

#[tauri::command]
fn vk_reload(app: tauri::AppHandle) -> Result<(), String> {
    let w = app.get_webview_window("vk").ok_or("окно ВК не создано")?;
    w.eval(&format!("location.href = {:?};", VK_URL)).map_err(|e| e.to_string())
}

static LAST_EXPORT: std::sync::Mutex<Option<std::path::PathBuf>> = std::sync::Mutex::new(None);

#[tauri::command]
fn save_export(app: tauri::AppHandle, window: tauri::WebviewWindow, name: String, content: String) -> Result<String, String> {
    if window.label() != "main" { return Err("недоступно".into()); }
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    let safe: String = name.chars().filter(|c| c.is_ascii_alphanumeric() || "-_.".contains(*c)).collect();
    let safe = if safe.ends_with(".csv") { safe } else { format!("{}.csv", safe) };
    let path = dir.join(safe);
    let mut data = vec![0xEF, 0xBB, 0xBF];
    data.extend_from_slice(content.as_bytes());
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    *LAST_EXPORT.lock().map_err(|e| e.to_string())? = Some(path.clone());
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn show_export(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" { return Err("недоступно".into()); }
    let path = LAST_EXPORT.lock().map_err(|e| e.to_string())?.clone().ok_or("файл ещё не сохранён")?;
    #[cfg(windows)]
    std::process::Command::new("explorer").arg(format!("/select,{}", path.display())).spawn().map_err(|e| e.to_string())?;
    #[cfg(not(windows))]
    let _ = path;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            {
                let script = [LIBRARY_CORE, VK_BRIDGE, LIBRARY_RUNTIME].join("\n;\n");
                let builder = WebviewWindowBuilder::new(app, "vk", WebviewUrl::External(VK_URL.parse().unwrap()))
                    .title("ВКонтакте · Дека").inner_size(1100.0, 760.0).visible(false)
                    .initialization_script(script);
                #[cfg(windows)]
                let builder = builder.additional_browser_args(BROWSER_ARGS);
                builder.build()?;
            }
            #[cfg(mobile)]
            {
                // One script guarantees ordering. Native audio play is captured BEFORE the VK hook.
                let script = [LIBRARY_CORE, DECK_ENGINE, VK_BRIDGE, LIBRARY_RUNTIME, VIRTUAL_LIST, MOBILE_OVERLAY].join("\n;\n");
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(VK_URL.parse().unwrap()))
                    .initialization_script(script).build()?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "vk" {
                    api.prevent_close();
                    #[cfg(desktop)]
                    let _ = window.hide();
                } else if window.label() == "main" { window.app_handle().exit(0); }
            }
        })
        .invoke_handler(tauri::generate_handler![vk_show, vk_cmd, vk_reload, save_export, show_export])
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение");
}
