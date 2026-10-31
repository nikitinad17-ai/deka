"""Real audible overlap, slow-start regression, tempo and beat/EQ transition.
--native connects to the built Windows executable's WebView2 on a disposable CI host.
"""
import base64,json,math,os,struct,sys,tempfile,wave
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-output';OUT.mkdir(exist_ok=True)
checks=[];native='--native'in sys.argv
HOOK='''
window.__audios=[];const NA=window.Audio;window.Audio=function(...args){const a=new NA(...args);__audios.push(a);return a;};window.Audio.prototype=NA.prototype;
Object.defineProperty(window,'DekaDecks',{configurable:true,set(api){Object.defineProperty(window,'DekaDecks',{value:api});const create=api.create;api.create=opts=>{
 const context=new AudioContext({sampleRate:48000}),analyser=context.createAnalyser();analyser.fftSize=32768;analyser.connect(context.destination);
 opts.context=context;opts.destination=analyser;window.__measure={context,analyser};return window.__dj=create(opts);
};}});
window.clock=side=>__audios.find(a=>a.src===__dj.state[side].track.url&&!a.paused).currentTime;
window.amp=hz=>{const {context,analyser}=__measure,x=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(x);let re=0,im=0,sum=0;
 for(let i=0;i<x.length;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(x.length-1)),a=2*Math.PI*hz*i/context.sampleRate;re+=x[i]*w*Math.cos(a);im+=x[i]*w*Math.sin(a);sum+=w;}return 2*Math.hypot(re,im)/sum;};
window.outputRMS=()=>{const a=__measure.analyser,x=new Float32Array(a.fftSize);a.getFloatTimeDomainData(x);return Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length);};
'''
def check(name,ok=True,**details):
    checks.append({'test':name,'passed':bool(ok),**details});print(('PASS 'if ok else 'FAIL ')+name,details or '',flush=True);assert ok,(name,details)
