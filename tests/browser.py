"""Offline Chromium regression tests. No VK account, network audio or real user data."""
import json, math, os, struct, tempfile, wave
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('DEKA_TEST_OUTPUT', str(ROOT / 'test-output')))
OUT.mkdir(parents=True, exist_ok=True)
results = []
def record(name, value=True):
    assert value, name
    results.append({'test':name, 'passed':True})
    print('PASS', name, flush=True)
with sync_playwright() as p:
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'), headless=True, args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    context = browser.new_context(viewport={'width':390,'height':844}, has_touch=True)
    fixture = (ROOT / 'tests/fixtures/vk-virtual.html').read_text()
    # Pure in-memory fixture: no browser navigation or network access is needed.
    page = context.new_page()
    errors=[]
    page.on('pageerror', lambda err: errors.append(str(err)))
    page.set_content(fixture)
    page.evaluate("() => { const m=new Map(); Object.defineProperty(window,'localStorage',{value:{getItem:k=>m.has(k)?m.get(k):null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)}}); }")
    def script(name):
        text = (ROOT/'src'/name).read_text()
        if name in ['library-runtime.js', 'mobile-overlay.js']:
            # Local fixture only: replace the auto-activation hostname gate in memory.
            # The shipped files keep the VK-only gate. No request to VK is made.
            lines = text.splitlines()
            lines = ["  if (window.top !== window) return;" if 'location.hostname)) return;' in line else line for line in lines]
            text = '\n'.join(lines)
        return text
    for name in ['library-engine.js','deck-engine.js','library-runtime.js','virtual-list.js']:
        page.add_script_tag(content=script(name))
    # Exercise the exact production DOM adapter/collector with shorter polling delays.
    result = page.evaluate('''async () => {
      await DekaLibrary.collect({
        stepMs: 12, settleMs: 25, endMs: 100, stalledMs: 3000, maxMs: 25000
      });
      window.__result = DekaLibrary.get();
      return { count:__result.count, complete:__result.complete, reason:__result.reason, keys:__result.items.map(t=>t.key) };
    }''')
    record('1000 recycled DOM rows collected, including lazy-loaded batches', result['complete'] and result['count']==1000)
    record('No omissions or order changes in 1000-row playlist', result['keys']==['42_'+str(i) for i in range(1000)])
    page.add_script_tag(content=script('mobile-overlay.js'))
    page.locator('#deka-overlay #listmain .vlrow').first.wait_for()
    record('Library shows 1000 logical tracks', '1000' in page.locator('#deka-overlay #countmain').inner_text())
    page.locator('#deka-overlay #listmain').evaluate('(e) => e.scrollTop = e.scrollHeight')
    page.locator('#deka-overlay #listmain [data-key="42_999"]').wait_for()
    record('Last track reachable in main list')
    before = page.locator('#deka-overlay #listmain').evaluate('(e)=>e.scrollTop')
    page.evaluate("() => window.dispatchEvent(new CustomEvent('deka:vk:state',{detail:{title:'Track 0001',artist:'Artist 1',paused:false,currentTime:22,duration:180}}))")
    after = page.locator('#deka-overlay #listmain').evaluate('(e)=>e.scrollTop')
    record('Playback time updates do not reset list scroll', abs(before-after)<1)
    record('Virtual list renders bounded DOM instead of 1000 buttons', page.locator('#deka-overlay #listmain .vlrow').count()<40)
    # Rotate: two discs and independently scrollable lists.
    page.set_viewport_size({'width':844,'height':390})
    page.wait_for_timeout(350)
    record('Landscape automatically opens DJ', 'open' in page.locator('#deka-overlay #dj').get_attribute('class'))
    a=page.locator('#deka-overlay #listA').bounding_box(); b=page.locator('#deka-overlay #listB').bounding_box()
    record('Two list viewports side by side with usable height', a['height']>90 and b['height']>90 and b['x']>a['x']+a['width'])
    footer=page.locator('#deka-overlay .transport').bounding_box()
    record('Neither DJ list is covered by the bottom player', a['y']+a['height'] <= footer['y'] and b['y']+b['height'] <= footer['y'])
    page.locator('#deka-overlay #listA').evaluate('(e)=>e.scrollTop=e.scrollHeight')
    page.locator('#deka-overlay #listA [data-key="42_999"]').wait_for()
    record('A reaches track 1000 without moving B', page.locator('#deka-overlay #listB').evaluate('(e)=>e.scrollTop')==0)
    page.locator('#deka-overlay #searchB').fill('0999')
    record('B search uses entire library, not the visible VK rows', '1 треков' in page.locator('#deka-overlay #countB').inner_text())
    page.locator('#deka-overlay #searchB').fill('')
    page.screenshot(path=str(OUT/'landscape.png'))
    page.set_viewport_size({'width':390,'height':844}); page.wait_for_timeout(300)
    record('Rotation back restores portrait library', 'open' not in page.locator('#deka-overlay #dj').get_attribute('class'))
    page.screenshot(path=str(OUT/'portrait.png'))
    # Two local audio files truly play simultaneously.
    with tempfile.TemporaryDirectory() as td:
        paths=[]
        for freq in [220,330]:
            path=Path(td)/f'tone-{freq}.wav'; paths.append(str(path))
            with wave.open(str(path),'wb') as w:
                w.setnchannels(1); w.setsampwidth(2); w.setframerate(8000)
                w.writeframes(b''.join(struct.pack('<h',int(5000*math.sin(2*math.pi*freq*i/8000))) for i in range(8000*12)))
        page.locator('#deka-overlay #files').set_input_files(paths)
        page.set_viewport_size({'width':844,'height':390}); page.wait_for_timeout(300)
        page.locator('#deka-overlay #listA .vlrow').first.click(); page.wait_for_timeout(400)
        page.locator('#deka-overlay #listB .vlrow').nth(1).click(); page.wait_for_timeout(500)
        record('Both local decks play simultaneously', 'playing' in page.locator('#deka-overlay #discA').get_attribute('class') and 'playing' in page.locator('#deka-overlay #discB').get_attribute('class'))
        page.locator('#deka-overlay #playA').click(); page.wait_for_timeout(100)
        record('Pause A does not pause B', 'playing' not in page.locator('#deka-overlay #discA').get_attribute('class') and 'playing' in page.locator('#deka-overlay #discB').get_attribute('class'))
    record('No browser runtime exceptions', not errors)

    # ---- VK Video set screen: synthetic pages served in-process via routing, no network ----
    set_html = (ROOT / 'tests/fixtures/vk-video-set.html').read_text()
    music_html = '<!doctype html><html><head><meta charset="utf-8"></head><body><h1>Музыка</h1></body></html>'
    sctx = browser.new_context(viewport={'width':390,'height':844}, has_touch=True)
    sctx.route('https://vkvideo.ru/**', lambda r: r.fulfill(status=200, content_type='text/html; charset=utf-8', body=set_html))
    sctx.route('https://vk.ru/**', lambda r: r.fulfill(status=200, content_type='text/html; charset=utf-8', body=music_html))
    # Same order as the Android shell: one init script for every page of the WebView.
    bundle = '\n;\n'.join((ROOT/'src'/n).read_text() for n in
        ['library-engine.js','deck-engine.js','set-core.js','vk-bridge.js','library-runtime.js','virtual-list.js','mobile-overlay.js'])
    sctx.add_init_script(bundle)
    sp = sctx.new_page(); serrors = []
    sp.on('pageerror', lambda err: serrors.append(str(err)))
    sp.goto('https://vkvideo.ru/video-77_88')
    ov = lambda sel: sp.locator('#deka-overlay ' + sel)
    ov('#setView').wait_for(state='visible')
    record('VK Video page opens the set screen instead of the library', ov('.library').is_hidden())
    ov('#chaps .chap').nth(4).wait_for(timeout=15000)
    titles = ov('#chaps .chap .trackmeta b').all_inner_texts()
    record('Tracklist read from collapsed description, stray times ignored',
        titles == ['Intro — Opening','Artist One – Night Drive','Artist Two — Deep Water','Artist Three | Last Train','ID - ID'])
    sp.wait_for_function("() => { const v=document.getElementById('v'); return v && !v.paused && v.readyState>=1; }", timeout=15000)
    record('Set audio starts automatically', True)
    ov('#chaps .chap').nth(2).click()
    sp.wait_for_function("() => Math.abs(document.getElementById('v').currentTime - 80) < 3")
    record('Tapping a track of the set seeks the video to its timestamp')
    sp.wait_for_function("() => document.querySelector('#deka-overlay').shadowRoot.querySelector('.chap.current')?.dataset.index === '2'")
    record('Current track of the set is highlighted', 'Artist Two' in ov('#setNow').inner_text())
    ov('[data-set="next"]').click()
    sp.wait_for_function("() => Math.abs(document.getElementById('v').currentTime - 130) < 3")
    record('Next-track button jumps to the following timestamp')
    ov('[data-set="prev"]').click()
    sp.wait_for_function("() => Math.abs(document.getElementById('v').currentTime - 80) < 3")
    record('Previous-track button at a track start goes to the previous track')
    sp.evaluate("() => { document.getElementById('v').currentTime = 150; }")
    sp.wait_for_function("() => { try { const p=JSON.parse(localStorage.getItem('deka:setpos'))['-77_88']; return p && p.t >= 148 && p.d === 240; } catch (e) { return false; } }", timeout=10000)
    record('Position of the set is remembered while it plays')
    sp.reload()
    ov('#setNote').wait_for(state='visible', timeout=15000)
    sp.wait_for_function("() => document.getElementById('v').currentTime >= 145", timeout=10000)
    record('Reopening the set continues from the saved place', 'Продолжаю с 2:' in ov('#setNoteText').inner_text())
    ov('[data-set="restart"]').click()
    sp.wait_for_function("() => document.getElementById('v').currentTime < 5")
    record('"С начала" restarts the set')
    ov('#pasteBtn').click()
    ov('#pasteText').fill('0:00 Мой первый\n1:00 Мой второй\n2:00 Мой третий\n3:00 Мой четвёртый')
    ov('#pasteSave').click()
    record('Own tracklist replaces the one from the description',
        ov('#chaps .chap .trackmeta b').all_inner_texts() == ['Мой первый','Мой второй','Мой третий','Мой четвёртый'])
    sp.reload(); ov('#chaps .chap').first.wait_for()
    record('Own tracklist survives reopening', ov('#chaps .chap').count() == 4)
    sp.evaluate("() => { document.getElementById('v').currentTime = 100; }")
    sp.wait_for_timeout(600)
    sp.screenshot(path=str(OUT/'set-screen.png'))
    ov('#setBack').click()
    sp.wait_for_url('https://vk.ru/audio**')
    sp.wait_for_function("() => { try { return (JSON.parse(localStorage.getItem('deka:sets'))||[]).length === 1; } catch (e) { return false; } }")
    saved = sp.evaluate("() => JSON.parse(localStorage.getItem('deka:sets'))[0]")
    record('Back to music hands over title and place of the set to vk.ru',
        saved['url'] == 'https://vkvideo.ru/video-77_88' and saved['title'] == 'Rooftop Session 07' and 95 <= saved['pos'] <= 110 and saved['duration'] == 240)
    record('Handover fragment is removed from the address', '#' not in sp.url)
    record('No runtime exceptions on set pages', not serrors)
    if serrors: print(serrors)
    sctx.close()

    # ---- Own library: landing page recommendations never enter it; lazy-loaded own list is complete ----
    music_fixture = (ROOT / 'tests/fixtures/vk-music.html').read_text()
    lctx = browser.new_context(viewport={'width':390,'height':844}, has_touch=True)
    lctx.route('https://m.vk.ru/**', lambda r: r.fulfill(status=200, content_type='text/html; charset=utf-8', body=music_fixture))
    lctx.add_init_script(bundle)
    lp = lctx.new_page(); lerrors = []
    lp.on('pageerror', lambda err: lerrors.append(str(err)))
    lo = lambda sel: lp.locator('#deka-overlay ' + sel)
    lp.goto('https://m.vk.ru/audio')
    lo('#countmain').wait_for()
    lp.wait_for_timeout(1200)  # passive accumulation would have happened by now
    record('Landing page: preview and recommendations are not taken as the library', lo('#countmain').inner_text().startswith('0 '))
    record('Landing page: status explains how to load own tracks', 'Мои треки' in lo('#statusText').inner_text())
    lo('#syncBtn').click()
    lp.wait_for_url('https://m.vk.ru/audios42**')
    lp.wait_for_function("() => { const l = window.DekaLibrary && DekaLibrary.get(); return l && l.complete; }", timeout=60000)
    lib = lp.evaluate("() => DekaLibrary.get()")
    keys = [t['key'] for t in lib['items']]
    record('"Загрузить всё" from landing opens own list and loads all 95, past the first 30', keys == ['42_' + str(i) for i in range(95)])
    record('Own list: no recommendation tracks after the end of own list', not any(k.startswith('-') for k in keys))
    record('Own list: completeness confirmed by the count in its heading', lib['reason'] == 'count-matched')
    record('Recommendation feed "Показать ещё" is never pressed', lp.evaluate('window.__recMore') == 0)
    lo('#countmain').wait_for()
    record('Library list shows 95 tracks', lo('#countmain').inner_text().startswith('95 '))
    lo('#reportBtn').click()
    rep = json.loads(lo('#reportText').input_value())
    record('Report: own page, chosen rows and excluded recommendations, no titles',
        rep['kind'] == 'personal' and rep['chosen'] > 0 and any(k.startswith('✕') for k in rep['sections']) and 'Мой трек' not in lo('#reportText').input_value())
    lo('#reportClose').click()
    lp.goto('https://m.vk.ru/audio'); lo('#countmain').wait_for(); lp.wait_for_timeout(800)
    record('Back on landing the own library stays, recommendations do not join', lo('#countmain').inner_text().startswith('95 '))
    lp.goto('https://m.vk.ru/audios42?nocount=1'); lp.wait_for_function('() => !!window.DekaLibrary')
    r2 = lp.evaluate("async () => { await DekaLibrary.collect({stepMs:40, settleMs:80, endMs:900, stalledMs:8000}); const l = DekaLibrary.get(); return {count:l.count, reason:l.reason, rec:l.items.filter(t=>t.key.startsWith('-')).length}; }")
    record('Without a count: stops at the end of own list, not in the endless recommendations', r2 == {'count':95, 'reason':'end-observed', 'rec':0})
    lp.goto('https://m.vk.ru/audios42?preview=1'); lo('#countmain').wait_for(); lp.wait_for_timeout(500)
    lo('#syncBtn').click()
    lp.wait_for_url('https://m.vk.ru/audios42?section=all**', timeout=15000)
    lp.wait_for_function("() => { const l = window.DekaLibrary && DekaLibrary.get(); return l && l.complete && l.count === 95; }", timeout=60000)
    record('Own page as a 6-track preview: the «Мои треки ›» heading link leads to the full list, all 95 loaded',
        lp.evaluate("DekaLibrary.get().items.filter(t => t.key.startsWith('-')).length") == 0)
    lp.evaluate("localStorage.removeItem('deka:fullList:42')")  # each fixture models a different VK layout
    lp.goto('https://m.vk.ru/audios42?land=1'); lo('#countmain').wait_for(); lp.wait_for_timeout(500)
    lo('#syncBtn').click()
    lp.wait_for_url('https://m.vk.ru/audio?section=mytracks**', timeout=15000)
    lp.wait_for_function("() => { const l = window.DekaLibrary && DekaLibrary.get(); return l && l.complete && l.count >= 95; }", timeout=60000)
    lp.wait_for_timeout(1500)
    record('«Показать все» leading to a music-home address is trusted as the full list: no loop, all 95',
        lp.url.startswith('https://m.vk.ru/audio?section=mytracks') and lp.evaluate('DekaLibrary.pageKind()') == 'personal'
        and lp.evaluate("DekaLibrary.get().items.filter(t => t.key.startsWith('-')).length") == 0)
    lo('#reportBtn').click(); rep2 = json.loads(lo('#reportText').input_value()); lo('#reportClose').click()
    record('Report names where the full list lives', rep2.get('fullList') == '/audio?section')
    lp.goto('https://m.vk.ru/audios42?land=1'); lo('#countmain').wait_for()
    lo('#myBtn').click()
    lp.wait_for_url('https://m.vk.ru/audio?section=mytracks**', timeout=15000)
    record('Next time «Моя музыка VK» goes straight to the full list', True)
    lp.evaluate("localStorage.removeItem('deka:fullList:42')")  # the following fixtures model other VK layouts
    lp.goto('https://m.vk.ru/audios42?expand=1'); lo('#countmain').wait_for(); lp.wait_for_timeout(500)
    r4 = lp.evaluate("async () => { await DekaLibrary.collect({stepMs:60, settleMs:80, endMs:900, stalledMs:8000}); const l = DekaLibrary.get(); return {count:l.count, rec:l.items.filter(t=>t.key.startsWith('-')).length, url: location.pathname + location.search}; }")
    record('Own page as a 6-track preview with «Показать все» on the same page: expanded in place, all 95 loaded',
        r4 == {'count': 95, 'rec': 0, 'url': '/audios42?expand=1'})
    lp.goto('https://m.vk.ru/audios42?nocount=1'); lp.wait_for_function('() => !!window.DekaLibrary')
    r3 = lp.evaluate('''async () => {
      const run = DekaLibrary.collect({stepMs:60, settleMs:80, endMs:900, stalledMs:8000});
      while (!DekaLibrary.isRunning()) await new Promise(r => setTimeout(r, 50));  // collection waits for VK to draw rows first
      await new Promise(r => setTimeout(r, 300));
      const played = await DekaLibrary.playKey('42_0');
      const still = DekaLibrary.isRunning();
      await run; const l = DekaLibrary.get();
      return { played, still, count: l.count, reason: l.reason };
    }''')
    record('Playing a visible track while loading does not stop the loading', r3 == {'played': True, 'still': True, 'count': 95, 'reason': 'end-observed'})
    record('No runtime exceptions on music pages', not lerrors)
    if lerrors: print(lerrors)
    lctx.close()

    # ---- Signing in to VK: login pages untouched, signed-out VK usable, own music after login ----
    auth_html = ('<!doctype html><html><head><meta charset="utf-8"></head><body><h1>VK ID</h1><input type="password">'
                 '<button id="b" style="position:fixed;left:16px;right:16px;bottom:20px;height:48px" onclick="window.c=(window.c||0)+1">Войти</button></body></html>')
    gctx = browser.new_context(viewport={'width':390,'height':844}, has_touch=True)
    gctx.route('https://m.vk.ru/**', lambda r: r.fulfill(status=200, content_type='text/html; charset=utf-8', body=music_fixture))
    gctx.route('https://id.vk.ru/**', lambda r: r.fulfill(status=200, content_type='text/html; charset=utf-8', body=auth_html))
    gctx.add_init_script(bundle)
    gp = gctx.new_page(); gerrors = []
    gp.on('pageerror', lambda err: gerrors.append(str(err)))
    go = lambda sel: gp.locator('#deka-overlay ' + sel)
    gp.goto('https://id.vk.ru/auth?app=1'); gp.wait_for_timeout(600)
    covered = gp.evaluate("() => { const b = document.getElementById('b').getBoundingClientRect(); return document.elementFromPoint(b.x + b.width/2, b.y + b.height/2).id; }")
    gp.click('#b', timeout=3000)
    record('VK ID login page: no Deka layer at all, "Войти" is clickable',
        gp.evaluate("() => !document.getElementById('deka-overlay')") and covered == 'b' and gp.evaluate('window.c') == 1)
    gp.goto('https://m.vk.ru/audio?guest=1')
    go('#loginView').wait_for(state='visible', timeout=8000)
    record('Signed out: Deka shows its own sign-in screen, not the VK page',
        go('main.app').is_visible() and go('#loginBtn').is_visible() and go('#openVkBtn').is_visible() and go('#sideTab').is_hidden())
    record('Deka tells to sign in first', 'не вошли' in go('#statusText').inner_text())
    go('#openVkBtn').click()
    record('"Открыть сайт VK" shows the VK site with «← Дека»', go('main.app').is_hidden() and go('#sideTab').is_visible())
    gp.click('#vkLogin', timeout=3000); gp.click('#vkJoin', timeout=3000)
    record('On the VK site "Войти" and "Зарегистрироваться" are clickable', gp.evaluate('[window.__login, window.__signup]') == [1, 1])
    go('#sideTab').click()
    record('Side tab "← Дека" returns to the Deka sign-in screen', go('main.app').is_visible() and go('#loginView').is_visible() and go('#sideTab').is_hidden())
    go('#vkBtn').click()
    record('"VK" in the header also opens the VK site', go('main.app').is_hidden() and go('#sideTab').is_visible())
    gp.reload(); go('#sideTab').wait_for(state='visible', timeout=8000)
    record('VK view survives navigation inside VK', go('main.app').is_hidden())
    tb = go('#sideTab').bounding_box()
    gp.mouse.move(tb['x'] + tb['width']/2, tb['y'] + tb['height']/2); gp.mouse.down()
    gp.mouse.move(tb['x'] + tb['width']/2, tb['y'] + tb['height']/2 - 150, steps=8); gp.mouse.up()
    tb2 = go('#sideTab').bounding_box()
    record('Side tab can be dragged out of the way without leaving VK', tb2['y'] < tb['y'] - 100 and go('main.app').is_hidden())
    go('#sideTab').click(); go('#loginBtn').click()
    gp.wait_for_url('https://m.vk.ru/login**', timeout=8000)
    record('Without the Android app "Войти в VK" opens VK\'s login page', True)
    # "Signing in": VK returns to its site, now with a session.
    gp.goto('https://m.vk.ru/audio')
    gp.wait_for_url('https://m.vk.ru/audios42**', timeout=15000)
    gp.wait_for_function("() => { const l = window.DekaLibrary && DekaLibrary.get(); return l && l.complete; }", timeout=60000)
    record('After login Deka opens own music by itself and loads it in full', gp.evaluate('DekaLibrary.get().count') == 95)
    record('After login Deka is back on screen (not the VK view)', go('main.app').is_visible() and go('#sideTab').is_hidden())
    record('No runtime exceptions in login flows', not gerrors)
    if gerrors: print(gerrors)
    gctx.close()

    # ---- Android shell: VK ID login widget in a frame, guarded against anything covering it ----
    widget_html = ('<!doctype html><meta charset=utf-8><body style="margin:0;height:100vh;background:#fff">'
        '<div style="position:absolute;left:16px;right:16px;bottom:24px;display:flex;flex-direction:column;gap:8px">'
        '<button id=in style="height:48px">Войти</button><button id=up style="height:44px">Зарегистрироваться</button></div><script>'
        'window.vis={}; window.cin=0; window.cup=0;'
        'const io=new IntersectionObserver(es=>{for(const e of es) window.vis[e.target.id]=e.isVisible;},{trackVisibility:true,delay:100});'
        "['in','up'].forEach(id=>io.observe(document.getElementById(id)));"
        "document.getElementById('in').onclick=()=>{ if (window.vis.in) window.cin++; };"
        "document.getElementById('up').onclick=()=>{ if (window.vis.up) window.cup++; };</script>")
    frame_page = ('<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0"><script>window.vk={id:0};</script>'
        '<iframe id="f" src="https://id.vk.ru/widget" style="position:fixed;inset:0;width:100%;height:100%;border:0"></iframe></body></html>')
    fake_android = ("window.DekaAndroid = { chip: null, toasts: [], lines: [], logins: 0, session: sessionStorage.getItem('fakeSession') === '1',"
        " setBackChip(v){ this.chip = v; }, toast(t){ this.toasts.push(t); }, openLogin(){ this.logins++; }, hasSession(){ return this.session; },"
        " keepAwake(){}, backgroundAllowed(){ return true; }, openBackgroundSettings(){}, log(l){ this.lines.push(l); }, readLog(){ return this.lines.join('\\n'); } };")
    nctx = browser.new_context(viewport={'width':390,'height':844}, has_touch=True)
    nctx.route('https://m.vk.ru/**', lambda r: r.fulfill(status=200, content_type='text/html; charset=utf-8',
        body=frame_page if '/login-frame' in r.request.url else music_fixture))
    nctx.route('https://id.vk.ru/**', lambda r: r.fulfill(status=200, content_type='text/html; charset=utf-8', body=widget_html))
    nctx.add_init_script(fake_android); nctx.add_init_script(bundle)
    np_ = nctx.new_page(); nerrors = []
    np_.on('pageerror', lambda err: nerrors.append(str(err)))
    no = lambda sel: np_.locator('#deka-overlay ' + sel)
    np_.goto('https://m.vk.ru/login-frame')
    no('#loginView').wait_for(state='visible', timeout=8000)
    record('Android: signed out (login in a VK ID frame) → Deka\'s own sign-in screen, no VK page',
        np_.evaluate('DekaAndroid.chip') is not True and no('main.app').is_visible())
    no('#loginBtn').click()
    record('Android: "Войти в VK" opens the separate clean login window of the app', np_.evaluate('DekaAndroid.logins') == 1 and np_.url.endswith('/login-frame'))
    no('#openVkBtn').click()
    record('Android: "Открыть сайт VK" hides Deka completely and shows the app\'s «← Дека» button',
        np_.evaluate('DekaAndroid.chip') is True and np_.evaluate("() => document.getElementById('deka-overlay').style.display") == 'none')
    wf = [f for f in np_.frames if 'id.vk.ru' in f.url][0]
    wf.wait_for_function('() => window.vis.in === true && window.vis.up === true', timeout=8000)  # the guard sees nothing covering the buttons
    np_.wait_for_timeout(1000)  # headless Chromium drops input into a freshly loaded frame for a few hundred ms, with or without Deka
    fr = np_.frame_locator('#f'); fr.locator('#in').click(); fr.locator('#up').click(); np_.wait_for_timeout(150)
    record('Android: on the VK site overlap-guarded "Войти"/"Зарегистрироваться" accept taps',
        wf.evaluate('[window.cin, window.cup]') == [1, 1] and wf.evaluate('window.vis') == {'in': True, 'up': True})
    np_.evaluate('window.__dekaBack()')
    record('Android: «← Дека» brings back the sign-in screen',
        np_.evaluate('DekaAndroid.chip') is False and no('#loginView').is_visible() and np_.evaluate("() => document.getElementById('deka-overlay').style.display") == '')
    no('#reportBtn').click()
    rep = json.loads(no('#reportText').input_value())
    record('Report carries the login journal and the signed-out state',
        rep.get('guest') is True and rep.get('native') is True and any(' page m.vk.ru/login-frame' in l for l in rep.get('loginLog', [])))
    no('#reportClose').click()
    np_.goto('https://m.vk.ru/audio?guest=1'); no('#loginView').wait_for(state='visible', timeout=8000)
    before = np_.evaluate('DekaAndroid.logins'); no('#openVkBtn').click()
    np_.click('#vkLogin', timeout=3000); np_.click('#vkJoin', timeout=3000)
    record('Android: VK\'s own «Войти»/«Зарегистрироваться» open Deka\'s login window instead',
        np_.evaluate('DekaAndroid.logins') == before + 2 and np_.evaluate('[window.__login, window.__signup]') == [0, 0])
    np_.goto('https://id.vk.ru/auth?from=main'); np_.wait_for_timeout(500)
    record('Android: if the app itself lands on a VK login page, Deka\'s login window opens', np_.evaluate('DekaAndroid.logins') == 1)
    np_.goto('https://m.vk.ru/challenge.html?from=main'); np_.wait_for_timeout(500)
    record('Android: VK\'s "Продолжить" check stays in the main window (no login window)', np_.evaluate('DekaAndroid.logins') == 0)
    np_.goto('https://m.vk.ru/login-frame')
    np_.evaluate("sessionStorage.removeItem('deka:vkview')")  # the VK view opened above rightly survives navigation; leave it
    np_.evaluate("sessionStorage.setItem('fakeSession', '1')"); np_.reload()
    no('#countmain').wait_for(state='attached'); np_.wait_for_timeout(800)
    record('Android: with a VK session cookie Deka does not ask to sign in, even if VK shows login controls',
        no('#loginView').is_hidden() and 'не вошли' not in no('#statusText').inner_text())
    record('No runtime exceptions in the Android shell scenario', not nerrors)
    if nerrors: print(nerrors)
    nctx.close()

    # ---- Android: VK page must not see the screen turning off ----
    actx = browser.new_context(viewport={'width':390,'height':844}, user_agent='Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36 wv')
    actx.route('https://m.vk.ru/**', lambda r: r.fulfill(status=200, content_type='text/html; charset=utf-8', body=music_fixture))
    actx.add_init_script(bundle)
    ap = actx.new_page(); ap.goto('https://m.vk.ru/audio')
    vis = ap.evaluate("""() => { let heard = 0; document.addEventListener('visibilitychange', () => heard++);
      document.dispatchEvent(new Event('visibilitychange'));
      return { heard, hidden: document.hidden, state: document.visibilityState }; }""")
    record('Android: page keeps "visible" and VK never hears visibilitychange', vis == {'heard':0, 'hidden':False, 'state':'visible'})
    actx.close()

    # ---- Windows UI: Sets tab against a stand-in for the Tauri bridge (no VK, no network) ----
    dctx = browser.new_context(viewport={'width':1200,'height':900})
    dctx.add_init_script('''
      window.__calls = []; window.__ls = {};
      window.__TAURI__ = { core: { invoke: async (cmd, args) => { window.__calls.push([cmd, args]); } },
        event: { listen: (name, fn) => { (window.__ls[name] = window.__ls[name] || []).push(fn); return Promise.resolve(() => {}); } } };
      window.__fire = (name, payload) => (window.__ls[name] || []).forEach(fn => fn({ payload }));
    ''')
    dp = dctx.new_page(); derrors = []
    dp.on('pageerror', lambda err: derrors.append(str(err)))
    dp.goto((ROOT / 'src/index.html').as_uri())
    dp.click('#tabSets')
    record('Windows: Sets tab is available in the app', dp.locator('#setApp').is_visible())
    dp.fill('#setLink', 'https://vk.com/videos-1?z=video-77_88%2Fpl_-1_-2'); dp.click('#setForm button[type=submit]')
    calls = dp.evaluate('() => window.__calls.filter(c => c[0] === "vk_cmd").map(c => c[1].cmd)')
    record('Windows: adding a link opens the set through the VK window', {'type':'openSet','id':'-77_88','kind':'video'} in calls)
    dp.evaluate('''() => { __fire('vk:state', { setId:'-77_88', title:'Rooftop Session 07', artist:'VK Видео', video:true, currentTime:85, duration:240, paused:false, loggedIn:true, hasMedia:true });
      __fire('vk:settracks', { id:'-77_88', title:'Rooftop Session 07', tracks:[{time:0,title:'Intro'},{time:40,title:'Night Drive'},{time:80,title:'Deep Water'},{time:130,title:'Last Train'}] }); }''')
    dp.locator('#chapList .chap').nth(3).wait_for()
    record('Windows: tracklist and current track of the set are shown',
        'Deep Water' in dp.locator('#setNowTrack').inner_text() and 'cur' in dp.locator('#chapList .chap').nth(2).get_attribute('class'))
    dp.click('#bNext')
    last = dp.evaluate('() => window.__calls.filter(c => c[0] === "vk_cmd").map(c => c[1].cmd).pop()')
    record('Windows: transport next jumps to the next track of the set', last == {'type':'seek','time':130})
    record('Windows: set is listed with its title', 'Rooftop Session 07' in dp.locator('#setList').inner_text())
    dp.screenshot(path=str(OUT/'windows-sets.png'))
    record('Windows: no runtime exceptions', not derrors)
    if derrors: print(derrors)
    dctx.close()
    browser.close()
(OUT/'report.json').write_text(json.dumps({'tests':results,'errors':errors,'fixture':'synthetic VK DOM; no real VK session'},ensure_ascii=False,indent=2))
