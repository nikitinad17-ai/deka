// Windows: local Deka player and isolated VK source. Mobile retains its existing UI.
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
#[cfg(windows)]
const SOURCE_LINK: &str = include_str!("../../src/source-link.js");
const VK_URL: &str = "https://vk.ru/audio";
#[cfg(windows)]
const BROWSER_ARGS: &str = "--autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows";

fn require_local(caller: &tauri::WebviewWindow) -> Result<(), String> {
    if caller.label() != "main" { return Err("Команда доступна только плееру".into()); }
    let url = caller.url().map_err(|e| e.to_string())?;
    if !matches!(url.scheme(), "tauri" | "http" | "https") ||
        (url.scheme() != "tauri" && url.host_str() != Some("tauri.localhost")) {
        return Err("Команда запрещена для удалённой страницы".into());
    }
    Ok(())
}
#[tauri::command]
fn source_cmd(caller: tauri::WebviewWindow, app: tauri::AppHandle,
              cmd: serde_json::Value, request_id: Option<String>) -> Result<(), String> {
    require_local(&caller)?;
    let allowed = ["ping", "sync", "cancelCollect", "playKey", "play", "pause", "stop",
        "toggle", "volume", "rate", "seek", "skip", "next", "prev", "diag"];
    let kind = cmd.get("type").and_then(|v| v.as_str()).ok_or("Нет команды")?;
    if !allowed.contains(&kind) || cmd.to_string().len() > 4096 { return Err("Неверная команда".into()); }
    let source = app.get_webview_window("vk").ok_or("Источник VK не создан")?;
    let url = source.url().map_err(|e| e.to_string())?;
    let host = url.host_str().unwrap_or("");
    if url.scheme() != "https" || !(host == "vk.ru" || host.ends_with(".vk.ru") || host == "vk.com" || host.ends_with(".vk.com") || host == "vkvideo.ru" || host.ends_with(".vkvideo.ru")) {
        return Err("Источник вне VK".into());
    }
    // Hidden WebView2 reports document.hidden to VK. Timer flags do not make
    // a hidden page visible. Keep its real viewport alive for native lazy loading.
    #[cfg(windows)]
    if matches!(kind, "sync" | "playKey") {
        source.unminimize().map_err(|e| e.to_string())?;
        source.show().map_err(|e| e.to_string())?;
        let _ = caller.set_focus();
    }
    let id = serde_json::to_string(&request_id).map_err(|e| e.to_string())?;
    source.eval(&format!("window.DekaSource && window.DekaSource.receive({}, {});", cmd, id)).map_err(|e| e.to_string())
}
#[tauri::command]
fn source_show(caller: tauri::WebviewWindow, app: tauri::AppHandle, show: bool, keep_visible: Option<bool>) -> Result<(), String> {
    require_local(&caller)?;
    let source = app.get_webview_window("vk").ok_or("Источник VK не создан")?;
    if show { source.show().map_err(|e| e.to_string())?; let _ = source.set_focus(); }
    else { if !keep_visible.unwrap_or(false) { source.hide().map_err(|e| e.to_string())?; } let _ = caller.set_focus(); }
    Ok(())
}
#[tauri::command]
fn source_video(caller: tauri::WebviewWindow, app: tauri::AppHandle, url: String) -> Result<(), String> {
    require_local(&caller)?;
    let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
    if parsed.scheme() != "https" || parsed.host_str() != Some("vkvideo.ru") ||
        !parsed.path().starts_with("/video") || !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Нужна ссылка VK Видео".into());
    }
    let w = app.get_webview_window("vk").ok_or("Источник не создан")?;
    w.navigate(parsed).map_err(|e| e.to_string())?;
    w.show().map_err(|e| e.to_string())?;
    let _ = w.set_focus();
    Ok(())
}
#[tauri::command]
fn vk_show(caller: tauri::WebviewWindow, app: tauri::AppHandle, show: bool) -> Result<(), String> {
    #[cfg(windows)]
    require_local(&caller)?;
    #[cfg(not(windows))]
    let _ = caller;
    let w = app.get_webview_window("main").ok_or("окно не создано")?;
    #[cfg(desktop)]
    if show { w.show().map_err(|e| e.to_string())?; let _ = w.set_focus(); }
    #[cfg(mobile)]
    let _ = (w, show);
    Ok(())
}
#[tauri::command]
fn vk_cmd(caller: tauri::WebviewWindow, app: tauri::AppHandle, cmd: serde_json::Value) -> Result<(), String> {
    #[cfg(windows)]
    require_local(&caller)?;
    #[cfg(not(windows))]
    let _ = caller;
    let w = app.get_webview_window("main").ok_or("окно не создано")?;
    w.eval(&format!("window.__deka && window.__deka.cmd({});", cmd)).map_err(|e| e.to_string())
}
#[tauri::command]
fn vk_reload(caller: tauri::WebviewWindow, app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    require_local(&caller)?;
    #[cfg(not(windows))]
    let _ = caller;
    let w = app.get_webview_window("main").ok_or("окно не создано")?;
    w.eval(&format!("location.href = {:?};", VK_URL)).map_err(|e| e.to_string())
}
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(windows)]
            {
                WebviewWindowBuilder::new(app, "main", WebviewUrl::App("desktop.html".into()))
                    .title("Дека 2 · 0.2.5").inner_size(1200.0, 760.0).min_inner_size(720.0, 480.0)
                    .additional_browser_args(BROWSER_ARGS).build()?;
                let script = [VK_SESSION, LIBRARY_CORE, VK_BRIDGE, MIXER_POLICY, LIBRARY_RUNTIME, SOURCE_LINK].join("\n;\n");
                WebviewWindowBuilder::new(app, "vk", WebviewUrl::External(VK_URL.parse().unwrap()))
                    .title("Вход VK — Дека 2").inner_size(1100.0, 760.0).visible(false)
                    .initialization_script(script).additional_browser_args(BROWSER_ARGS).build()?;
            }
            #[cfg(not(windows))]
            {
                let script = [VK_SESSION, LIBRARY_CORE, DECK_ENGINE, VK_BRIDGE, MIXER_POLICY, LIBRARY_RUNTIME, VIRTUAL_LIST, EXTRA_CONTROLS, MOBILE_OVERLAY].join("\n;\n");
                let builder = WebviewWindowBuilder::new(app, "main", WebviewUrl::External(VK_URL.parse().unwrap()))
                    .title("Дека 2").initialization_script(script);
                #[cfg(desktop)]
                let builder = builder.inner_size(1200.0, 760.0).min_inner_size(640.0, 360.0);
                builder.build()?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "vk" { api.prevent_close(); let _ = window.hide(); }
                else { window.app_handle().exit(0); }
            }
        })
        .invoke_handler(tauri::generate_handler![source_cmd, source_show, source_video, vk_show, vk_cmd, vk_reload])
        .run(tauri::generate_context!()).expect("не удалось запустить Деку 2");
}
