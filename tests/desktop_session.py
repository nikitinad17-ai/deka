"""Desktop 0.16: real MP3, mouse scratch, six DSP effects and full 17s fades.
--native connects to the exact compiled Tauri/WebView2 app; no IPC substitute.
"""
import atexit,functools,http.server,json,math,os,sys,tempfile,threading,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-output';OUT.mkdir(exist_ok=True)
native='--native'in sys.argv;checks=[];began=time.monotonic()
def report():
    (OUT/('native-desktop-session-report.json'if native else'desktop-session-report.json')).write_text(json.dumps({'tests':checks,'elapsed_seconds':time.monotonic()-began,'method':'Actual local MP3, native mouse events, measured PCM/media clocks, Web Audio DSP; '+('built WebView2 EXE, no mocked IPC'if native else'Chromium over local HTTP')},indent=2))
atexit.register(report)
def check(name,ok=True,**details):
    checks.append(dict(test=name,passed=bool(ok),**details));print(('PASS 'if ok else'FAIL ')+name,details,flush=True);assert ok,(name,details)
HOOK='''
window.__audios=[];const NA=Audio;window.Audio=function(...a){const e=new NA(...a);__audios.push(e);return e;};Audio.prototype=NA.prototype;
Object.defineProperty(window,'DekaDecks',{configurable:true,set(api){Object.defineProperty(window,'DekaDecks',{value:api});const create=api.create;api.create=opts=>{
 const context=new AudioContext({sampleRate:48000}),analyser=context.createAnalyser();analyser.fftSize=32768;analyser.connect(context.destination);
 opts.context=context;opts.destination=analyser;window.__measure={context,analyser};return window.__dj=create(opts);
};}});
window.currentAudio=side=>__audios.find(a=>a.src===__dj.state[side].track?.url);
window.outputStats=()=>{const x=new Float32Array(__measure.analyser.fftSize);__measure.analyser.getFloatTimeDomainData(x);return {rms:Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length),peak:x.reduce((s,v)=>Math.max(s,Math.abs(v)),0)};};
window.amp=hz=>{const {context,analyser}=__measure,x=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(x);let re=0,im=0,sum=0;for(let i=0;i<x.length;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(x.length-1)),a=2*Math.PI*hz*i/context.sampleRate;re+=x[i]*w*Math.cos(a);im+=x[i]*w*Math.sin(a);sum+=w;}return 2*Math.hypot(re,im)/sum;};
window.fadeSample=()=>{const t=__dj.diagnostics().transition;if(!t)return null;return {elapsed:t.elapsed,duration:t.duration,from:t.from,to:t.to,out:currentAudio(t.from).playbackRate,incoming:currentAudio(t.to).playbackRate,outEQ:__dj.state[t.from].eq.map((v,j)=>v+__dj.state[t.from].autoEQ[j]),inEQ:__dj.state[t.to].eq.map((v,j)=>v+__dj.state[t.to].autoEQ[j]),rms:outputStats().rms,peak:outputStats().peak};};
'''
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=None
if not native:
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'src')))
    threading.Thread(target=server.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory()as td,sync_playwright()as p:
    files=[]
    for i in range(8):
        f=Path(td)/f'Track-{i:02}.mp3';f.write_bytes((ROOT/'tests/fixtures'/f'dj-{440 if i%2==0 else 660}.mp3').read_bytes());files.append(f)
    if native:
        browser=p.chromium.connect_over_cdp(os.environ.get('DEKA_CDP','http://127.0.0.1:9225'),timeout=30000);context=browser.contexts[0]
        page=next(q for q in context.pages if 'tauri.localhost'in q.url);page.add_init_script(HOOK);page.reload()
    else:
        browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
        context=browser.new_context(viewport={'width':1120,'height':780});context.add_init_script(HOOK);context.route('https://**',lambda r:r.abort());page=context.new_page();page.goto(f'http://127.0.0.1:{server.server_port}/index.html')
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.click('#djToggle');page.set_input_files('#file',[{'name':f.name,'mimeType':'audio/mpeg','buffer':f.read_bytes()}for f in files])
    def load(side,i):page.get_by_role('button',name=f'В {side}: Track-{i:02}',exact=True).click()
    load('A',0);load('B',1);page.wait_for_function('__dj.state.A.duration>40&&__dj.state.B.duration>40&&__dj.state.A.fxStatus==="ready"&&__dj.state.B.fxStatus==="ready"')
    check('Two real MP3 decoders and both Roll worklets initialize')
    check('CUE, compact Key Lock, BPM/TAP remain; Nudge and large channel levels are removed',page.locator('[data-cue]').count()==2 and page.locator('[data-keylock]').count()==2 and page.locator('[data-bpm]').count()==2 and page.locator('[data-tap]').count()==2 and page.locator('[data-nudge]').count()==0 and page.locator('[data-gain]').count()==0)
    check('Six independent effects per deck, arranged in three columns',page.locator('.dj-fx-cell').count()==12 and page.locator('.dj-fx').first.evaluate("e=>getComputedStyle(e).gridTemplateColumns.split(' ').length===3"))
    check('Normal desktop width has no horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    page.click('#djPlayA');page.wait_for_timeout(350)
    page.evaluate('window.__realResume=__measure.context.resume.bind(__measure.context);__measure.context.resume=()=>new Promise(r=>setTimeout(()=>__realResume().then(r),350))')
    page.click('#djPlayB');page.wait_for_timeout(1000);page.evaluate('__measure.context.resume=__realResume')
    sound=page.evaluate('({a:amp(440),b:amp(660),...outputStats()})')
    check('Delayed manual B launch keeps both real MP3 channels audible',sound['a']>.02 and sound['b']>.02,**sound)
    for percent in [-8,0,8]:
        page.locator('#djRateB').fill(str(percent));before=page.evaluate("({media:currentAudio('B').currentTime,wall:performance.now()})");page.wait_for_timeout(1200);after=page.evaluate("({media:currentAudio('B').currentTime,wall:performance.now()})")
        speed=(after['media']-before['media'])/((after['wall']-before['wall'])/1000)
        check(f'MP3 tempo {percent:+}% changes actual media speed with Key Lock',abs(speed-(1+percent/100))<.035 and page.evaluate('amp(660)')>.015,speed=speed)
    page.click('#djKeyLockB');page.wait_for_timeout(800)
    check('Key Lock off permits the measured pitched MP3 signal',page.evaluate('amp(712.8)')>.015)
    page.click('#djKeyLockB');page.locator('[data-reset=B]').click();page.evaluate("__dj.setAutoMix(false);__dj.setRepeat(true);__dj.seek('A',2);__dj.seek('B',2)")
    # Render identical input through the five standard DSP graphs to prove signal processing.
    dsp=page.evaluate('''async()=>{
      async function render(name){const c=new OfflineAudioContext(2,48000*2,48000),fx=DekaEffects.create(c,c.destination),buffer=c.createBuffer(1,24000,48000),x=buffer.getChannelData(0);let seed=9;
        for(let i=0;i<x.length;i++){seed=(1664525*seed+1013904223)>>>0;x[i]=.2*Math.sin(2*Math.PI*(200+i/10)*i/48000)+.12*(seed/2147483648-1);}const source=c.createBufferSource();source.buffer=buffer;source.connect(fx.input);if(name)fx.set(name,true,.9);source.start();const out=await c.startRendering();fx.dispose();return out.getChannelData(0);}
      const dry=await render(null),result={};for(const name of ['Flanger','Echo','Reverb','Filter','Phaser']){const wet=await render(name);let delta=0,tail=0,peak=0;for(let i=0;i<wet.length;i++){delta+=(wet[i]-dry[i])**2;if(i>48000*.7)tail+=wet[i]**2;peak=Math.max(peak,Math.abs(wet[i]));}result[name]={difference:Math.sqrt(delta/wet.length),tail:Math.sqrt(tail/(wet.length-48000*.7)),peak};}return result;
    }''')
    for name,data in dsp.items():check(name+' processes actual PCM in its Web Audio graph',data['difference']>.001 and data['peak']<1 and (name not in ['Echo','Reverb']or data['tail']>.001),**data)
    page.locator('[data-effect-amount=A][data-name=Roll]').fill('80');page.click('#djFXARoll')
    page.wait_for_function('__dj.diagnostics().effects.A.Roll.captureFrames>0&&__dj.diagnostics().effects.A.Roll.captureRMS>.005')
    roll=page.evaluate('__dj.diagnostics().effects.A.Roll')
    check('Live Roll captures real MP3 PCM and stays independent of B',roll['captureFrames']>128 and not page.evaluate('__dj.state.B.effects.Roll.on'),**roll)
    page.click('#djFXARoll');page.click('#djFXBFilter')
    check('Effect buttons address only their own deck',page.evaluate('__dj.state.B.effects.Filter.on&&!__dj.state.A.effects.Filter.on'))
    page.evaluate("for(const side of ['A','B'])for(const name of DekaEffects.names)__dj.setEffect(side,name,true,.35)")
    page.evaluate('window.__stress=[];window.__stressTimer=setInterval(()=>__stress.push(outputStats()),60)');before=page.evaluate("currentAudio('B').currentTime");page.wait_for_timeout(1800);page.evaluate('clearInterval(__stressTimer)')
    stress=page.evaluate('({peak:Math.max(...__stress.map(x=>x.peak)),minRMS:Math.min(...__stress.map(x=>x.rms)),time:currentAudio("B").currentTime})')
    check('All twelve effect instances keep playback running without output overload',stress['peak']<=.981 and stress['minRMS']>.003 and stress['time']>before+.9,**stress)
    page.evaluate("for(const side of ['A','B'])for(const name of DekaEffects.names)__dj.setEffect(side,name,false,.35)");page.wait_for_timeout(350)
    # Actual pointer capture, clockwise/counter-clockwise PCM and outside release on both decks.
    for side in ['A','B']:
        page.evaluate(f"__dj.seek('{side}',15);__dj.setCross({-1 if side=='A'else 1},true)")
        disc=page.locator('#djDisc'+side);disc.scroll_into_view_if_needed();box=disc.bounding_box();cx=box['x']+box['width']/2;cy=box['y']+box['height']/2;radius=box['width']*.35
        page.mouse.move(cx+radius,cy);page.mouse.down();page.wait_for_function(f"__dj.state.{side}.held&&__dj.state.{side}.scratchStatus==='ready'",timeout=15000);page.wait_for_timeout(180)
        check(side+' mouse hold stops the platter without losing transport state',page.evaluate(f'__dj.state.{side}.held&&__dj.state.{side}.paused'))
        initial=page.evaluate(f'__dj.state.{side}.time')
        for j in range(1,14):
            theta=j*math.pi/18;page.mouse.move(cx+radius*math.cos(theta),cy+radius*math.sin(theta));page.wait_for_timeout(20)
        forward=page.evaluate(f'__dj.state.{side}.time');pcm=page.evaluate('outputStats()')
        check(side+' clockwise mouse scratch moves and emits actual PCM',forward>initial+.4 and pcm['rms']>.002,**pcm)
        for j in range(12,-1,-1):
            theta=j*math.pi/18;page.mouse.move(cx+radius*math.cos(theta),cy+radius*math.sin(theta));page.wait_for_timeout(20)
        check(side+' reverse mouse scratch moves audio backwards',page.evaluate(f'__dj.state.{side}.time')<forward-.4)
        page.mouse.move(cx+box['width']*1.3,cy+20);page.mouse.up();page.wait_for_function(f'!__dj.state.{side}.held&&!__dj.state.{side}.paused')
        check(side+' release outside the platter resumes normal audio',page.evaluate(f'!currentAudio("{side}").paused'))
    page.mouse.move(cx+radius,cy);page.mouse.down();page.wait_for_timeout(100);page.evaluate('window.dispatchEvent(new Event("blur"))');page.mouse.up();page.wait_for_timeout(250)
    check('Losing window focus cannot leave a platter held',page.evaluate('!__dj.state.A.held&&!__dj.state.B.held&&!__dj.state.B.paused'))
    # Exact 17s user-visible fades, including both directions and repeated real MP3 handoffs.
    page.click('#djPauseAll');page.evaluate("__dj.clear('A');__dj.clear('B');__dj.setRepeat(false);__dj.setAutoMix(true);__dj.load('A',DekaDesktopPlayer.files(),0);__dj.play('A')")
    for i in range(1,3 if native else 7):
        old='A'if i%2 else'B';new='B'if i%2 else'A'
        page.wait_for_function(f"__dj.state.{new}.track?.title==='Track-{i:02}'&&__dj.state.{new}.duration>40")
        page.evaluate(f"__dj.seek('{old}',__dj.state.{old}.duration-11.36);window.__fade=[];window.__fadeTimer=setInterval(()=>{{const s=fadeSample();if(s)__fade.push(s);}},60)")
        page.wait_for_function(f"__dj.diagnostics().mixing&&__dj.diagnostics().transition.from==='{old}'",timeout=4000)
        page.wait_for_function(f"__dj.state.{old}.lastTransition?.completed&&!__dj.diagnostics().mixing&&!__dj.state.{new}.paused",timeout=20000)
        page.evaluate('clearInterval(__fadeTimer)');data=page.evaluate(f"({{samples:__fade,result:__dj.state.{old}.lastTransition,inRate:currentAudio('{new}').playbackRate,inEQ:__dj.state.{new}.eq.map((v,j)=>v+__dj.state.{new}.autoEQ[j]),title:__dj.state.{new}.track.title}})")
        samples=data['samples'];first=samples[0];last=samples[-1];result=data['result'];min_rms=min(s['rms']for s in samples)
        check(f'{old}→{new} MP3 fade {i} lasts 17s and keeps the exact successor',abs(result['elapsed']-17)<.2 and result['duration']==17 and data['title']==f'Track-{i:02}',elapsed=result['elapsed'],samples=len(samples))
        check(f'{old}→{new} fade {i}: measured media rates follow the shared clock',first['incoming']<.93 and last['incoming']>.99 and .32<last['out']<.35 and all(abs(s['out']-(1-2*s['elapsed']/17/3))<.006 and abs(s['incoming']-(.92+.08*s['elapsed']/17))<.006 for s in samples),start=first['incoming'],out_end=last['out'],in_end=last['incoming'])
        check(f'{old}→{new} fade {i}: all three EQ bands move smoothly with tempo',first['inEQ'][0]<-11.8 and last['outEQ'][0]<-11.6 and all(max(abs(v+12*s['elapsed']/17)for v in s['outEQ'])<.1 and max(abs(v-(-12+12*s['elapsed']/17))for v in s['inEQ'])<.1 for s in samples))
        check(f'{old}→{new} fade {i}: real output never drops out and incoming settles',min_rms>.002 and abs(data['inRate']-1)<.0001 and all(abs(v)<.001 for v in data['inEQ']),minimum_rms=min_rms,peak=max(s['peak']for s in samples))
    page.click('#djCenter');check('Center leaves Auto Mix armed',page.locator('#djAutoMix').get_attribute('aria-pressed')=='true')
    page.click('#djPauseAll');page.wait_for_timeout(1000) # Flush the 32768-frame (~683ms) measurement window.
    paused=page.evaluate('({a:__dj.state.A.paused,b:__dj.state.B.paused,held:__dj.state.A.held||__dj.state.B.held,...outputStats()})')
    check('Final Pause both cannot cause a late restart or FX tail',paused['a']and paused['b']and not paused['held']and paused['rms']<.001,**paused)
    check('No Desktop session runtime errors',not errors,errors=errors)
    page.screenshot(path=str(OUT/('native-desktop-session.png'if native else'desktop-session.png')),full_page=True)
    browser.close()
if server:server.shutdown()
report();atexit.unregister(report)