with tempfile.TemporaryDirectory()as td,sync_playwright()as p:
    paths=[]
    for title,hz,bpm in [('Tone440',440,0),('Tone660',660,0),('Beat120',440,120),('Beat125',660,125)]:
        f=Path(td)/(title+'.wav');paths.append(str(f));sr=12000;data=[]
        for i in range(sr*24):
            t=i/sr;x=.4*math.sin(2*math.pi*hz*t)
            if bpm:
                period=60/bpm;phase=(t-.14)%period;x=.25*math.sin(2*math.pi*hz*t)+.45*math.sin(2*math.pi*80*phase)*math.exp(-35*phase)
            data.append(struct.pack('<h',int(max(-.98,min(.98,x))*32767)))
        with wave.open(str(f),'w')as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr);w.writeframes(b''.join(data))
    if native:
        browser=p.chromium.connect_over_cdp('http://127.0.0.1:9225');ctx=browser.contexts[0]
        pages=[q for q in ctx.pages if 'tauri.localhost'in q.url];assert pages,[q.url for q in ctx.pages]
        page=pages[0];page.add_init_script(HOOK);page.reload()
    else:
        browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        ctx=browser.new_context(viewport={'width':1360,'height':1100});ctx.add_init_script(HOOK);page=ctx.new_page();page.goto((ROOT/'src/index.html').as_uri())
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.click('#djToggle');page.set_input_files('#file',paths)
    def load(side,name):page.get_by_role('button',name='В '+side+': '+name,exact=True).click()
    load('A','Tone440');load('B','Tone660');page.wait_for_function('__dj.state.A.duration===24&&__dj.state.B.duration===24')
    page.click('#djPlayA');page.wait_for_timeout(500)
    page.evaluate('window.__resume=__measure.context.resume.bind(__measure.context);__measure.context.resume=()=>new Promise(r=>setTimeout(()=>__resume().then(r),350))')
    page.click('#djPlayB');page.wait_for_timeout(1100);page.evaluate('__measure.context.resume=__resume')
    sound=page.evaluate('({a:amp(440),b:amp(660),cross:__dj.diagnostics().cross})')
    check('Delayed second-deck launch leaves BOTH real outputs audible',sound['a']>.04 and sound['b']>.04 and abs(sound['cross'])<.1,**sound)
    for percent in [-8,0,8]:
        page.locator('#djRateB').fill(str(percent));before=page.evaluate("clock('B')");page.wait_for_timeout(1300);speed=(page.evaluate("clock('B')")-before)/1.3
        check(f'Actual native media-clock slope follows tempo {percent:+}%',abs(speed-(1+percent/100))<.1,speed=speed)
        check(f'Key Lock preserves 660 Hz at tempo {percent:+}%',page.evaluate('amp(660)')>.04)
    page.click('#djPauseAll');load('A','Beat120');load('B','Beat125')
    page.wait_for_function("__dj.state.A.analysisStatus==='ready'&&__dj.state.B.analysisStatus==='ready'",timeout=20000)
    beats=page.evaluate('({a:__dj.state.A.analysis,b:__dj.state.B.analysis})')
    check('BPM is estimated from decoded rhythm, not a UI placeholder',abs(beats['a']['bpm']-120)<2 and abs(beats['b']['bpm']-125)<2,a_bpm=beats['a']['bpm'],b_bpm=beats['b']['bpm'])
    page.locator('#djRateB').fill('8');page.locator('[data-reset=B]').click()
    # Explicitly loading B again clears a manual tempo override before automatic matching.
    load('B','Beat125');page.wait_for_function("__dj.state.B.analysisStatus==='ready'")
    if page.locator('#djAutoMix').get_attribute('aria-pressed')!='true':page.click('#djAutoMix')
    page.click('#djPlayA');page.wait_for_timeout(200);page.evaluate("__dj.seek('A',18.2)")
    page.wait_for_function('!__dj.state.B.paused&&__dj.diagnostics().mixing',timeout=5000);page.wait_for_timeout(1000)
    match=page.evaluate('({rate:__dj.state.B.rate,eqA:__dj.state.A.autoEQ,eqB:__dj.state.B.autoEQ,plan:__dj.state.A.lastTransition,a:amp(440),b:amp(660)})')
    check('Auto Mix really adjusts 125 BPM toward 120 BPM',.94<match['rate']<.99 and match['plan']['matched'],rate=match['rate'])
    check('Both tracks overlap while bass transfers progressively',match['a']>.008 and match['b']>.008 and match['eqA'][0]<-1 and match['eqB'][0]<-1,**match)
    page.evaluate('window.__rms=[];window.__rmsTimer=setInterval(()=>__rms.push(outputRMS()),60)')
    page.wait_for_function('__dj.state.A.paused&&!__dj.state.B.paused',timeout=10000);page.wait_for_timeout(400);page.evaluate('clearInterval(__rmsTimer)');levels=page.evaluate('__rms')
    check('Automatic tempo/EQ transition contains no output dropout',levels and min(levels)>.005,minimum_rms=min(levels))
    check('Finished transition restores the incoming normal EQ',page.evaluate('__dj.state.B.autoEQ.every(x=>Math.abs(x)<.001)'))
    page.click('#djCenter');check('Center button does not silently disable future Auto Mix',page.locator('#djAutoMix').get_attribute('aria-pressed')=='true')
    page.click('#djPauseAll');page.wait_for_timeout(500);check('Pause both stays paused',page.evaluate('__dj.state.A.paused&&__dj.state.B.paused'))
    check('No UI runtime errors',not errors,errors=errors)
    page.screenshot(path=str(OUT/('native-automix.png'if native else'automix.png')),full_page=True)
    if not native:
        # Actual source-page media transport; fixture HTML, no live account.
        vk=browser.new_context();vk.route('https://vk.ru/**',lambda r:r.fulfill(content_type='text/html',body='<html><body>Fixture</body></html>'))
        vp=vk.new_page();vp.goto('https://vk.ru/audio');vp.add_script_tag(content=(ROOT/'src/vk-bridge.js').read_text())
        audio=base64.b64encode(Path(paths[1]).read_bytes()).decode()
        vp.evaluate('(s)=>{window.testMedia=new Audio(s);return testMedia.play()}', 'data:audio/wav;base64,'+audio)
        vp.evaluate("__deka.cmd({type:'rate',value:1.08,preservePitch:true})");vp.wait_for_timeout(200);before=vp.evaluate('testMedia.currentTime');vp.wait_for_timeout(1000);slope=vp.evaluate('testMedia.currentTime')-before
        check('VK source command changes the actual media rate',vp.evaluate('testMedia.playbackRate===1.08&&testMedia.preservesPitch')and abs(slope-1.08)<.15,speed=slope)
        vp.evaluate("__deka.cmd({type:'rate',value:.92,preservePitch:false})");check('VK tempo can be slowed and pitch lock changed',vp.evaluate('testMedia.playbackRate===.92&&!testMedia.preservesPitch'))
        vp.reload();vp.add_script_tag(content=(ROOT/'src/vk-bridge.js').read_text());vp.evaluate('(s)=>{window.testMedia=new Audio(s);return testMedia.play()}', 'data:audio/wav;base64,'+audio)
        check('VK tempo survives source navigation and a newly created audio element',vp.evaluate('testMedia.playbackRate===.92&&!testMedia.preservesPitch'))
        vk.close()
    browser.close()
(OUT/('native-automix-report.json'if native else'automix-report.json')).write_text(json.dumps({'tests':checks,'method':'Built WebView2 executable, real file/media clocks and output analysis'if native else'Chromium, actual output DFT, beat WAV files and source-page media; no live VK account'},ensure_ascii=False,indent=2))
