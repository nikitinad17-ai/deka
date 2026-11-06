"""DJ source picker and set controls in Chromium. Remote IPC is a declared fixture;
the Windows shell suite separately runs the shipped bridge in the real EXE.
"""
import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-output';OUT.mkdir(exist_ok=True)
checks=[]
def check(name,ok=True):
    checks.append({'test':name,'passed':bool(ok)})
    print(('PASS ' if ok else 'FAIL ')+name,flush=True)
    assert ok,name

with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),headless=True,args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    context=browser.new_context(viewport={'width':1440,'height':1100})
    context.route('https://**',lambda r:r.abort())
    context.add_init_script('''
      window.__calls=[];window.__ls={};
      window.__TAURI__={core:{invoke:async(command,args)=>{
        __calls.push([command,args]);
        if(command==='wallpaper_state')return {mode:'normal',monitors:[],quiet:false,hotkey_registered:false};
      }},event:{listen:(name,fn)=>{(__ls[name]||=[]).push(fn);return Promise.resolve(()=>{});}}};
      window.__state=data=>(__ls['vk:state']||[]).forEach(fn=>fn({payload:{loggedIn:true,hasMedia:true,artist:'Test DJ',paused:false,currentTime:40,duration:300,playbackRate:1,...data}}));
      Object.defineProperty(window,'DekaDecks',{configurable:true,set(api){
        Object.defineProperty(window,'DekaDecks',{value:api});const create=api.create;
        api.create=opts=>{const engine=create(opts);if(opts.djMode)window.__dj=engine;return engine;};
      }});
    ''')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto((ROOT/'src/index.html').as_uri());page.click('#djToggle')
    page.select_option('#djSource','sets');page.click('#djAddSet')
    page.fill('#djSetLink','https://example.com/video-1_2');page.click('#djSetForm button[type=submit]')
    check('Invalid non-VK URL is rejected',page.locator('#djList .dj-row').count()==0 and 'Нужна ссылка' in page.locator('#djMessage').inner_text())
    page.fill('#djSetLink','https://vkvideo.ru/video-1_2');page.click('#djSetForm button[type=submit]')
    check('Sets appear in the existing dropdown and list without hiding either platter',page.locator('#djDiscA').is_visible() and page.locator('#djDiscB').is_visible() and page.locator('#djList .dj-row').count()==1)
    check('Adding a set does not start playback',not page.evaluate("__calls.some(([n,a])=>n==='vk_cmd'&&a.cmd.type==='openSet')"))
    page.click('#djAddSet');page.fill('#djSetLink','https://vk.ru/video-1_2');page.click('#djSetForm button[type=submit]')
    check('Equivalent video links reuse the saved set',page.locator('#djList .dj-row').count()==1)
    page.locator('#djList .dj-row button').first.click()
    check('Load into A is silent and B remains empty',page.evaluate("__dj.state.A.track.kind==='set'&&__dj.state.A.paused&&!__dj.state.B.track"))
    page.click('#djPlayA');page.evaluate("__state({setId:'-1_2',title:'Long live set'})")
    page.wait_for_function("document.querySelector('#djTitleA').textContent==='Long live set'")
    check('Matching remote metadata names and animates the selected platter',page.evaluate("!__dj.state.A.paused&&!__dj.state.A.pending&&document.querySelector('#djDiscA').classList.contains('playing')"))
    page.select_option('#djSource','files');page.select_option('#djSource','sets')
    check('Changing the source only browses; it does not pause the set',page.evaluate('!__dj.state.A.paused'))
    page.click('#djPlayA');check('Deck Play becomes a working Pause',page.evaluate('__dj.state.A.paused'))
    page.evaluate("__state({setId:'-1_2',title:'Long live set'})")
    check('Late autoplay cannot undo a user pause',page.evaluate('__dj.state.A.paused'))
    page.click('#djPlayA');page.evaluate("__state({setId:'-1_2',title:'Long live set',currentTime:80})")
    page.wait_for_function('!__dj.state.A.pending')
    check('Resume uses Play without reopening the link',page.evaluate("__calls.filter(([n,a])=>n==='vk_cmd'&&a.cmd.type==='openSet').length===1"))
    page.fill('#djSearch','long live');check('Search includes the title learned from playback',page.locator('#djList .dj-row').count()==1)
    page.fill('#djSearch','does not exist');check('Search has a useful empty state',page.locator('#djEmpty').is_visible())
    page.fill('#djSearch','');page.click('#djPauseAll');page.click('#djClose');page.click('#tabSets')
    check('The ordinary player shares the same saved library',page.locator('#setList .item').count()==1)
    page.reload();page.click('#djToggle');page.select_option('#djSource','sets')
    check('Sets and their learned titles survive restart',page.locator('#djList .dj-row').count()==1 and 'Long live set' in page.locator('#djList').inner_text())
    page.screenshot(path=str(OUT/'dj-sets-source.png'),full_page=True)
    check('No browser runtime exceptions',not errors)
    (OUT/'dj-sets-ui-report.json').write_text(json.dumps({'tests':checks,'remote':'IPC fixture; native WebView2 playback checked separately'},ensure_ascii=False,indent=2))
    browser.close()
