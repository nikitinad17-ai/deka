// На телефоне (Android) у приложения одно окно, поэтому окно ВК и всё, что с ним связано,
// собирается только для компьютера (cfg(desktop)).
use tauri::{Manager, WindowEvent};
#[cfg(desktop)]
use tauri::{WebviewUrl, WebviewWindowBuilder};

/// Скрипт-мост, который встраивается в страницу vk.ru до загрузки её собственных скриптов.
#[cfg(desktop)]
const VK_BRIDGE: &str = include_str!("../../src/vk-bridge.js");
const VK_URL: &str = "https://vk.ru/audio";
#[cfg(windows)]
const BROWSER_ARGS: &str = "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection,CalculateNativeWinOcclusion,IntensiveWakeUpThrottling --autoplay-policy=no-user-gesture-required --disable-background-timer-throttling --disable-renderer-backgrounding --disable-backgrounding-occluded-windows";

/// Показать или скрыть окно ВК (в нём вы входите в аккаунт и видите сайт как обычно).
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

/// Передать команду скрипту-мосту в окне ВК (play, pause, next, seek, playRow …).
#[tauri::command]
fn vk_cmd(app: tauri::AppHandle, cmd: serde_json::Value) -> Result<(), String> {
    let w = app.get_webview_window("vk").ok_or("окно ВК не создано")?;
    // serde_json::Value сериализуется в корректный JS-литерал, поэтому подстановка безопасна.
    let js = format!("window.__deka && window.__deka.cmd({});", cmd);
    w.eval(&js).map_err(|e| e.to_string())
}

/// Перезагрузить страницу ВК (если сайт завис или поменялась вёрстка).
#[tauri::command]
fn vk_reload(app: tauri::AppHandle) -> Result<(), String> {
    let w = app.get_webview_window("vk").ok_or("окно ВК не создано")?;
    w.eval(&format!("location.href = {:?};", VK_URL))
        .map_err(|e| e.to_string())
}

/// Последний сохранённый файл экспорта (для кнопки «Показать файл»).
static LAST_EXPORT: std::sync::Mutex<Option<std::path::PathBuf>> = std::sync::Mutex::new(None);

/// Сохранить список треков в папку «Загрузки». Доступно только окну плеера.
#[tauri::command]
fn save_export(
    app: tauri::AppHandle,
    window: tauri::WebviewWindow,
    name: String,
    content: String,
) -> Result<String, String> {
    if window.label() != "main" {
        return Err("недоступно".into());
    }
    let dir = app.path().download_dir().map_err(|e| e.to_string())?;
    // В имени файла оставляем только безопасные символы, путь задаёт приложение.
    let safe: String = name
        .chars()
        .filter(|c| c.is_ascii_alphanumeric() || "-_.".contains(*c))
        .collect();
    let safe = if safe.ends_with(".csv") { safe } else { format!("{}.csv", safe) };
    let path = dir.join(safe);
    // BOM, чтобы Excel сразу открыл кириллицу правильно.
    let mut data = vec![0xEF, 0xBB, 0xBF];
    data.extend_from_slice(content.as_bytes());
    std::fs::write(&path, data).map_err(|e| e.to_string())?;
    *LAST_EXPORT.lock().unwrap() = Some(path.clone());
    Ok(path.to_string_lossy().into_owned())
}

/// Открыть «Загрузки» с выделенным файлом экспорта.
#[tauri::command]
fn show_export(window: tauri::WebviewWindow) -> Result<(), String> {
    if window.label() != "main" {
        return Err("недоступно".into());
    }
    let path = LAST_EXPORT.lock().unwrap().clone().ok_or("файл ещё не сохранён")?;
    #[cfg(windows)]
    std::process::Command::new("explorer")
        .arg(format!("/select,{}", path.display()))
        .spawn()
        .map_err(|e| e.to_string())?;
    #[cfg(not(windows))]
    let _ = path;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| {
            #[cfg(desktop)]
            {
            let app = _app;
            let builder =
                WebviewWindowBuilder::new(app, "vk", WebviewUrl::External(VK_URL.parse().unwrap()))
                    .title("ВКонтакте · Дека")
                    .inner_size(1100.0, 760.0)
                    .visible(false)
                    .initialization_script(VK_BRIDGE);
            // Аргументы WebView2:
            // * autoplay-policy: иначе звук, запущенный кликом из окна «Деки», блокируется;
            // * отключение фонового троттлинга: скрытое окно ВК иначе еле подгружает трек
            //   и зависает на 0:00.
            // Аргументы должны совпадать с окном плеера (tauri.conf.json), иначе второе окно не создастся.
            #[cfg(windows)]
            let builder = builder.additional_browser_args(BROWSER_ARGS);
            builder.build()?;
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "vk" {
                    // Окно ВК не закрываем, а прячем: музыка продолжает играть.
                    api.prevent_close();
                    #[cfg(desktop)]
                    let _ = window.hide();
                } else if window.label() == "main" {
                    window.app_handle().exit(0);
                }
            }
        })
        .invoke_handler(tauri::generate_handler![vk_show, vk_cmd, vk_reload, save_export, show_export])
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение");
}
