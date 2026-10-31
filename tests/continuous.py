"""Continuous playback/Auto Mix: real short WAVs, output continuity and both UIs.
Synthetic VK IPC only; this is not a physical Android or real-account test.
"""
import json, math, os, struct, tempfile, wave
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-output';OUT.mkdir(exist_ok=True)
results=[]
def check(name,ok=True,**details):
    assert ok,(name,details)
    results.append(dict(test=name,passed=True,**details));print('PASS',name,details or '',flush=True)
INIT='''
window.__ls={};window.__calls=[];window.__audios=[];
const NativeAudio=window.Audio;
window.Audio=function(...args){const el=new NativeAudio(...args);__audios.push(el);return el;};window.Audio.prototype=NativeAudio.prototype;
window.__TAURI__={core:{invoke:async(cmd,args)=>{__calls.push([cmd,args]);}},event:{listen:(n,fn)=>{(__ls[n]||=[]).push(fn);return Promise.resolve(()=>{});}}};
window.emitFixture=(n,payload)=>(__ls[n]||[]).forEach(fn=>fn({payload}));
window.__rotations=[];window.DekaAndroid={keepAwake:()=>{},hasSession:()=>true,setBackChip:()=>{},backgroundAllowed:()=>true,setOrientation:mode=>__rotations.push(mode)};
Object.defineProperty(window,'DekaDecks',{configurable:true,set(api){Object.defineProperty(window,'DekaDecks',{value:api});const create=api.create;api.create=opts=>{
 const context=new AudioContext({sampleRate:48000}),analyser=context.createAnalyser();analyser.fftSize=2048;analyser.connect(context.destination);
 opts.context=context;opts.destination=analyser;window.__measure={context,analyser};return window.__dj=create(opts);
};}});
window.rms=()=>{const data=new Float32Array(__measure.analyser.fftSize);__measure.analyser.getFloatTimeDomainData(data);return Math.sqrt(data.reduce((s,v)=>s+v*v,0)/data.length);};
window.sampleMix=()=>{window.__samples=[];return setInterval(()=>{__samples.push({rms:rms(),a:__dj.state.A.track?.key,b:__dj.state.B.track?.key,pa:__dj.state.A.paused,pb:__dj.state.B.paused,mix:__dj.diagnostics().mixing});},60);};
'''
with tempfile.TemporaryDirectory() as td,sync_playwright() as p:
    paths=[]
    for hz in [440,660,880]:
        path=Path(td)/f'Test - Short{hz}.wav';paths.append(str(path))
        with wave.open(str(path),'w') as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000)
            cycle=b''.join(struct.pack('<h',int(.5*32767*math.sin(2*math.pi*hz*i/24000)))for i in range(24000))
            w.writeframes(cycle*5)
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    ctx=browser.new_context(viewport={'width':1360,'height':1150});ctx.add_init_script(INIT)
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto((ROOT/'src/index.html').as_uri());page.set_input_files('#file',paths)
    page.wait_for_function('()=>__audios[0].currentTime>.1');first=page.evaluate('__audios[0].src')
    page.wait_for_function('(src)=>__audios[0].src!==src&&!__audios[0].paused',arg=first,timeout=8000)
    check('Desktop normal player advances automatically at the real media end')
    page.click('#bRep');src=page.evaluate('__audios[0].src');page.evaluate('__audios[0].currentTime=4.75');page.wait_for_timeout(800)
    check('REP 1 loops the current file, not the playlist',page.evaluate('(src)=>__audios[0].src===src&&!__audios[0].paused&&__audios[0].currentTime<2',src))
    page.click('#bNext');page.wait_for_timeout(200)
    check('Manual Next bypasses REP 1',page.evaluate('(src)=>__audios[0].src!==src',src))
    page.click('#bRep');page.click('#bShuf');page.click('#djToggle')
    check('Desktop shuffle state is shared between main and DJ',page.locator('#djShuffle').get_attribute('aria-pressed')=='true')
    launch=page.locator('#djToggle').bounding_box() # hidden in DJ; check its DOM parent instead
    check('DJ launch button moved into the main header',page.locator('#djToggle').evaluate("el=>el.parentElement.classList.contains('bar')"))
    page.click('#djShuffle')
    page.evaluate("__dj.setAutoMix(false);__dj.load('A',DekaDesktopPlayer.files(),0);__dj.play('A')")
    page.wait_for_function("()=>__dj.state.B.track?.title==='Short660'&&__dj.state.B.status==='ready'")
    check('Next track is preloaded on the idle deck while A plays')
    page.wait_for_function('()=>!__dj.state.B.paused&&__dj.state.A.paused',timeout=8000)
    check('Natural end hands A to B and makes B audible',page.evaluate('__dj.diagnostics().cross===1&&rms()>.02'))
    page.wait_for_function('()=>!__dj.state.A.paused&&__dj.state.B.paused',timeout=8000)
    check('Continuous DJ alternates back to A without a user click')
    page.evaluate("__dj.pause('A');__dj.pause('B');__dj.clear('A');__dj.clear('B');__dj.load('A',DekaDesktopPlayer.files(),0);__dj.setAutoMix(true);__dj.play('A')")
    page.wait_for_timeout(500);page.evaluate('window.__sampler=sampleMix()');page.wait_for_timeout(12500);page.evaluate('clearInterval(__sampler)')
    samples=page.evaluate('__samples');low=min(x['rms'] for x in samples);overlap=sum(not x['pa'] and not x['pb'] for x in samples)
    keys=set(x[k]for x in samples for k in ['a','b']if x[k])
    check('Auto Mix keeps measured master audio present over three transitions',low>.008,minimum_rms=low,overlap_samples=overlap,tracks=len(keys))
    check('Auto Mix really overlaps independent sources and visits the queue',overlap>5 and len(keys)==3)
    page.locator('#djCross').fill('0');check('Manual crossfader takes control from Auto Mix',page.locator('#djAutoMix').get_attribute('aria-pressed')=='false')
    page.click('#djPauseAll');page.wait_for_timeout(1200)
    check('Pause both never restarts music',page.evaluate('__dj.state.A.paused&&__dj.state.B.paused'))
    page.evaluate("__dj.clear('A');__dj.clear('B');__dj.load('A',DekaDesktopPlayer.files(),0);__dj.setAutoMix(true);__dj.play('A')")
    page.wait_for_function('()=>__dj.state.A.time>.1&&__dj.state.B.duration===5')
    page.evaluate("window.__realResume=__measure.context.resume.bind(__measure.context);__measure.context.resume=()=>new Promise(resolve=>window.__releasePlay=resolve);__dj.seek('A',4)")
    page.wait_for_function('()=>__dj.state.B.pending')
    page.click('#djPauseAll');page.evaluate('__releasePlay();__measure.context.resume=__realResume');page.wait_for_timeout(400)
    check('Pausing cancels an in-flight automatic play promise without a late restart',page.evaluate('__dj.state.A.paused&&__dj.state.B.paused'))
    page.evaluate("__dj.clear('A');__dj.clear('B');const list=DekaDesktopPlayer.files();__dj.load('A',[list[0],{key:'broken',kind:'file',title:'Broken',url:URL.createObjectURL(new Blob(['bad'],{type:'audio/wav'}))},list[2]],0);__dj.setAutoMix(true);__dj.play('A')")
    page.wait_for_function("()=>__dj.state.B.track?.title==='Short880'&&__dj.state.B.status==='ready'",timeout=6000)
    check('Broken next file is skipped during preloading while A keeps playing',page.evaluate('!__dj.state.A.paused'))
    page.wait_for_function('()=>!__dj.state.B.paused',timeout=8000)
    check('A good successor plays after a broken file')
    page.click('#djPauseAll');page.evaluate("__dj.clear('A');__dj.clear('B');__dj.setRepeat(true);__dj.load('A',DekaDesktopPlayer.files(),0);__dj.play('A')")
    page.wait_for_timeout(5500)
    check('DJ REP 1 keeps the same track/deck and does not launch a second track',page.evaluate("__dj.state.A.track.title==='Short440'&&!__dj.state.A.paused&&!__dj.state.B.track"))
    page.evaluate("__dj.setRepeat(false)");page.click('#djPauseAll')
    page.evaluate("emitFixture('library',{complete:true,count:2,items:[{key:'42_1',title:'FirstVK',artist:'Test'},{key:'42_2',title:'LastVK',artist:'Test'}]})")
    page.select_option('#djSource','vk');page.get_by_role('button',name='В B: LastVK',exact=True).click();page.click('#djPlayB')
    check('Desktop DJ shows APK-style VK library and loads the exact requested key',page.locator('#djList .dj-row').count()==2 and page.evaluate("__calls.some(c=>c[0]==='vk_cmd'&&c[1].cmd.type==='playKey'&&c[1].cmd.key==='42_2')"))
    page.evaluate("emitFixture('vk:state',{title:'LastVK',artist:'Test',paused:false,currentTime:3,duration:180,loggedIn:true})")
    check('Desktop VK state reaches the assigned DJ deck without forced pause',page.evaluate("!__dj.state.B.paused&&__dj.state.B.status==='playing'"))
    check('VK-only controls communicate their actual local-file capability',page.locator('#djRateB').is_disabled())
    page.screenshot(path=str(OUT/'continuous-desktop.png'),full_page=True)
    check('Desktop continuous UI has no runtime errors',not errors,errors=errors)
    ctx.close()
    # Same scripts and embedded processor order as the Android build.
    bundle='\n;\n'.join((ROOT/'src'/n).read_text()for n in ['library-engine.js','vinyl-processor.js','vinyl-engine.js','deck-engine.js','set-core.js','vk-bridge.js','library-runtime.js','virtual-list.js','mobile-overlay.js'])
    mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True)
    mobile.route('https://vk.ru/**',lambda r:r.fulfill(content_type='text/html',body=(ROOT/'tests/fixtures/vk-music.html').read_text()))
    mobile.add_init_script(INIT+'\n'+bundle)
    mp=mobile.new_page();merrors=[];mp.on('pageerror',lambda e:merrors.append(str(e)));mp.goto('https://vk.ru/audios42');ov=lambda s:mp.locator('#deka-overlay '+s)
    ov('#mainShuffle').click();check('APK exposes Shuffle on the main page',ov('#mainShuffle').get_attribute('aria-pressed')=='true')
    ov('#mainRep').click();check('APK REP 1 means repeat current track',ov('#mainRep').get_attribute('title')=='Повтор текущего трека')
    ov('#mainRep').click();ov('#mainShuffle').click();ov('#rotateBtn').click()
    check('APK horizontal button uses the native orientation bridge',mp.evaluate('__rotations.includes("landscape")'))
    ov('#files').set_input_files(paths);mp.set_viewport_size({'width':844,'height':390});mp.wait_for_timeout(300)
    ov('#listA .vlrow').first.click();ov('#listB .vlrow').nth(1).click();ov('#playA').click();ov('#playB').click();mp.wait_for_timeout(500)
    mp.evaluate('window.__beforeRotate={engine:__dj,a:__dj.state.A.track,b:__dj.state.B.track,t:__dj.state.B.time}')
    mp.set_viewport_size({'width':390,'height':844});mp.wait_for_timeout(400)
    check('APK portrait rotation retains both players, tracks and advancing clocks',mp.evaluate('__dj===__beforeRotate.engine&&__dj.state.A.track===__beforeRotate.a&&__dj.state.B.track===__beforeRotate.b&&!__dj.state.A.paused&&!__dj.state.B.paused&&__dj.state.B.time>__beforeRotate.t'))
    mp.set_viewport_size({'width':844,'height':390});mp.wait_for_timeout(300)
    check('APK landscape automatically opens the DJ layout without a restart',ov('#dj').is_visible() and mp.evaluate('__dj===__beforeRotate.engine'))
    check('APK has independent per-deck tempo panels',ov('#mixToggleA').count()==1 and ov('#mixToggleB').count()==1)
    ov('#djShuffle').click();check('APK main/DJ shuffle buttons share one setting',ov('#mainShuffle').get_attribute('aria-pressed')=='true')
    # Auto Mix is shared with Desktop; verify it also remains active across phone rotation.
    mp.evaluate("__dj.pause('A');__dj.pause('B');__dj.clear('B');__dj.setShuffle(false);__dj.setAutoMix(true);__dj.seek('A',3.5);__dj.play('A')")
    mp.wait_for_function('()=>!__dj.state.B.paused&&__dj.state.A.paused',timeout=6000)
    check('APK performs a real automatic A-to-B transition',mp.evaluate('__dj.diagnostics().cross===1&&rms()>.01'))
    mp.screenshot(path=str(OUT/'continuous-android.png'))
    check('APK continuous UI has no runtime errors',not merrors,errors=merrors)
    mobile.close();browser.close()
(OUT/'continuous-report.json').write_text(json.dumps({'tests':results,'method':'Real short WAV playback, 48 kHz output RMS sampled at 60ms; desktop UI, mobile resize and synthetic VK IPC. Not physical Android/audio-device/VK-account validation.'},ensure_ascii=False,indent=2))
