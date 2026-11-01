"""Actual local MP3 transport/queue races. Short fades stress state transitions.
The full user-visible 17-second envelope is checked separately by desktop_session.py.
"""
import atexit,json,os,tempfile
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-output';OUT.mkdir(exist_ok=True)
checks=[]
def report():(OUT/'mp3-transport-report.json').write_text(json.dumps({'tests':checks,'method':'Real MP3 media; short fades for repeated queue/race stress'},indent=2))
atexit.register(report)
def check(name,ok,**details):
    checks.append(dict(test=name,passed=bool(ok),**details));print(('PASS 'if ok else'FAIL ')+name,details,flush=True);assert ok,(name,details)
hook="""
window.__audios=[];const NA=Audio;window.Audio=function(...a){const e=new NA(...a);__audios.push(e);return e;};Audio.prototype=NA.prototype;
Object.defineProperty(window,'DekaDecks',{configurable:true,set(api){Object.defineProperty(window,'DekaDecks',{value:api});const create=api.create;api.create=o=>{o.fadeSeconds=.7;return window.__dj=create(o);};}});
"""
with tempfile.TemporaryDirectory() as td,sync_playwright() as p:
    paths=[]
    for i in range(12):
        f=Path(td)/f'Queue-{i:02}.mp3';f.write_bytes((ROOT/'tests/fixtures'/f'dj-{440 if i%2==0 else 660}.mp3').read_bytes());paths.append(str(f))
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    context=browser.new_context(viewport={'width':1360,'height':1100});context.add_init_script(hook);page=context.new_page();page.goto((ROOT/'src/index.html').as_uri())
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.click('#djToggle');page.set_input_files('#file',paths)
    page.get_by_role('button',name='В A: Queue-00',exact=True).click();page.click('#djPlayA')
    for i in range(1,12):
        old='A'if i%2 else'B';new='B'if i%2 else'A'
        page.wait_for_function(f"__dj.state.{new}.track?.title==='Queue-{i:02}'&&__dj.state.{new}.duration>1")
        page.evaluate(f"__dj.seek('{old}',__dj.state.{old}.duration-.55)")
        page.wait_for_function(f"!__dj.state.{new}.paused&&__dj.state.{old}.paused",timeout=5000)
        page.evaluate('__dj.endedVK();window.dispatchEvent(new Event("deka:vk:ended"))');page.wait_for_timeout(220)
        value=page.evaluate(f"({{title:__dj.state.{new}.track.title,paused:__dj.state.{new}.paused,time:__dj.state.{new}.time,cross:__dj.diagnostics().cross}})")
        check(f'Local MP3 handoff {i}: no skip or premature stop after remote end',value['title']==f'Queue-{i:02}'and not value['paused']and value['time']>0,**value)
    page.evaluate("__dj.pause('A');__dj.pause('B');__dj.clear('B');__dj.setAutoMix(false);__dj.load('A',DekaDesktopPlayer.files(),11);__dj.play('A')")
    page.wait_for_function('!__dj.state.A.paused');page.evaluate("__dj.seek('A',__dj.state.A.duration-.15)")
    page.wait_for_function("__dj.state.B.track?.title==='Queue-00'&&!__dj.state.B.paused",timeout=4000)
    check('End of local queue wraps without stopping music',page.evaluate("__dj.state.B.track.title==='Queue-00'&&!__dj.state.B.paused"))
    page.click('#djPauseAll');page.evaluate("__dj.setAutoMix(false);window.__resume=__dj;__dj.load('B',DekaDesktopPlayer.files(),2);__dj.play('B');__dj.pause('B');__dj.load('B',DekaDesktopPlayer.files(),4);__dj.play('B');")
    page.wait_for_function("__dj.state.B.track?.title==='Queue-04'&&!__dj.state.B.paused")
    page.wait_for_timeout(400);check('Rapid replace/play/pause keeps the newest MP3 running',page.evaluate("__dj.state.B.track.title==='Queue-04'&&!__dj.state.B.paused&&__dj.state.B.time>0"))
    page.click('#djPauseAll');page.wait_for_timeout(600)
    check('Pause both is stable after repeated handoffs',page.evaluate('__dj.state.A.paused&&__dj.state.B.paused'))
    check('No MP3 UI runtime errors',not errors,errors=errors)
    browser.close()
