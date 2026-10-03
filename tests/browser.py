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
    browser.close()
(OUT/'report.json').write_text(json.dumps({'tests':results,'errors':errors,'fixture':'synthetic VK DOM; no real VK session'},ensure_ascii=False,indent=2))
