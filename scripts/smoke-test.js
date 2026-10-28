'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const cp = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
function read(p) { return fs.readFileSync(path.join(root, p), 'utf8'); }
const js = fs.readdirSync(path.join(root,'src')).filter(n=>n.endsWith('.js')).map(n=>'src/'+n)
  .concat(['scripts/android-sign.js','scripts/android-webview.js','scripts/smoke-test.js']);
for (const f of js) cp.execFileSync(process.execPath, ['--check',path.join(root,f)], {stdio:'pipe'});
const tmp = fs.mkdtempSync(path.join(os.tmpdir(),'deka-smoke-'));
try {
  const blocks = [...read('src/index.html').matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)];
  assert.ok(blocks.length);
  for (let i=0;i<blocks.length;i++) { const p=path.join(tmp,'inline-'+i+'.js'); fs.writeFileSync(p,blocks[i][1]); cp.execFileSync(process.execPath,['--check',p]); }
  const packageVersion=JSON.parse(read('package.json')).version;
  assert.equal(JSON.parse(read('src-tauri/tauri.conf.json')).version,packageVersion);
  assert.equal(read('src-tauri/Cargo.toml').match(/^version\s*=\s*"([^"]+)"/m)[1],packageVersion);
  for (const f of ['android/signing.json','android/deka-release.p12']) assert.equal(fs.existsSync(path.join(root,f)),false);
  // Exercise the native generator twice against a real temporary project tree.
  const main=path.join(tmp,'android','app','src','main'), dir=path.join(main,'java','ru','volna','player');
  fs.mkdirSync(dir,{recursive:true});
  fs.writeFileSync(path.join(dir,'MainActivity.kt'),'package ru.volna.player\nimport app.tauri.TauriActivity\nclass MainActivity : TauriActivity()\n');
  fs.writeFileSync(path.join(main,'AndroidManifest.xml'),'<manifest xmlns:android="http://schemas.android.com/apk/res/android"><application><activity android:name=".MainActivity" /></application></manifest>');
  const env={...process.env,DEKA_ANDROID_MAIN_DIR:main};
  for(let i=0;i<2;i++) cp.execFileSync(process.execPath,[path.join(root,'scripts/android-webview.js')],{env,stdio:'pipe'});
  const manifest=fs.readFileSync(path.join(main,'AndroidManifest.xml'),'utf8');
  assert.equal((manifest.match(/DekaPlaybackService/g)||[]).length,1);
  assert.ok(manifest.includes('FOREGROUND_SERVICE_MEDIA_PLAYBACK'));
  const svc=fs.readFileSync(path.join(dir,'DekaPlaybackService.kt'),'utf8'), act=fs.readFileSync(path.join(dir,'MainActivity.kt'),'utf8');
  assert.ok(svc.includes('PARTIAL_WAKE_LOCK') && svc.includes('createWifiLock') && svc.includes('IDLE_GRACE_MS'), 'service keeps CPU and Wi-Fi and survives short pauses');
  assert.equal((act.match(/DEKA_BACKGROUND_V3/g)||[]).length,1,'activity patched exactly once');
  assert.ok(act.includes('setAcceptThirdPartyCookies(webView, true)'),'VK ID frame may use its cookies');
  assert.ok(act.includes('replace("; wv)", ")")') && act.includes('replace(" Version/4.0", "")'),'VK must not take Deka for its own app');
  assert.ok(act.includes('fun setBackChip') && act.includes('window.__dekaBack') && act.includes('decorView'),'native back chip over the WebView');
  assert.ok(act.includes('fun readLog') && svc.includes('object DekaLog'),'login journal kept natively across VK pages');
  assert.ok(/override fun onPause\(\)[\s\S]*dekaWebView\?\.onResume\(\)/.test(act),'WebView pause from wry is undone');
  assert.ok(act.includes('RENDERER_PRIORITY_IMPORTANT') && act.includes('ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'));
  assert.ok(manifest.includes('REQUEST_IGNORE_BATTERY_OPTIMIZATIONS'));
  // The WebView window must not report itself hidden when the screen turns off.
  const cargo=read('.cargo/config.toml');
  assert.ok(/WRY_RUSTWEBVIEW_CLASS_EXTENSION\s*=\s*'''[\s\S]*DEKA_KEEP_VISIBLE[\s\S]*onWindowVisibilityChanged[\s\S]*View\.VISIBLE[\s\S]*onVisibilityChanged[\s\S]*'''/.test(cargo));
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
console.log('Syntax, version consistency, absence of signing material and native generator checks passed.');
