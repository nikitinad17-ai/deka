/* Real Android 16 WebView, native navigation bars and native touch.
 * VK and local WAVs are explicit fixtures; no physical phone/account is claimed.
 */
const { _android: android } = require('playwright');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'test-output');
const PACKAGE = 'ru.volna.player.consolepreview0211';
fs.mkdirSync(OUT, { recursive: true });
const checks = [];
const adb = (...args) => execFileSync('adb', args, { encoding: 'utf8', timeout: 30000 }).trim();
const save = (name, data) => fs.writeFileSync(path.join(OUT, name), data);
function check(name, ok, facts = {}) {
  checks.push({ test: name, passed: !!ok, ...facts });
  save('android-native-insets-report.json', JSON.stringify(checks, null, 2));
  console.log((ok ? 'PASS ' : 'FAIL ') + name, facts);
  if (!ok) throw new Error(name);
}
function nodes(xml) {
  return [...xml.matchAll(/<node\s+([^>]+)>/g)].map(m => Object.fromEntries(
    [...m[1].matchAll(/([\w:-]+)="([^"]*)"/g)].map(a => [a[1], a[2]])));
}
const rect = n => n.bounds.match(/\d+/g).map(Number);
const intersects = (a, b) => Math.min(a[2], b[2]) > Math.max(a[0], b[0]) && Math.min(a[3], b[3]) > Math.max(a[1], b[1]);
function tone(hz) {
  const frames = 8000 * 30, b = Buffer.alloc(44 + frames * 2);
  b.write('RIFF', 0); b.writeUInt32LE(b.length - 8, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(8000, 24); b.writeUInt32LE(16000, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(frames * 2, 40);
  for (let i = 0; i < frames; i++) b.writeInt16LE(Math.round(3000 * Math.sin(2 * Math.PI * hz * i / 8000)), 44 + i * 2);
  return { name: `Studio-${hz}.wav`, mimeType: 'audio/wav', buffer: b };
}
(async () => {
  let device;
  try {
    adb('install', '-r', path.resolve(process.argv[2]));
    check('Native test runs on Android 16 / API 36', adb('shell', 'getprop', 'ro.build.version.sdk') === '36');
    adb('shell', 'cmd', 'overlay', 'enable-exclusive', '--category', 'com.android.internal.systemui.navbar.threebutton');
    adb('shell', 'settings', 'put', 'system', 'accelerometer_rotation', '0');
    adb('shell', 'settings', 'put', 'system', 'user_rotation', '0');
    [device] = await android.devices();
    if (!device) throw new Error('No Android device');
    adb('shell', 'am', 'start', '-n', PACKAGE + '/.MainActivity');
    const webview = await device.webView({ pkg: PACKAGE }, { timeout: 90000 });
    const pid = webview.pid();
    const page = await webview.page();
    const context = page.context();
    await context.route('https://vk.ru/**', r => r.fulfill({ contentType: 'text/html; charset=utf-8', body: fs.readFileSync(path.join(ROOT, 'tests/fixtures/vk-music.html'), 'utf8') }));
    // Android WebView has one process-wide cookie store and no browser-context
    // management. Use the page Network domain for this explicit fixture cookie.
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.setCookies', { cookies: [{ name: 'remixsid', value: 'ci-fixture', domain: '.vk.ru', path: '/', secure: true }] });
    await page.goto('https://vk.ru/audios42', { waitUntil: 'domcontentloaded' });
    // The shadow host itself has zero size; its fixed-position app is visible.
    await page.locator('#deka-overlay #djBtn').waitFor({ state: 'visible' });
    const q = s => page.locator('#deka-overlay ' + s);
    check('APK contains the mounted control surfaces', await page.evaluate(() => !!window.DekaConsoleDesigns && !!window.DekaConsoleControls));
    await q('#djBtn').click();
    // File payloads enter the shipped file-input pipeline, not a substituted engine.
    await q('#files').setInputFiles([tone(440), tone(660)]);
    await q('#listA .vlrow').first().click(); await q('#listB .vlrow').nth(1).click();
    await page.waitForFunction(() => !document.querySelector('#deka-overlay').shadowRoot.querySelector('[data-eq=B]').disabled);
    await page.evaluate(() => window.__nativeRotationSentinel = true);
    for (const [rotation, name] of [[0, 'portrait'], [1, 'landscape-right'], [3, 'landscape-left'], [0, 'portrait-return']]) {
      adb('shell', 'settings', 'put', 'system', 'user_rotation', String(rotation));
      await page.waitForTimeout(2000);
      check(name + ' retains the existing music WebView', await page.evaluate(() => window.__nativeRotationSentinel === true));
      check(name + ' keeps DJ open after rotation', await q('#dj').evaluate(e => e.classList.contains('open')));
      adb('shell', 'uiautomator', 'dump', '/sdcard/deka-insets.xml');
      const xml = adb('shell', 'cat', '/sdcard/deka-insets.xml'); save(name + '.xml', xml);
      const all = nodes(xml);
      const webviews = all.filter(n => n.class === 'android.webkit.WebView');
      const nav = all.filter(n => n.package === 'com.android.systemui' && ['back', 'home', 'recent_apps'].includes((n['resource-id'] || '').split('/').pop()));
      check(name + ' exposes WebView and three native navigation buttons', webviews.length && nav.length >= 3);
      const web = webviews.map(rect).sort((a, b) => (b[2] - b[0]) * (b[3] - b[1]) - (a[2] - a[0]) * (a[3] - a[1]))[0];
      check(name + ' has the requested screen orientation', ((web[2] - web[0]) > (web[3] - web[1])) === [1, 3].includes(rotation), { webview: web });
      check(name + ' native navigation never overlaps the WebView', nav.every(n => !intersects(web, rect(n))), { webview: web, navigation: nav.map(rect) });
      check(name + ' native inset callback reports applied offsets', await page.evaluate(() => DekaAndroid.readLog().includes('DEKA_SAFE_INSETS_0211')));
      for (const theme of ['aurora', 'acid', 'editorial']) {
        await q('#djStyle').click(); await q('[data-theme=' + theme + ']').click(); await q('#djThemeSave').click();
        let box;
        for (const side of ['A', 'B']) {
          const control = q(`[data-eq=${side}][data-band="2"]`).locator('..').locator('.dc-surface');
          await control.scrollIntoViewIfNeeded(); box = await control.boundingBox();
          check(`${name} ${theme} ${side} high EQ stays inside the usable viewport`, box.x >= 0 && box.x + box.width <= await page.evaluate(() => innerWidth) + 1);
        }
        const before = await q('[data-eq=B][data-band="2"]').inputValue();
        const untouched = await q('[data-eq=A][data-band="2"]').inputValue();
        const scale = (web[2] - web[0]) / await page.evaluate(() => innerWidth);
        const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
        const start = theme === 'aurora' ? [cx, cy - 15] : [cx, cy];
        const end = theme === 'aurora' ? [cx + 15, cy] : [cx, +before < 10 ? cy - 15 : cy + 15];
        const coords = [...start, ...end].map((v, i) => String(Math.round(web[i % 2] + v * scale)));
        adb('shell', 'input', 'swipe', ...coords, '450');
        await page.waitForTimeout(150);
        check(`${name} ${theme} native touch adjusts B high EQ independently`, await q('[data-eq=B][data-band="2"]').inputValue() !== before && await q('[data-eq=A][data-band="2"]').inputValue() === untouched);
        await q('.console').evaluate(e => e.scrollTop = 0);
        await page.screenshot({ path: path.join(OUT, `${name}-${theme}-webview.png`) });
      }
      save(name + '-screen.png', execFileSync('adb', ['exec-out', 'screencap', '-p']));
    }
    check('Rotation retains the same process', adb('shell', 'pidof', PACKAGE).split(' ')[0] === String(pid));
  } finally {
    try {
      save('android-final-screen.png', execFileSync('adb', ['exec-out', 'screencap', '-p'], { timeout: 15000 }));
      save('android-logcat.txt', adb('logcat', '-d', '-t', '500'));
    } catch (e) { console.error('Diagnostic capture:', e.message); }
    if (device) await device.close();
  }
})().catch(e => { console.error(e); process.exitCode = 1; });
