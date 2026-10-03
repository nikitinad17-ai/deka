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
  assert.ok(fs.readFileSync(path.join(dir,'DekaPlaybackService.kt'),'utf8').includes('PARTIAL_WAKE_LOCK'));
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }
console.log('Syntax, version consistency, absence of signing material and native generator checks passed.');
