"""One-time migration from verified deka2 0.2.2 sources. Removed after application."""
from pathlib import Path
import json
R=Path(__file__).resolve().parents[1]
p=R/'src/library-runtime.js';s=p.read_text()
def rep(a,b):
 global s
 assert a in s,a[:120]
 s=s.replace(a,b,1)
rep('.CatalogBlock__header,.page_block_h2', '.CatalogBlock__header,.CatalogBlock__title,.audio_page_block__title,.page_block_h2')
rep('  function personalRoute() {', r'''  var ROUTE_KEY = 'deka2:personal-route:v1', NAV_KEY = 'deka2:personal-load:v1';
  function sessionValue(key) { try { return JSON.parse(sessionStorage.getItem(key)); } catch (_) { return null; } }
  function putSession(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (_) {} }
  function currentRoute() { return location.pathname + (location.search || ''); }
  function verifiedRoute() {
    var r = sessionValue(ROUTE_KEY);
    return r && r.accountId === userId() && r.origin === location.origin &&
      r.path === currentRoute() && Date.now() - r.at >= 0 && Date.now() - r.at < 86400000;
  }
  function personalRoute() {''')
rep('    if (path === ownPath()) return true;', '    if (path === ownPath() || verifiedRoute()) return true;')
rep("document.querySelectorAll('[role=tab][aria-selected=true],a[aria-current=page]')", "document.querySelectorAll('[role=tab][aria-selected=true],a[aria-current=page],.ui_tab_sel,.audio_page__top_tab_selected,.CatalogSection__tab--selected')")
rep("    if (!ownPage()) return { rows: [], all: [], header: null, box: null, reason: 'open-own-library' };", r'''    var isPersonal = ownPage();
    // Only the explicitly named personal preview, never the whole discovery page.
    var previewAllowed = !isPersonal && userId() && landing() &&
      !/[?&](q|z|playlist_id|owner_id)=/.test(location.search || '') &&
      !Array.from(document.querySelectorAll('[role=tab][aria-selected=true]')).some(function(n){return DISCOVERY.test(ownLabel(n));});
    if (!isPersonal && !previewAllowed) return { rows: [], all: [], header: null, box: null, reason: 'open-own-library' };''')
rep('    var personal = entries.find(function (e) { return !e.boundary.recommendation && PERSONAL.test(e.boundary.label); });', r'''    var personal = entries.find(function (e) {
      return !e.boundary.recommendation && PERSONAL.test(e.boundary.label) &&
        (isPersonal || /^(мои |моя |my |your )/i.test(e.boundary.label));
    });''')
rep('      if (e.boundary.recommendation) return false;', '      if (e.boundary.recommendation || (!isPersonal && !personal)) return false;')
rep('    var result = { end: end, rows: chosen,', '    var result = { preview: !isPersonal, end: end, rows: chosen,')
rep('    if (!ownPage() || !userId() || cached.accountId !== userId()) return;', '    if ((!ownPage() && !selection().preview) || !userId() || cached.accountId !== userId()) return;')
rep('    var label = ownLabel(h);', "    var leaf = h.querySelector('.CatalogBlock__title,.audio_page_block__title');\n    if (leaf) h = leaf;\n    var label = ownLabel(h);")
rep("'.audio_row__title_inner', '.ai_title'", "'.audio_row__title_inner', '.audio_row__title', '.ai_title'")
rep("'.audio_row__performers', '.ai_artist'", "'.audio_row__performers', '.audio_row__performer', '.ai_artist'")
rep('    if (s.header) candidates = candidates.concat', '''    if (full && s.header) {
      var headerBox = s.header.parentElement;
      if (headerBox && !headerBox.querySelector(SELECTOR))
        candidates = Array.from(headerBox.querySelectorAll('a,button,[role=button]')).concat(candidates);
    }
    if (s.header) candidates = candidates.concat''')
