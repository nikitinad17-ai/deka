"""405 seconds of uninterrupted MP3 queue playback; no seeks or shortened fades."""
import atexit,functools,http.server,json,os,tempfile,threading,time
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-output';OUT.mkdir(exist_ok=True);results=[]
def check(name,ok,**details):
    results.append(dict(test=name,passed=bool(ok),**details));print(('PASS 'if ok else'FAIL ')+name,details,flush=True);assert ok,(name,details)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'src')));threading.Thread(target=server.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory()as td,sync_playwright()as p:
    paths=[]
    for i in range(12):
        f=Path(td)/f'Soak-{i:02}.mp3';f.write_bytes((ROOT/'tests/fixtures'/f'dj-{440 if i%2==0 else 660}.mp3').read_bytes());paths.append(str(f))
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    context=browser.new_context(viewport={'width':1120,'height':780});context.route('https://**',lambda r:r.abort())
    context.add_init_script('''window.__events=[];window.__createdAt=performance.now();window.__audios=[];const NA=Audio;window.Audio=function(...args){const el=new NA(...args),id=__audios.length;__audios.push(el);for(const event of ['playing','pause','ended','error','emptied'])el.addEventListener(event,()=>{const side=['A','B'].find(s=>window.__dj?.state[s].track?.url===el.src);__events.push({event,id,side,title:side?__dj.state[side].track.title:'probe',elapsed:(performance.now()-__createdAt)/1000,time:el.currentTime,rate:el.playbackRate,paused:el.paused,ended:el.ended});});return el;};Audio.prototype=NA.prototype;Object.defineProperty(window,'DekaDecks',{configurable:true,set(api){Object.defineProperty(window,'DekaDecks',{value:api});const create=api.create;api.create=o=>{const c=new AudioContext({sampleRate:48000}),m=c.createAnalyser();m.fftSize=2048;m.connect(c.destination);o.context=c;o.destination=m;window.__meter=m;c.addEventListener('statechange',()=>__events.push({event:'context:'+c.state,elapsed:(performance.now()-__createdAt)/1000}));return window.__dj=create(o);};}});''')
    page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto(f'http://127.0.0.1:{server.server_port}/index.html');page.click('#djToggle');page.set_input_files('#file',paths)
    page.get_by_role('button',name='В A: Soak-00',exact=True).click();page.click('#djPlayA');page.wait_for_function('__dj.state.A.time>.5')
    page.evaluate('''()=>{window.__samples=[];window.__starts=[];window.__seen={};window.__soakStarted=performance.now();window.__soakTimer=setInterval(()=>{const x=new Float32Array(__meter.fftSize);__meter.getFloatTimeDomainData(x);const row={elapsed:(performance.now()-__soakStarted)/1000,rms:Math.sqrt(x.reduce((s,v)=>s+v*v,0)/x.length),peak:x.reduce((m,v)=>Math.max(m,Math.abs(v)),0),playing:[]};for(const side of ['A','B']){const s=__dj.state[side];if(!s.paused){row.playing.push({side,title:s.track.title,time:s.time});if(__seen[side]!==s.generation){__seen[side]=s.generation;__starts.push({side,title:s.track.title,elapsed:row.elapsed});}}}__samples.push(row);},100);}''')
    for i in range(27):
        page.wait_for_timeout(15000)
        print('Soak',15*(i+1),'seconds;',page.evaluate('__starts.length'),'starts;',page.evaluate('Math.min(...__samples.slice(-150).map(s=>s.rms))'),'minimum recent RMS',flush=True)
        partial=page.evaluate('({samples:__samples,starts:__starts,events:__events,states:__dj.state,diagnostics:__dj.diagnostics()})')
        (OUT/'mp3-soak-trace.json').write_text(json.dumps(partial,indent=2))
    page.evaluate('clearInterval(__soakTimer)');data=page.evaluate('({samples:__samples,starts:__starts,diagnostics:__dj.diagnostics()})')
    elapsed=data['samples'][-1]['elapsed'];minimum=min(s['rms']for s in data['samples']);peak=max(s['peak']for s in data['samples'])
    check('405-second real-time MP3 soak contains no output gap',elapsed>=404 and minimum>.003 and all(s['playing']for s in data['samples']),elapsed=elapsed,minimum_rms=minimum,samples=len(data['samples']))
    check('Full 12-track queue plays in order and wraps without skips',len(data['starts'])>=13 and all(s['title']==f'Soak-{i%12:02}'for i,s in enumerate(data['starts'])),starts=data['starts'])
    check('Both directions keep the same two players without output overload',peak<=.981 and data['diagnostics']['localPlayers']==2 and len({s['side']for s in data['starts']})==2,peak=peak)
    check('No runtime errors during the uninterrupted soak',not errors,errors=errors)
    page.click('#djPauseAll');page.wait_for_timeout(500);check('Pause after long playback stays paused',page.evaluate('__dj.state.A.paused&&__dj.state.B.paused'))
    (OUT/'mp3-soak-report.json').write_text(json.dumps(dict(tests=results,elapsed_seconds=elapsed,source='Two synthetic MP3 signals; 12 files; full 17-second fades without seeks',minimum_rms=minimum,peak=peak,starts=data['starts']),indent=2))
    browser.close()
server.shutdown()
