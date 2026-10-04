// Deterministic, idempotent branding of the inherited UI. Never touches other apps.
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
function walk(dir) {
  return fs.readdirSync(dir, {withFileTypes: true}).flatMap(e => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : [p];
  });
}
for (const dir of ['src', 'tests']) {
  for (const file of walk(path.join(root, dir))) {
    if (!/\.(js|html|py)$/.test(file)) continue;
    // Do not rewrite the isolation test's forbidden-literal assertions.
    if (file.endsWith('app-identity.test.js')) continue;
    let before = fs.readFileSync(file, 'utf8');
    let after = before.replaceAll('deka:', 'deka2:')
      .replaceAll('volna:', 'deka2-legacy:')
      .replaceAll('deka-overlay', 'deka2-overlay')
      .replaceAll('<span class="brand">ДЕКА</span>', '<span class="brand">ДЕКА 2</span>')
      .replaceAll('<title>Дека</title>', '<title>Дека 2</title>')
      .replaceAll('>Дека</button>', '>Дека 2</button>');
    if (after !== before) fs.writeFileSync(file, after);
  }
}
// The inherited local fallback page must not inject synthetic songs into any list.
// The live two-deck UI does not use that demo page, but it is still packaged as an asset.
const legacy = path.join(root, 'src/index.html');
let legacyBefore = fs.readFileSync(legacy, 'utf8');
let legacyAfter = legacyBefore.replace(/  \/\/ ---------- demo tracks \(synthesized locally\) ----------[\s\S]*?(?=  \/\/ ---------- playlist ----------)/, '');
legacyAfter = legacyAfter.replace('if (!t.url){ setState("ЗАГРУЗКА"); setMarquee("СИНТЕЗ ДЕМО-ТРЕКА…"); t.url = await renderDemo(t.demo); }',
  'if (!t.url){ setState("НЕТ ФАЙЛА"); setMarquee("ДОБАВЬТЕ СВОЙ АУДИОФАЙЛ"); return; }');
if (legacyAfter !== legacyBefore) fs.writeFileSync(legacy, legacyAfter);
const native = path.join(root, 'scripts/android-webview.js');
let before = fs.readFileSync(native, 'utf8');
let after = before.replaceAll('ru.volna.player.action.', 'ru.deka2.player.action.')
  .replaceAll('setContentTitle("Дека")', 'setContentTitle("Дека 2")');
if (!after.includes('webView.settings.domStorageEnabled')) after = after.replace('webView.settings.mediaPlaybackRequiresUserGesture = false', 'webView.settings.mediaPlaybackRequiresUserGesture = false\n    webView.settings.domStorageEnabled = true\n    android.webkit.CookieManager.getInstance().setAcceptCookie(true)');
if (after !== before) fs.writeFileSync(native, after);
const conf = JSON.parse(fs.readFileSync(path.join(root, 'src-tauri/tauri.conf.json')));
if (conf.identifier !== 'ru.deka2.player' || conf.productName !== 'Deka 2') {
  throw new Error('Refusing to build Deka 2 with another application identity');
}
console.log('Deka 2 branding and isolated storage namespace ready.');