start=s.index('  function collectMy() {');end=s.index('  function playback()',start)
s=s[:start]+r'''  var navigating = false;
  function personalEntry() {
    var preview = selection();
    var full = preview.header && moreButton(true);
    if (full && (!full.hasAttribute('href') || safeMusicLink(full))) return full;
    return Array.from(document.querySelectorAll('a[href],button,[role=tab]')).find(function (el) {
      if (!shown(el) || el.closest(SELECTOR) || marker(el)) return false;
      var label = ownLabel(el);
      if (!/^(Моя музыка|Мои треки|Мои аудиозаписи|My music|My tracks)$/i.test(label)) return false;
      return !el.hasAttribute('href') || !!safeMusicLink(el);
    }) || null;
  }
  function sourceFailure(reason) {
    loadCache(); snapshot = Object.assign({}, cached, {status:'partial', complete:false, reason:reason});
    emit('library', snapshot); return false;
  }
  async function collectMy() {
    if (loading || preparing || navigating) return false;
    if (session().authenticated !== true) { emit('library', viewSnapshot()); return false; }
    if (ownPage()) return collect();
    // Resolve the actual personal entry BEFORE the own-page gate.
    var until = Date.now() + 8000, entry;
    while (!(entry = personalEntry()) && Date.now() < until && session().authenticated === true) {
      await new Promise(function (resolve) { setTimeout(resolve, 200); });
    }
    if (!entry) return sourceFailure('personal-entry-not-found');
    loadCache();
    var preview = read();
    if (preview.length) {
      cached.items = Core.merge(cached.items, preview); cached.count = cached.items.length;
      cached.complete = false; snapshot = Object.assign({}, cached, {status:'loading',reason:'opening-personal-list'});
      persist(); emit('library', snapshot);
    }
    var link = safeMusicLink(entry), oldRoute = currentRoute(), uid = userId();
    var intent = {accountId:uid, origin:location.origin, at:Date.now()};
    putSession(NAV_KEY, intent);
    if (link && link.pathname + link.search !== oldRoute) {
      putSession(ROUTE_KEY, Object.assign({}, intent, {path:link.pathname + link.search}));
    }
    navigating = true;
    try {
      entry.click();
      until = Date.now() + 10000;
      while (Date.now() < until && userId() === uid) {
        if (ownPage() && nativeRows().length) {
          try { sessionStorage.removeItem(NAV_KEY); } catch (_) {}
          navigating = false; return collect();
        }
        await new Promise(function (resolve) { setTimeout(resolve, 200); });
      }
      return sourceFailure('personal-navigation-timeout');
    } finally { navigating = false; }
  }
'''+s[end:]
rep("      u.hash = 'deka-library=collect'; location.assign(u.href); return true;", '''      var intent = {accountId:userId(), origin:location.origin, at:Date.now()};
      putSession(NAV_KEY, intent);
      putSession(ROUTE_KEY, Object.assign({}, intent, {path:u.pathname+u.search}));
      u.hash = 'deka-library=collect'; location.assign(u.href); return true;''')
rep('isRunning: function () { return loading || preparing; }','isRunning: function () { return loading || preparing || navigating; }')
rep('if (!loading && ownPage() && session().authenticated === true) {','if (!loading && (ownPage() || selection().preview) && session().authenticated === true) {')
rep('    var lastSource = sourceId();', '''    var nav = sessionValue(NAV_KEY);
    if (nav && nav.accountId === userId() && nav.origin === location.origin &&
        Date.now() - nav.at >= 0 && Date.now() - nav.at < 20000) {
      var retry = function () {
        if (userId() !== nav.accountId || Date.now() - nav.at >= 20000) return;
        if (ownPage() && nativeRows().length && !loading && !preparing) {
          try { sessionStorage.removeItem(NAV_KEY); } catch (_) {}
          collect();
        } else setTimeout(retry, 200);
      };
      setTimeout(retry, 200);
    }
    var lastSource = sourceId();''')
rep('return { page: location.pathname, personalRows: s.rows.length', 'return { page: location.pathname, preview:!!s.preview, ownPage:ownPage(), entryFound:!!personalEntry(), personalRows: s.rows.length')
rep('  var collector = null;', "  var collector = null, collectorSource = '', interactionSource = '';")
rep('    collector = Core.createCollector(adapter,','    collectorSource = sourceId();\n    collector = Core.createCollector(adapter,')
rep('    var request = ++runToken;', '    var request = ++runToken; interactionSource = sourceId();')
rep('        if (collector) collector.cancel(); pinnedHost = null; lastScope = null; runToken++; lastSource = sourceId();', '''        // Delayed SPA observer must not cancel NEW work for the new route.
        if (collector && collectorSource !== sourceId()) collector.cancel();
        if (!loading) { pinnedHost = null; lastScope = null; }
        if (interactionSource !== sourceId()) runToken++;
        lastSource = sourceId();''')
