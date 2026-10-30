"""Android overlay: bundled modules, genuine multitouch, output measurements, no live VK."""
import json, math, os, struct, tempfile, wave
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]; OUT=ROOT/'test-output';OUT.mkdir(exist_ok=True)
results=[]
def check(name, ok=True, **details):
    assert ok,(name,details)
    results.append(dict(test=name,passed=True,**details));print('PASS',name,details or '',flush=True)
bundle='\n;\n'.join((ROOT/'src'/name).read_text()for name in ['library-engine.js','vinyl-processor.js','vinyl-engine.js','deck-engine.js','set-core.js','vk-bridge.js','library-runtime.js','virtual-list.js','mobile-overlay.js'])
fixture=(ROOT/'tests/fixtures/vk-music.html').read_text()
INIT='''
window.__awake=[]; window.DekaAndroid={setBackChip:()=>{},hasSession:()=>true,keepAwake:on=>__awake.push(on),backgroundAllowed:()=>true};
Object.defineProperty(window,'DekaDecks',{configurable:true,set(api){Object.defineProperty(window,'DekaDecks',{value:api});const create=api.create;api.create=opts=>{
 const context=new AudioContext({sampleRate:48000}), analyser=context.createAnalyser();analyser.fftSize=32768;analyser.connect(context.destination);
 opts.context=context;opts.destination=analyser;window.__measure={context,analyser};return window.__dj=create(opts);
};}});
window.measure=(hz=440)=>{const {context,analyser}=__measure,x=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(x);let re=0,im=0,sum=0;
 for(let i=0;i<x.length;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(x.length-1)),a=2*Math.PI*hz*i/context.sampleRate; re+=x[i]*w*Math.cos(a);im+=x[i]*w*Math.sin(a);sum+=w;}
 return {amp:2*Math.hypot(re,im)/sum,peak:Math.max(...x.map(Math.abs))};};
'''
with tempfile.TemporaryDirectory()as td,sync_playwright()as p:
    paths=[]
    for hz in [440,660]:
        path=Path(td)/f'Tone{hz}.wav';paths.append(str(path))
        with wave.open(str(path),'w')as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000)
            cycle=b''.join(struct.pack('<h',int(.5*32767*math.sin(2*math.pi*hz*i/24000)))for i in range(24000))
            w.writeframes(cycle*100)
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    def context(strict=False):
        c=browser.new_context(viewport={'width':844,'height':390},has_touch=True,is_mobile=True,device_scale_factor=1)
        allowed="'self' 'unsafe-inline'"+(''if strict else ' blob:')
        policy=f"default-src 'none'; script-src {allowed}; worker-src {allowed}; style-src 'unsafe-inline'; media-src blob:; connect-src 'none'"
        c.route('https://vk.ru/**',lambda r:r.fulfill(status=200,content_type='text/html; charset=utf-8',headers={'Content-Security-Policy':policy},body=fixture))
        c.add_init_script(INIT+'\n'+bundle);return c
    c=context();page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('https://vk.ru/audios42');ov=lambda selector:page.locator('#deka-overlay '+selector)
    ov('#dj').wait_for();page.wait_for_timeout(150)
    check('APK native bundle installs scratch locally without a VK module URL',page.evaluate("!!DekaVinyl && !!DekaVinylTransport && !!DekaVinylModuleSource"))
    ov('#files').set_input_files(paths);ov('#listA .vlrow').first.wait_for()
    ov('#listA .vlrow').first.tap();ov('#listB .vlrow').nth(1).tap()
    page.wait_for_function('()=>__dj.state.A.duration===100 && __dj.state.B.duration===100')
    check('DJ selection loads independent files without autoplay',page.evaluate("__dj.state.A.paused&&__dj.state.B.paused&&__dj.state.A.track.title==='Tone440'&&__dj.state.B.track.title==='Tone660'"))
    ov('#playA').tap();ov('#playB').tap();page.wait_for_timeout(1100)
    check('Both local sources are actually audible',page.evaluate('measure(440).amp>.05&&measure(660).amp>.05'))
    ov('#mixToggleB').tap();ov('#rateB').fill('8');page.wait_for_timeout(1100)
    check('Touch tempo +8% preserves 660 Hz with Key Lock',page.evaluate('__dj.state.B.rate===1.08&&measure(660).amp>.05'))
    ov('#bpmB').fill('125');check('Android effective BPM includes tempo', '135.0' in ov('#effectiveBPMB').inner_text())
    ov('#keyLockB').tap();page.wait_for_timeout(1000)
    check('Key Lock off gives real 712.8 Hz at +8%',page.evaluate('measure(712.8).amp>.05'))
    ov('#keyLockB').tap();ov('[data-reset=B]').tap();ov('#mixToggleB').tap()
    page.evaluate("__dj.seek('A',15);__dj.seek('B',15)")
    session=c.new_cdp_session(page)
    box=ov('#discA').bounding_box();cx=box['x']+box['width']/2;cy=box['y']+box['height']/2;radius=box['width']*.34
    finger=lambda x,y,i=1:dict(x=x,y=y,id=i,radiusX=4,radiusY=4,force=1)
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[finger(cx+radius,cy)]})
    page.wait_for_function("()=>__dj.state.A.scratchStatus==='ready'",timeout=15000)
    check('Android prepares bundled AudioWorklet backend',page.evaluate("__dj.state.A.scratchBackend==='worklet'"))
    held=page.evaluate('__dj.state.A.time');bb=page.evaluate('__dj.state.B.time');page.wait_for_timeout(900)
    check('Finger hold silences/stops A while B advances',page.evaluate(f'__dj.state.A.held&&Math.abs(__dj.state.A.time-{held})<.01&&__dj.state.B.time>{bb}+.4&&measure(440).amp<.001'))
    page.evaluate("__dj.setCross(-1)");page.wait_for_timeout(700)
    peaks=[]
    for i in range(1,33):
        a=i/32*math.pi*1.5;session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[finger(cx+radius*math.cos(a),cy+radius*math.sin(a))]});page.wait_for_timeout(20)
        if i%8==0:peaks.append(page.evaluate('measure().peak'))
    forward=page.evaluate('__dj.state.A.time')
    check('Real touch rotation produces isolated scratch audio',forward>held+1 and max(peaks)>.05,peaks=peaks)
    for i in range(32,-1,-1):
        a=i/32*math.pi*1.5;session.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[finger(cx+radius*math.cos(a),cy+radius*math.sin(a))]});page.wait_for_timeout(20)
    check('Reverse touch stroke returns backward in the track',abs(page.evaluate('__dj.state.A.time')-held)<.04)
    session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_function('()=>!__dj.state.A.paused&&!__dj.state.A.held')
    check('Releasing a finger resumes A and preserves B',page.evaluate('!__dj.state.B.paused'))
    page.evaluate("__dj.setCross(0)")
    # Two simultaneous pointers: hold A and bend B without a whole-screen swipe.
    ov('#mixToggleB').tap();nbox=ov('[data-nudge=B][data-value="0.04"]').bounding_box();nx=nbox['x']+nbox['width']/2;ny=nbox['y']+nbox['height']/2
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[finger(cx+radius,cy)]})
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[finger(cx+radius,cy),finger(nx,ny,2)]});page.wait_for_timeout(120)
    check('Multitouch: A held and B nudge independent',page.evaluate('__dj.state.A.held&&__dj.state.B.nudge===.04'))
    session.send('Input.dispatchTouchEvent',{'type':'touchCancel','touchPoints':[]});page.wait_for_timeout(150)
    check('Touch cancel clears hold/nudge without accidental navigation',page.evaluate('!__dj.state.A.held&&__dj.state.A.paused&&__dj.state.B.nudge===0') and ov('#dj').is_visible())
    ov('#mixToggleB').tap();ov('#playA').tap()
    page.set_viewport_size({'width':390,'height':844});page.wait_for_timeout(200)
    check('Rotation retains both sources, positions and playback',page.evaluate("!__dj.state.A.paused&&!__dj.state.B.paused&&__dj.state.A.track.title==='Tone440'"))
    ov('#djBtn').tap();page.wait_for_timeout(120)
    check('Portrait settings and transports stay within the screen',ov('#discA').bounding_box()['x']>=0 and ov('#discB').bounding_box()['x']+ov('#discB').bounding_box()['width']<=390)
    # Pause A with UI, touch/release it; must remain paused.
    ov('#playA').tap();box=ov('#discA').bounding_box();x=box['x']+box['width']*.8;y=box['y']+box['height']/2
    session.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[finger(x,y)]});page.wait_for_timeout(100);session.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    check('Touch of a paused Android deck does not autoplay',page.evaluate('__dj.state.A.paused&&!__dj.state.A.held'))
    # AudioContext suspension cannot leave a false playing indication.
    ov('#playA').tap();page.evaluate('__measure.context.suspend()');page.wait_for_timeout(100)
    check('Suspended audio context pauses both local transport states',page.evaluate('__dj.state.A.paused&&__dj.state.B.paused'))
    page.evaluate('__measure.context.resume()')
    check('Focus/context recovery does not unexpectedly restart music',page.evaluate('__dj.state.A.paused&&__dj.state.B.paused'))
    ov('#libraryBtn').tap();ov('#sourcemain').select_option('files')
    check('Main local library offers explicit A/B load buttons',ov('[data-load=A]').count()==2 and ov('[data-load=B]').count()==2)
    ov('[data-load=B]').first.tap();check('Explicit B assignment switches to DJ without playing',page.evaluate("__dj.state.B.track.title==='Tone440'&&__dj.state.B.paused"))
    page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(150);page.screenshot(path=str(OUT/'android-dj-landscape.png'))
    check('No Android UI runtime errors',not errors,errors=errors)
    c.close()
    # A site's CSP may forbid worklet blobs. Confirm the shipped compatibility backend,
    # while keeping CSP intact and decoding the File directly without connect-src access.
    strict=context(True);sp=strict.new_page();sp.goto('https://vk.ru/audios42');so=lambda sel:sp.locator('#deka-overlay '+sel)
    so('#files').set_input_files(paths);so('#listA .vlrow').first.tap();sp.wait_for_function('()=>__dj.state.A.duration===100');so('#playA').tap();sp.wait_for_timeout(400)
    sp.evaluate("__dj.seek('A',10);__dj.scratchBegin('A')");sp.wait_for_function("()=>__dj.state.A.scratchStatus==='ready'",timeout=15000)
    check('Restrictive VK-like CSP uses compatibility PCM without a remote download',sp.evaluate("__dj.state.A.scratchBackend==='compatibility'"))
    sp.evaluate("__dj.scratchMove('A',1.5)");sp.wait_for_timeout(200)
    check('Compatibility backend emits actual PCM audio',sp.evaluate('measure().peak>.02'))
    sp.evaluate("__dj.scratchEnd('A')");sp.wait_for_timeout(200)
    check('Compatibility release returns to normal playback',sp.evaluate('!__dj.state.A.paused&&!__dj.state.A.held'))
    strict.close();browser.close()
(OUT/'android-dj-report.json').write_text(json.dumps({'tests':results,'method':'Chromium mobile emulation, real CDP touch/multitouch, restrictive CSP and measured 48 kHz WebAudio output. Not an Android device or system picker validation.'},ensure_ascii=False,indent=2))
