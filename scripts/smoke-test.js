const fs = require("fs");
const os = require("os");
const path = require("path");
const cp = require("child_process");

const root = path.join(__dirname, "..");
let passed = 0;

function file(p) {
  return fs.readFileSync(path.join(root, p), "utf8");
}

function check(condition, message) {
  if (!condition) throw new Error("FAIL: " + message);
  passed++;
  console.log("✓ " + message);
}

function syntax(rel) {
  cp.execFileSync(process.execPath, ["--check", path.join(root, rel)], { stdio: "pipe" });
  check(true, "синтаксис " + rel);
}

// JavaScript, который реально попадает в приложение.
[
  "src/vk-bridge.js",
  "src/mobile-overlay.js",
  "scripts/android-webview.js",
  "scripts/android-sign.js"
].forEach(syntax);

// Проверяем inline JS основного интерфейса.
const html = file("src/index.html");
const blocks = Array.from(html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi));
check(blocks.length > 0, "в src/index.html найден inline JS");
const tmpScripts = fs.mkdtempSync(path.join(os.tmpdir(), "deka-js-"));
try {
  blocks.forEach((m, i) => {
    const p = path.join(tmpScripts, "inline-" + i + ".js");
    fs.writeFileSync(p, m[1]);
    cp.execFileSync(process.execPath, ["--check", p], { stdio: "pipe" });
  });
  check(true, "синтаксис inline JS src/index.html");
} finally {
  fs.rmSync(tmpScripts, { recursive: true, force: true });
}

// Версия должна совпадать во всех трёх местах.
const pkg = JSON.parse(file("package.json"));
const cargo = file("src-tauri/Cargo.toml").match(/^version\s*=\s*"([^"]+)"/m);
const tauri = JSON.parse(file("src-tauri/tauri.conf.json"));
check(!!cargo, "версия найдена в Cargo.toml");
check(pkg.version === cargo[1] && pkg.version === tauri.version, "версии package/Cargo/Tauri совпадают");

// Секреты подписи не должны возвращаться в рабочее дерево.
check(!fs.existsSync(path.join(root, "android", "signing.json")), "android/signing.json отсутствует");
check(!fs.existsSync(path.join(root, "android", "deka-release.p12")), "Android keystore отсутствует");
const ignore = file(".gitignore");
check(ignore.includes("android/*.p12") && ignore.includes("android/signing.json"), ".gitignore защищает signing-файлы");
const sign = file("scripts/android-sign.js");
check(sign.includes("ANDROID_KEYSTORE_PASSWORD") && !sign.includes('android", "signing.json'), "android-sign.js читает подпись из окружения");

// Критические инварианты VK/очереди.
const mobile = file("src/mobile-overlay.js");
check(mobile.includes('cmd({ type: "playKey"'), "очередь Деки запускает конкретный VK-трек");
check(mobile.includes('cmd({ type: "collectMy"'), "«Весь список» идёт через collectMy");
check(mobile.includes("keepAwake(playing)"), "состояние воспроизведения управляет Android background guard");
const bridge = file("src/vk-bridge.js");
check(bridge.includes("[data-testid='MusicTrackRow']"), "основной селектор VK присутствует");
check(bridge.includes("function findAndPlay"), "поиск отсутствующего трека прокруткой присутствует");
check(bridge.includes('case "collectMy"'), "команда collectMy присутствует");
check(!/\bfetch\s*\(/.test(bridge) && !/XMLHttpRequest/.test(bridge), "VK-мост не отправляет сетевые запросы сам");

// Проверяем генератор Android не строковым поиском, а на маленьком фальш-проекте.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "deka-android-"));
try {
  const main = path.join(tmp, "app", "src", "main");
  const java = path.join(main, "java", "ru", "volna", "player");
  fs.mkdirSync(java, { recursive: true });
  fs.writeFileSync(
    path.join(java, "MainActivity.kt"),
    [
      "package ru.volna.player",
      "",
      "import app.tauri.TauriActivity",
      "",
      "class MainActivity : TauriActivity()",
      ""
    ].join("\n")
  );
  fs.writeFileSync(
    path.join(main, "AndroidManifest.xml"),
    '<manifest xmlns:android="http://schemas.android.com/apk/res/android">\n' +
    '  <application android:label="Deka">\n' +
    '    <activity android:name=".MainActivity" />\n' +
    '  </application>\n' +
    '</manifest>\n'
  );

  const env = { ...process.env, DEKA_ANDROID_MAIN_DIR: main };
  cp.execFileSync(process.execPath, [path.join(root, "scripts", "android-webview.js")], { env, stdio: "pipe" });
  // Второй запуск обязан быть идемпотентным.
  cp.execFileSync(process.execPath, [path.join(root, "scripts", "android-webview.js")], { env, stdio: "pipe" });

  const activity = fs.readFileSync(path.join(java, "MainActivity.kt"), "utf8");
  const service = fs.readFileSync(path.join(java, "DekaPlaybackService.kt"), "utf8");
  const manifest = fs.readFileSync(path.join(main, "AndroidManifest.xml"), "utf8");

  check(activity.includes("startForegroundService") && activity.includes("DekaPlaybackService"), "MainActivity запускает playback service");
  check(!activity.includes("FLAG_KEEP_SCREEN_ON"), "экран больше не удерживается принудительно включённым");
  check(service.includes("PARTIAL_WAKE_LOCK"), "service держит PARTIAL_WAKE_LOCK");
  check(service.includes("FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK"), "service объявлен как media playback");
  check(manifest.includes("android.permission.WAKE_LOCK"), "manifest содержит WAKE_LOCK");
  check(manifest.includes("android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK"), "manifest содержит media playback permission");
  check(manifest.includes('android:foregroundServiceType="mediaPlayback"'), "manifest содержит foregroundServiceType=mediaPlayback");
  check((manifest.match(/DekaPlaybackService/g) || []).length === 1, "патч Android идемпотентен");
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log("\nSmoke tests: " + passed + " проверок пройдено.");