rep("if (!ownPage() && !result.items.length) result.reason = 'open-own-library';", "if (!ownPage() && !result.items.length && (!result.reason || result.reason==='not-loaded')) result.reason = 'open-own-library';")
p.write_text(s)
# Local player guard and small UI changes; native mobile UI is preserved.
p=R/'src/mobile-overlay.js';s=p.read_text()
s=s.replace(r"if (window.top !== window || !/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(location.hostname)) return;",r"if (window.top !== window || (!window.DEKA_DESKTOP_SHELL && !/(^|\.)(vk\.(ru|com)|vkvideo\.ru)$/.test(location.hostname))) return;")
s=s.replace('.app.djmode>.status{display:none}', '.app.djmode>.status{display:none}.app.desktop.djmode>.status{display:block;position:absolute;top:48px;left:0;right:0;z-index:5}.app.desktop.djmode .dj{top:78px}')
s=s.replace("app = sh.querySelector('.app');", "app = sh.querySelector('.app'); app.classList.toggle('desktop',!!window.DEKA_DESKTOP_SHELL);")
s=s.replace('function rotate() { if (vkView) return;', 'function rotate() { if (vkView || window.DEKA_DESKTOP_SHELL) return;')
s=s.replace(": 'Список готов'", ": (displayed(side).length ? 'Выберите трек' : 'Музыка ещё не загружена')")
s=s.replace("if (data[index].kind === 'set') { location.assign(data[index].url); return; }", "if (data[index].kind === 'set') { if(window.DEKA_DESKTOP_SHELL){DekaDesktop.openSet(data[index].url);}else location.assign(data[index].url); return; }")
s=s.replace('var reason = {', "var reason = { 'connecting':'Подключение к VK…', 'opening-personal-list':'Открываю полный личный список…', 'personal-entry-not-found':'VK не показал переход к вашей музыке. Проверьте вход через кнопку VK.', 'personal-navigation-timeout':'Не удалось открыть личный раздел VK', 'source-not-ready':'Нет ответа от источника VK. Нажмите «Войти VK».', 'source-link-error':'Ошибка связи с VK', 'preview':'Первые личные треки доступны, догружаю продолжение',")
p.write_text(s)
p=R/'src/player-controls.js';s=p.read_text()
s=s.replace('if(s.authPage){app.hidden=true;return;}app.hidden=false;', 'if(s.authPage&&!window.DEKA_DESKTOP_SHELL){app.hidden=true;return;}app.hidden=false;')
s=s.replace('if(s.hasLoginForm){', 'if(s.hasLoginForm&&!window.DEKA_DESKTOP_SHELL){')
s=s.replace("if(s.conflict||s.authenticated!==true){$('syncBtn').disabled=true;}", "$('syncBtn').disabled=s.conflict||s.authenticated!==true||DekaLibrary.isRunning();")
s=s.replace("$('accountPage').onclick=function(){", "$('accountPage').onclick=function(){\n      if(window.DEKA_DESKTOP_SHELL){DekaDesktop.showSource();return;}")
s=s.replace('function autoLibrary(s){', 'function autoLibrary(s){\n      if(window.DEKA_DESKTOP_SHELL)return;')
s=s.replace("function scanView(on){app.classList.toggle('scanview',!!on);}", "function scanView(on){if(!window.DEKA_DESKTOP_SHELL)app.classList.toggle('scanview',!!on);}")
s=s.replace('nativeList.onclick=function(){', 'nativeList.onclick=function(){\n      if(window.DEKA_DESKTOP_SHELL){DekaDesktop.showSource();return;}')
s=s.replace("version:'0.2.2'", "version:'0.2.4'")
s=s.replace("window.DekaApp={engine:engine,library:window.DekaLibrary,version:'0.2.4'};", """window.DekaApp={engine:engine,library:window.DekaLibrary,version:'0.2.4'};
    if(window.DEKA_DESKTOP_SHELL){
      $('vkBtn').onclick=function(){DekaDesktop.showSource();};
      $('myBtn').onclick=function(){DekaDesktop.refresh();};
      $('backBtn').hidden=true;nativeList.textContent='Проверить соединение VK';
      $('accountPage').textContent='Аккаунт VK';
      var splash=document.getElementById('startup');if(splash)splash.remove();
    }""")
p.write_text(s)
for name in ['package.json','src-tauri/tauri.conf.json']:
 p=R/name;v=json.loads(p.read_text());v['version']='0.2.4';p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
p=R/'src-tauri/Cargo.toml';p.write_text(p.read_text().replace('version = "0.2.2"','version = "0.2.4"'))
p=R/'src-tauri/capabilities/vk.json';v=json.loads(p.read_text());v['remote']['urls']+=['https://vkvideo.ru/*','https://*.vkvideo.ru/*'];p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n')
# Correct old fixture labels: unrelated music must not be labelled My tracks.
p=R/'tests/vk-reliability-browser.py';s=p.read_text()
s=s.replace("<section><h2>Мои треки</h2>'+rows", "<section><h2>'+('Рекомендации' if path=='/audio' else 'Мои треки')+'</h2>'+rows")
s=s.replace("record('My-library navigation uses viewer 42, not visited owner 777','/audios42#' in foreign.evaluate('window.navigation||\"\"'))", "record('Foreign page without a personal entry does not navigate to a guessed or foreign URL',not foreign.evaluate('window.navigation||\"\"') and foreign.evaluate('DekaLibrary.get().reason')=='personal-entry-not-found')")
p.write_text(s)
print('Applied source resolver, SPA race fix, persistent desktop UI and version 0.2.4')
