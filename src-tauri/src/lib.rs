// Deka 2 is a separate application. Both platforms use the same two-deck UI.
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
const MIXER_POLICY: &str = include_str!("../../src/vk-mixer-policy.js");
const VK_SESSION: &str = include_str!("../../src/vk-session.js");
const EXTRA_CONTROLS: &str = include_str!("../../src/player-controls.js");
const LIBRARY_CORE: &str = include_str!("../../src/library-engine.js");
const DECK_ENGINE: &str = include_str!("../../src/deck-engine.js");
const VK_BRIDGE: &str = include_str!("../../src/vk-bridge.js");
const LIBRARY_RUNTIME: &str = include_str!("../../src/library-runtime.js");
const VIRTUAL_LIST: &str = include_str!("../../src/virtual-list.js");
const MOBILE_OVERLAY: &str = include_str!("../../src/mobile-overlay.js");
const VK_URL: &str = "https://vk.ru/audio";
#[cfg(windows)]
const BROWSER_ARGS: &str = "--autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows";

#[tauri::command]
fn vk_show(app: tauri::AppHandle, show: bool) -> Result<(), String> {
    let w = app.get_webview_window("main").ok_or("окно не создано")?;
    #[cfg(desktop)]
    if show { w.show().map_err(|e| e.to_string())?; let _ = w.set_focus(); }
    #[cfg(mobile)]
    let _ = (w, show);
    Ok(())
}
#[tauri::command]
fn vk_cmd(app: tauri::AppHandle, cmd: serde_json::Value) -> Result<(), String> {
    let w = app.get_webview_window("main").ok_or("окно не создано")?;
    w.eval(&format!("window.__deka && window.__deka.cmd({});", cmd)).map_err(|e| e.to_string())
}
#[tauri::command]
fn vk_reload(app: tauri::AppHandle) -> Result<(), String> {
    let w = app.get_webview_window("main").ok_or("окно не создано")?;
    w.eval(&format!("location.href = {:?};", VK_URL)).map_err(|e| e.to_string())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            // Capture native play before the VK hook, then mount the shared interface.
            let script = [VK_SESSION, LIBRARY_CORE, DECK_ENGINE, VK_BRIDGE, MIXER_POLICY, LIBRARY_RUNTIME, VIRTUAL_LIST, EXTRA_CONTROLS, MOBILE_OVERLAY].join("\n;\n");
            let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(VK_URL.parse().unwrap()))
                .title("Дека 2")
                .initialization_script(script);
            #[cfg(desktop)]
            let builder = builder.inner_size(1200.0, 760.0).min_inner_size(640.0, 360.0);
            #[cfg(windows)]
            let builder = builder.additional_browser_args(BROWSER_ARGS);
            builder.build()?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { .. } = event { window.app_handle().exit(0); }
        })
        .invoke_handler(tauri::generate_handler![vk_show, vk_cmd, vk_reload])
        .run(tauri::generate_context!())
        .expect("не удалось запустить Деку 2");
}
