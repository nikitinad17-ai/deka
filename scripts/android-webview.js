// Настраивает WebView в Android-проекте, который Tauri генерирует в CI:
// звук и видео могут стартовать без отдельного касания (нужно для «Сетов»
// и треков, открытых по ссылке, где страница перезагружается).
// Плюс мост DekaAndroid.keepAwake(true/false): пока играет музыка,
// экран не гаснет сам и телефон не уходит в спящий режим.
const fs = require("fs");
const path = require("path");

function find(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { const r = find(p); if (r) return r; }
    else if (e.name === "MainActivity.kt") return p;
  }
  return null;
}

const base = path.join(__dirname, "..", "src-tauri", "gen", "android", "app", "src", "main");
const file = find(base);
if (!file) { console.error("MainActivity.kt не найден"); process.exit(1); }
let s = fs.readFileSync(file, "utf8");
if (s.includes("mediaPlaybackRequiresUserGesture")) { console.log("WebView уже настроен"); process.exit(0); }

const override = `
  override fun onWebViewCreate(webView: android.webkit.WebView) {
    super.onWebViewCreate(webView)
    webView.settings.mediaPlaybackRequiresUserGesture = false
    webView.addJavascriptInterface(object {
      @android.webkit.JavascriptInterface
      fun keepAwake(on: Boolean) {
        runOnUiThread {
          val f = android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
          if (on) window.addFlags(f) else window.clearFlags(f)
        }
      }
    }, "DekaAndroid")
  }
`;
const withBody = /class MainActivity\s*:\s*TauriActivity\(\)\s*\{/;
const noBody = /class MainActivity[ \t]*:[ \t]*TauriActivity\(\)[ \t]*$/m;
if (withBody.test(s)) s = s.replace(withBody, (m) => m + override);
else if (noBody.test(s)) s = s.replace(noBody, (m) => m + " {" + override + "}");
else { console.error("Не узнал формат MainActivity.kt:\n" + s); process.exit(1); }
fs.writeFileSync(file, s);
console.log("WebView: звук без касания и «не гасить экран» включены\n" + s);
