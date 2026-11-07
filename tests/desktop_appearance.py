"""Measured live A/B transport while folding and previewing themes; IPC is a fixture."""
import functools,http.server,json,math,os,struct,tempfile,threading,wave
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-output';OUT.mkdir(exist_ok=True)
checks=[]
def check(name,ok=True,**details):
    checks.append(dict(test=name,passed=bool(ok),**details));print(('PASS ' if ok else 'FAIL ')+name,details,flush=True);assert ok,(name,details)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'src')))
threading.Thread(target=server.serve_forever,daemon=True).start()
HOOK='''
window.__ls={};window.__calls=[];
window.__TAURI__={core:{invoke:async(n,a)=>{__calls.push([n,a]);if(n==='wallpaper_state')return {mode:'normal',quiet:false,monitors:[],hotkey_registered:true};}},event:{listen:(n,f)=>{(__ls[n]||=[]).push(f);return Promise.resolve(()=>{});}}};
window.fire=(n,p)=>(__ls[n]||[]).forEach(f=>f({payload:p}));
window.__creations=0;
Object.defineProperty(window,'DekaDecks',{configurable:true,set(api){Object.defineProperty(window,'DekaDecks',{value:api});const create=api.create;api.create=o=>{
__creations++;const context=new AudioContext({sampleRate:48000}),analyser=context.createAnalyser();analyser.fftSize=32768;analyser.connect(context.destination);o.context=context;o.destination=analyser;window.__measure={context,analyser};return window.__dj=create(o);
};}});
window.amplitude=hz=>{const {context,analyser}=__measure,x=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(x);let re=0,im=0,sum=0;for(let i=0;i<x.length;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(x.length-1)),a=2*Math.PI*hz*i/context.sampleRate;re+=x[i]*w*Math.cos(a);im+=x[i]*w*Math.sin(a);sum+=w;}return 2*Math.hypot(re,im)/sum;};
'''
try:
 with tempfile.TemporaryDirectory() as tmp,sync_playwright() as p:
    files=[]
    for freq in [440,660]:
      f=Path(tmp)/f'Tone{freq}.wav';files.append(str(f))
      with wave.open(str(f),'wb') as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000)
        cycle=b''.join(struct.pack('<h',int(12000*math.sin(2*math.pi*freq*i/24000))) for i in range(24000));w.writeframes(cycle*90)
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    ctx=browser.new_context(viewport={'width':1360,'height':960});ctx.route('https://**',lambda r:r.abort());ctx.add_init_script(HOOK)
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
    check('DJ is the only visible startup screen, with no playback',page.locator('#desktopDJ').is_visible() and page.locator('.win-main').is_hidden() and page.evaluate('__dj.state.A.paused&&__dj.state.B.paused'))
    page.set_input_files('#file',files)
    page.get_by_role('button',name='В A: Tone440',exact=True).click();page.get_by_role('button',name='В B: Tone660',exact=True).click()
    page.wait_for_function('__dj.state.A.duration>0&&__dj.state.B.duration>0')
    page.click('#djPlayA');page.click('#djPlayB');page.wait_for_function('__dj.state.A.time>1&&__dj.state.B.time>1')
    page.evaluate("window.savedNodes=[document.querySelector('#djPlayA'),document.querySelector('[data-eq=A]')];window.savedEngine=__dj;__dj.cue('A');__dj.setEffect('A','Echo',true,.2)")
    before=page.evaluate('[__dj.state.A.time,__dj.state.B.time,amplitude(440),amplitude(660)]')
    check('Both signals reach the measured output',before[2]>.02 and before[3]>.02)
    page.click('#djCompact');page.wait_for_timeout(800)
    check('Folding keeps both actual transports advancing',page.evaluate(f'__dj.state.A.time>{before[0]}+.5&&__dj.state.B.time>{before[1]}+.5&&!__dj.state.A.paused&&!__dj.state.B.paused'))
    check('Compact layout exposes EQ, seek, transport, Master and Auto Mix',all(page.locator(s).first.is_visible() for s in ['[data-eq=A]','[data-eq=B]','#djSeekA','#djSeekB','#djPlayA','#djPlayB','#djMaster','#djAutoMix','#djShuffle','#djRepeat','#djList']))
    check('Compact mode hides platters and FX without losing their state',page.locator('#djDiscA').is_hidden() and page.evaluate('__dj.state.A.cueActive&&__dj.state.A.effects.Echo.on'))
    for theme in ['acid','editorial','aurora']:
      page.click('#djStyle');page.click(f'[data-theme={theme}]');page.click('#djThemeSave');page.wait_for_timeout(300)
      check('Theme '+theme+' keeps the same engine and control nodes',page.evaluate('__creations===1&&__dj===savedEngine&&savedNodes[0]===document.querySelector("#djPlayA")&&savedNodes[1]===document.querySelector("[data-eq=A]")'))
      check('Theme '+theme+' preserves real output',page.evaluate('amplitude(440)>.02&&amplitude(660)>.02'))
      page.screenshot(path=str(OUT/f'desktop-{theme}-compact.png'),full_page=True)
      page.click('#djCompact');page.screenshot(path=str(OUT/f'desktop-{theme}-decks.png'),full_page=True);page.click('#djCompact')
    page.click('#djStyle');page.click('[data-theme=editorial]');page.keyboard.press('Escape')
    check('Escape cancels the theme preview and restores the saved theme',page.evaluate("document.documentElement.classList.contains('deka-theme-aurora')&&localStorage.getItem('deka:desktop-theme')==='aurora'"))
    page.click('#djStyle');page.click('[data-theme=acid]');page.click('#djThemeCancel')
    check('Cancel also restores the saved theme',page.evaluate("document.documentElement.classList.contains('deka-theme-aurora')"))
    page.evaluate("__dj.setEffect('A','Echo',false,.2)");page.wait_for_timeout(900)
    eq_before=page.evaluate('[amplitude(440),amplitude(660)]')
    page.locator('[data-eq=A][data-band="1"]').evaluate("e=>{e.value=-12;e.dispatchEvent(new Event('input',{bubbles:true}));}");page.wait_for_timeout(900)
    eq_after=page.evaluate('[amplitude(440),amplitude(660)]')
    check('Compact EQ attenuates the actual A signal while B stays unchanged',eq_after[0]<eq_before[0]*.8 and abs(eq_after[1]/eq_before[1]-1)<.08,before=eq_before,after=eq_after)
    page.locator('#djMaster').evaluate("e=>{e.value=40;e.dispatchEvent(new Event('input',{bubbles:true}));}");page.wait_for_timeout(600)
    check('Compact Master changes the actual output',abs(page.evaluate('amplitude(660)')/eq_after[1]-.5)<.08)
    page.click('#djShuffle');page.click('#djRepeat')
    check('SHUF and REP operate the live engine',page.evaluate('__dj.diagnostics().shuffle&&__dj.diagnostics().repeatTrack'))
    page.click('#djCompact')
    check('Expanded view restores the same EQ and playback state',page.locator('#djDiscA').is_visible() and page.locator('[data-eq=A][data-band="1"]').input_value()=='-12' and page.evaluate('!__dj.state.A.paused&&!__dj.state.B.paused'))
    for size in [(1120,780),(1024,640),(760,800),(420,800)]:
      page.set_viewport_size({'width':size[0],'height':size[1]})
      check(f'No horizontal overflow at {size}',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    page.set_viewport_size({'width':1360,'height':960})
    page.evaluate("__dj.setRepeat(false);__dj.setShuffle(false);__dj.pause('B');__dj.setCross(-1);__dj.setAutoMix(true);__dj.seek('A',__dj.state.A.duration-17.8)")
    page.wait_for_function('__dj.diagnostics().mixing',timeout=6000)
    transition=page.evaluate('__dj.diagnostics().transition')
    page.click('#djCompact');page.click('#djStyle');page.click('[data-theme=acid]');page.click('#djThemeSave')
    check('Folding and changing style preserve an in-flight 17 second mix',page.evaluate(f'__dj.diagnostics().mixing&&__dj.diagnostics().transition.duration===17&&__dj.diagnostics().transition.elapsed>{transition["elapsed"]}'))
    page.wait_for_function('!__dj.diagnostics().mixing&&__dj.state.A.paused&&!__dj.state.B.paused',timeout=21000)
    check('The same transition completes with audible B',page.evaluate('amplitude(660)>.005'))
    page.evaluate("__dj.setAutoMix(false);__dj.setRepeat(true);__dj.seek('A',5);__dj.play('A')")
    page.click('#djStyle');page.click('[data-theme=aurora]');page.click('#djThemeSave')
    page.evaluate("fire('wallpaper:state',{mode:'background',quiet:true})")
    page.wait_for_function("__calls.some(([n])=>n==='wallpaper_mirror')")
    frame=page.evaluate("__calls.filter(([n])=>n==='wallpaper_mirror').at(-1)[1].frame")
    check('Background mirror carries the selected theme and strips audio/scripts', 'deka-theme-aurora' in frame['rootClass'] and 'desktop-themes.css' in frame['styles'] and '<audio' not in frame['html'] and '<script' not in frame['html'])
    page.evaluate("fire('wallpaper:state',{mode:'normal',quiet:false})")
    check('Returning from background preserves A/B and restores interaction',page.evaluate('!document.querySelector(".wrap").inert&&!__dj.state.A.paused&&!__dj.state.B.paused'))
    page.click('#djStyle');page.click('[data-theme=editorial]');page.click('#djThemeSave');page.reload()
    check('Restart restores the saved theme and opens full DJ silently',page.evaluate("document.documentElement.classList.contains('deka-theme-editorial')&&!DekaDesktop.compact&&__dj.state.A.paused&&__dj.state.B.paused"))
    page.select_option('#djSource','vk');page.locator('#djVKTools summary').click();page.click('#vkLogin')
    check('VK login remains reachable from the unified screen',page.evaluate("__calls.some(([n])=>n==='vk_login')"))
    check('No runtime exceptions',not errors,errors=errors)
    browser.close()
finally:
 server.shutdown()
 (OUT/'desktop-appearance-report.json').write_text(json.dumps({'tests':checks,'method':'Chromium, real PCM; native window state uses an explicit IPC fixture'},ensure_ascii=False,indent=2))
