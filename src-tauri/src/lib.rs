// Windows: local player + VK window. Android: VK with Deka's isolated UI overlay.
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};

const VK_BRIDGE: &str = include_str!("../../src/vk-bridge.js");
const LIBRARY_CORE: &str = include_str!("../../src/library-engine.js");
const LIBRARY_RUNTIME: &str = include_str!("../../src/library-runtime.js");
const SET_CORE: &str = include_str!("../../src/set-core.js");
#[cfg(mobile)]
const DECK_ENGINE: &str = include_str!("../../src/deck-engine.js");
#[cfg(mobile)]
const VIRTUAL_LIST: &str = include_str!("../../src/virtual-list.js");
#[cfg(mobile)]
const MOBILE_OVERLAY: &str = include_str!("../../src/mobile-overlay.js");
const VK_URL: &str = "https://vk.ru/audio";
#[cfg(windows)]
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion,IntensiveWakeUpThrottling --autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows";

// Same separation as the working APK: plain VK login, shared default cookie profile,
// then return the music WebView to the full personal collection. No scripts in login.
#[tauri::command]
async fn vk_login(app: tauri::AppHandle, window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" { return Err("недоступно".into()); }
    #[cfg(desktop)]
    {
        if let Some(w) = app.get_webview_window("vk-login") {
            w.show().map_err(|e| e.to_string())?;
            return w.set_focus().map_err(|e| e.to_string());
        }
        let builder = WebviewWindowBuilder::new(&app, "vk-login", WebviewUrl::External("https://vk.ru/login".parse().unwrap()))
            .title("Вход в VK · Дека").inner_size(900.0, 760.0);
        // WebView2 windows sharing a cookie profile must use the same browser-process
        // options. These flags do not inject Deka UI, alter the UA or inspect login input.
        #[cfg(windows)]
        let builder = builder.additional_browser_args(BROWSER_ARGS);
        builder.build().map_err(|e| e.to_string())?;
        // Reading WebView2 cookies from an event callback can deadlock. Poll off the UI thread.
        std::thread::spawn(move || {
            for _ in 0..600 {
                std::thread::sleep(std::time::Duration::from_secs(1));
                let Some(login) = app.get_webview_window("vk-login") else { break; };
                let Ok(url) = login.url() else { continue; };
                let host = url.host_str().unwrap_or("");
                if !["vk.ru", "m.vk.ru", "vk.com", "m.vk.com"].contains(&host) { continue; }
                if ["/login", "/auth", "/join", "/restore", "/challenge", "/verify", "/blank.php"].iter().any(|p| url.path().starts_with(p)) { continue; }
                let Ok(cookies) = login.cookies_for_url(url.clone()) else { continue; };
                if !cookies.iter().any(|c| ["remixsid", "remixnsid"].contains(&c.name()) && c.value().len() > 8 && c.value() != "DELETED") { continue; }
                if let Some(vk) = app.get_webview_window("vk") {
                    let mut music = url.clone();
                    music.set_path("/audio"); music.set_query(None); music.set_fragment(Some("deka-library=collect"));
                    let _ = vk.navigate(music);
                }
                let _ = app.emit_to("main", "vk:login-complete", ());
                let _ = login.close();
                break;
            }
        });
        return Ok(());
    }
    #[cfg(mobile)]
    { let _ = app; Err("Вход Android выполняется через встроенное окно".into()) }
}

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
fn vk_cmd(app: tauri::AppHandle, window: tauri::WebviewWindow, cmd: serde_json::Value) -> Result<(), String> {
    if window.label() != "main" { return Err("недоступно".into()); }
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

// Android WebView не умеет открывать intent:// и ссылки приложений (vkontakte:// и т. п.):
// такой переход молча пропадает, и кнопка «не нажимается». intent:// с запасной веб-ссылкой
// открываем по ней, остальные не-веб ссылки не трогаем и записываем в журнал входа.
#[cfg(mobile)]
fn mobile_navigation(app: &tauri::AppHandle, url: &tauri::Url) -> bool {
    match url.scheme() {
        "http" | "https" | "about" | "data" | "blob" | "javascript" | "tauri" | "ipc" | "asset" => return true,
        _ => {}
    }
    let fallback = if url.scheme() == "intent" { intent_fallback(url.as_str()) } else { None };
    if let Some(w) = app.get_webview_window("main") {
        let note = serde_json::to_string(&format!("{}: {}", if fallback.is_some() { "intent → веб" } else { "не открыть" }, url.scheme()))
            .unwrap_or_else(|_| "\"\"".into());
        let _ = w.eval(&format!("window.__dekaLog && window.__dekaLog({})", note));
        if let Some(target) = fallback {
            if let Ok(target) = serde_json::to_string(&target) {
                let _ = w.eval(&format!("location.assign({})", target));
            }
        }
    }
    false
}

// S.browser_fallback_url из intent://…#Intent;…;S.browser_fallback_url=https%3A%2F%2F…;end
#[cfg(mobile)]
fn intent_fallback(raw: &str) -> Option<String> {
    let fragment = raw.split_once("#Intent;")?.1;
    let value = fragment.split(';').find_map(|part| part.strip_prefix("S.browser_fallback_url="))?;
    let decoded = percent_decode(value);
    let parsed = tauri::Url::parse(&decoded).ok()?;
    if parsed.scheme() == "https" || parsed.scheme() == "http" { Some(parsed.to_string()) } else { None }
}

#[cfg(mobile)]
fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(h), Some(l)) = ((bytes[i + 1] as char).to_digit(16), (bytes[i + 2] as char).to_digit(16)) {
                out.push((h * 16 + l) as u8);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            #[cfg(desktop)]
            {
                let script = [LIBRARY_CORE, SET_CORE, VK_BRIDGE, LIBRARY_RUNTIME].join("\n;\n");
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
                let script = [LIBRARY_CORE, DECK_ENGINE, SET_CORE, VK_BRIDGE, LIBRARY_RUNTIME, VIRTUAL_LIST, MOBILE_OVERLAY].join("\n;\n");
                let handle = app.handle().clone();
                WebviewWindowBuilder::new(app, "main", WebviewUrl::External(VK_URL.parse().unwrap()))
                    .initialization_script(script)
                    .on_navigation(move |url| mobile_navigation(&handle, url))
                    .build()?;
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
        .invoke_handler(tauri::generate_handler![vk_show, vk_cmd, vk_reload, vk_login, save_export, show_export])
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение");
}
