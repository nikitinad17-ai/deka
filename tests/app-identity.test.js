const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
test('Deka 2 has a separate native identity, name and executable', () => {
  const c = JSON.parse(read('src-tauri/tauri.conf.json'));
  assert.equal(c.identifier, 'ru.deka2.player');
  assert.equal(c.productName, 'Deka 2');
  assert.equal(JSON.parse(read('package.json')).name, 'deka2');
  assert.match(read('src-tauri/Cargo.toml'), /name = "deka2"/);
  assert.match(read('src-tauri/src/main.rs'), /deka2_lib::run/);
});
test('library and UI use isolated Deka 2 names without reading original storage', () => {
  const runtime = read('src/library-runtime.js');
  assert.ok(runtime.includes('deka2:own-library:v3:'));
  assert.ok(!runtime.includes("'deka:library:"));
  const ui = read('src/mobile-overlay.js');
  assert.ok(ui.includes('ДЕКА 2'));
  assert.ok(ui.includes('deka2-overlay'));
  assert.ok(!ui.includes("'deka:"));
});
test('desktop and Android both inject the two-deck interface', () => {
  const native = read('src-tauri/src/lib.rs');
  assert.match(native, /DECK_ENGINE, VK_BRIDGE, MIXER_POLICY, LIBRARY_RUNTIME, VIRTUAL_LIST, EXTRA_CONTROLS, MOBILE_OVERLAY/);
  assert.ok(!native.includes('#[cfg(mobile)]\nconst DECK_ENGINE'));
});
test('branding is idempotent', () => {
  const paths = ['src/mobile-overlay.js', 'src/library-runtime.js', 'src/vk-bridge.js', 'scripts/android-webview.js', 'tests/browser.py'];
  const before = paths.map(read);
  cp.execFileSync(process.execPath, [path.join(root,'scripts/prepare-deka2.js')]);
  assert.deepEqual(paths.map(read), before);
});
test('no updater can stop the original Deka and no recovery private key is committed', () => {
  assert.ok(!fs.existsSync(path.join(root, 'update.ps1')));
  const pem = read('keys/deka2-recovery-public.pem');
  assert.ok(pem.includes('BEGIN PUBLIC KEY'));
  assert.ok(!pem.includes('PRIVATE KEY'));
  const workflow = read('.github/workflows/build.yml');
  assert.ok(!workflow.includes('git show'));
  assert.ok(workflow.includes('DEKA2_KEYSTORE_BASE64'));
  assert.ok(!workflow.includes('secrets.ANDROID_KEYSTORE_BASE64'));
});
