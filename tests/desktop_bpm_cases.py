"""New 0.17 integration cases. Called in the same page of the real Windows EXE."""
import array,base64,json,math,statistics,struct,tempfile,wave
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RECORDER=r'''
async function setupRecorder(){
 const code=`class Record extends AudioWorkletProcessor{
 constructor(o){super();this.left=o.processorOptions.frames;this.at=0;this.data=[new Float32Array(this.left),new Float32Array(this.left)];this.first=null;}
 process(input,output){if(this.first===null)this.first=currentTime;const x=input[0]||[],n=Math.min(this.left,output[0][0].length);for(let c=0;c<2;c++)for(let i=0;i<n;i++)this.data[c][this.at+i]=(x[c]||x[0])?.[i]||0;this.at+=n;this.left-=n;if(!this.left){this.port.postMessage({first:this.first,channels:this.data},this.data.map(x=>x.buffer));return false;}return true;}}
 registerProcessor('deka-test-recorder',Record);`;
 const url=URL.createObjectURL(new Blob([code],{type:'application/javascript'}));await __measure.context.audioWorklet.addModule(url);URL.revokeObjectURL(url);
 window.startRecord=(seconds,master=false)=>{
  const c=__measure.context,merger=c.createChannelMerger(2),sink=c.createGain();sink.gain.value=1;
  const node=new AudioWorkletNode(c,'deka-test-recorder',{numberOfInputs:1,numberOfOutputs:1,outputChannelCount:[1],processorOptions:{frames:Math.round(seconds*c.sampleRate)}});
  const sources=['A','B'].map(side=>__sources.find(s=>s.el===currentAudio(side))?.node);
  if(master)__measure.analyser.connect(node);else{sources.forEach((s,i)=>s.connect(merger,0,i));merger.connect(node);}
  node.connect(sink).connect(c.destination);
  window.__recording=new Promise(resolve=>{node.port.onmessage=({data})=>{
   const encode=x=>{const bytes=new Uint8Array(x.length*2),v=new DataView(bytes.buffer);for(let i=0;i<x.length;i++)v.setInt16(i*2,Math.max(-32768,Math.min(32767,Math.round(x[i]*32767))),true);let s='';for(let i=0;i<bytes.length;i+=16000)s+=String.fromCharCode(...bytes.subarray(i,i+16000));return btoa(s);};
   resolve({first:data.first,sampleRate:c.sampleRate,channels:data.channels.map(encode)});
   if(master)__measure.analyser.disconnect(node);else sources.forEach(s=>s.disconnect(merger));merger.disconnect();node.disconnect();sink.disconnect();node.port.close();
  };});
 };
}
'''


def music(path,bpm,carrier):
    sr=24000;seed=19;data=array.array('h');period=60/(bpm or 120)
    for i in range(sr*12):
        t=i/sr;u=(t-.14+period)%period
        seed=(1664525*seed+1013904223)&0xffffffff
        kick=.34*math.sin(2*math.pi*(76*u-30*u*u))*math.exp(-u*27)
        hat=(seed/2147483648-1)*.045*math.exp(-((t-.14+period/2)%(period/2))*130)
        chord=sum(.018*math.sin(2*math.pi*hz*t)for hz in [261.6256,329.6276,391.9954])
        value=.16*math.sin(2*math.pi*carrier*t)+(kick+hat+chord if bpm else 0)
        data.append(int(max(-.95,min(.95,value))*32767))
    with wave.open(str(path),'wb')as w:
        w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr);w.writeframes(data.tobytes()*11)


def decode(record):
    return [array.array('h',base64.b64decode(x))for x in record['channels']]


def beat_times(samples,sr,period):
    low=energy=0.;alpha=1-math.exp(-2*math.pi*130/sr);smooth=1-math.exp(-1/(.008*sr));envelope=[]
    for x in samples:
        low+=alpha*(x/32768-low);energy+=smooth*(low*low-energy);envelope.append(energy)
    threshold=max(envelope)*.32
    candidates=[i for i in range(1,len(envelope)-1)if envelope[i]>threshold and envelope[i]>envelope[i-1]and envelope[i]>=envelope[i+1]]
    chosen=[]
    for i in sorted(candidates,key=lambda i:envelope[i],reverse=True):
        if all(abs(i-j)>sr*period*.5 for j in chosen):chosen.append(i)
    return sorted(i/sr for i in chosen)


def run(page,check,native=False):
    with tempfile.TemporaryDirectory()as td:
        paths=[]
        for name,bpm,hz in [('BPM120',120,440),('BPM125',125,660),('Alias120',120,660),('NoBeat',0,440)]:
            path=Path(td)/(name+'.wav');music(path,bpm,hz);paths.append(path)
        page.click('#djPauseAll');page.set_input_files('#file',[{'name':p.name,'mimeType':'audio/wav','buffer':p.read_bytes()}for p in paths])
        page.evaluate("window.__caseTracks=Object.fromEntries(DekaDesktopPlayer.files().filter(t=>['BPM120','BPM125','Alias120','NoBeat'].includes(t.title)).map(t=>[t.title,t]))")
        def reset(a='BPM120',b='BPM125'):
            page.evaluate('''([a,b])=>{__dj.pause('A');__dj.pause('B');__dj.clear('A');__dj.clear('B');__dj.setRepeat(false);__dj.setAutoMix(false);__dj.setCross(0);__djopts.fadeSeconds=1.4;const list=[__caseTracks[a],__caseTracks[b]];__dj.load('A',list,0);__dj.load('B',list,1);for(const side of ['A','B']){__dj.setKeyLock(side,true);__dj.setGain(side,1);for(let i=0;i<3;i++)__dj.setEQ(side,i,0);}}''',[a,b])
            page.wait_for_function('__dj.state.A.duration>130&&__dj.state.B.duration>130&&__dj.state.A.analysisStatus==="ready"&&__dj.state.B.analysisStatus==="ready"&&__dj.state.A.brakeStatus==="ready"&&__dj.state.B.brakeStatus==="ready"')
        reset();page.evaluate('(async()=>{'+RECORDER+';await setupRecorder();})()')
        for side in ['A','B']:
            button=page.locator(f'[data-cue={side}]');marker=page.locator('#djCueMarker'+side)
            page.evaluate(f"__dj.seek('{side}',30)");button.click()
            check(side+' CUE press 1 stores 00:30 and shows button plus fixed marker',page.evaluate(f'__dj.state.{side}.cueActive&&Math.abs(__dj.state.{side}.cue-30)<.01')and button.get_attribute('aria-pressed')=='true'and marker.is_visible())
            left=marker.evaluate('e=>e.style.left');page.evaluate(f"__dj.seek('{side}',45)");button.click()
            check(side+' CUE press 2 returns to 00:30 and preserves the marker',page.evaluate(f'__dj.state.{side}.cueStage===2&&__dj.state.{side}.cueActive&&Math.abs(__dj.state.{side}.time-30)<.05')and marker.evaluate('e=>e.style.left')==left)
            button.click()
            check(side+' CUE press 3 only deletes the mark without rewinding',page.evaluate(f'!__dj.state.{side}.cueActive&&Math.abs(__dj.state.{side}.time-30)<.05')and not marker.is_visible()and button.get_attribute('aria-pressed')=='false')
            page.evaluate(f"__dj.seek('{side}',70)");button.click();page.evaluate(f"__dj.seek('{side}',80)");button.click()
            check(side+' CUE press 4/5 installs and returns to a new 01:10 mark',page.evaluate(f'__dj.state.{side}.cueActive&&__dj.state.{side}.cueStage===2&&Math.abs(__dj.state.{side}.time-70)<.05'))
            button.click();check(side+' CUE press 6 deletes the second mark',page.evaluate(f'!__dj.state.{side}.cueActive&&Math.abs(__dj.state.{side}.time-70)<.05'))
        page.evaluate("__dj.seek('B',30);__dj.cue('B');__dj.seek('A',0);__dj.cue('A')")
        check('CUE at 00:00 is active and independent from B at 00:30',page.evaluate('__dj.state.A.cueActive&&__dj.state.A.cue===0&&__dj.state.B.cueActive&&__dj.state.B.cue===30')and page.locator('#djCueMarkerA').is_visible())
        page.evaluate("__dj.load('A',[__caseTracks.NoBeat],0)")
        check('Loading another track discards A cue while preserving B cue',page.evaluate('!__dj.state.A.cueActive&&__dj.state.A.cueStage===0&&__dj.state.B.cueActive&&__dj.state.B.cue===30'))

        # Full fades and actual audio beat capture in both directions, with CUE untouched.
        for old,new,cue in [('A','B',30),('B','A',70)]:
            reset()
            # Separate user actions: Chromium's WAV demuxer can stall after several
            # unfinished seeks issued inside one JavaScript task.
            for command in [f"__dj.seek('{new}',{cue})",f"__dj.cue('{new}');__dj.seek('{new}',{cue+5})",f"__dj.cue('{new}')"]:
                page.evaluate(command);page.wait_for_function(f"!currentAudio('{new}').seeking&&currentAudio('{new}').readyState>=3")
            page.evaluate(f"__djopts.fadeSeconds=17;window.__entry=null;currentAudio('{new}').addEventListener('playing',()=>__entry={{time:currentAudio('{new}').currentTime,cue:__dj.state.{new}.cue,active:__dj.state.{new}.cueActive,stage:__dj.state.{new}.cueStage}},{{once:true}});__dj.setAutoMix(true);__dj.play('{old}')")
            page.wait_for_function(f'!__dj.state.{old}.paused');page.evaluate(f"__dj.seek('{old}',__dj.state.{old}.duration-currentAudio('{old}').playbackRate*17.85)")
            page.wait_for_function('__dj.diagnostics().mixing',timeout=5000)
            entry=page.evaluate('__entry');check(old+'→'+new+' starts at exact active CUE after Return, without consuming it',abs(entry['time']-cue)<.12 and entry['active']and entry['stage']==2,**entry)
            page.wait_for_timeout(700);print('Before audio capture',page.evaluate("['A','B'].map(s=>({side:s,time:currentAudio(s).currentTime,ready:currentAudio(s).readyState,seeking:currentAudio(s).seeking,status:__dj.state[s].status,cross:__dj.diagnostics().cross}))"),flush=True);page.evaluate('startRecord(3)');record=page.evaluate('window.__recording');pcm=decode(record)
            target=page.evaluate('__dj.diagnostics().transition.targetBPM');period=60/target
            aa=beat_times(pcm[0],record['sampleRate'],period);bb=beat_times(pcm[1],record['sampleRate'],period)
            if not aa or not bb:
                print('Beat capture diagnostic',{'peak':[max(abs(x)for x in ch)for ch in pcm],'hitsA':aa,'hitsB':bb,'players':page.evaluate("['A','B'].map(s=>({side:s,time:currentAudio(s).currentTime,paused:currentAudio(s).paused,rate:currentAudio(s).playbackRate}))")},flush=True)
            errors=[min(abs(a-b)for b in bb)for a in aa if bb and .2<a<2.8]
            median=statistics.median(errors)if errors else 99;maximum=max(errors)if errors else 99
            check(old+'→'+new+' aligns actual recorded drum hits, not just BPM labels',len(aa)>=4 and len(bb)>=4 and median<.035 and maximum<.065,median_error_ms=median*1000,max_error_ms=maximum*1000,hitsA=aa,hitsB=bb)
            page.wait_for_function(f'__dj.state.{old}.lastTransition?.completed&&!__dj.diagnostics().mixing',timeout=20000)
            result=page.evaluate(f'__dj.state.{old}.lastTransition')
            check(old+'→'+new+' CUE transition lasts real 17s and retains matched speed',abs(result['elapsed']-17)<.2 and result['duration']==17 and result['matched']and result['cue']==cue and page.evaluate(f'__dj.state.{new}.cueActive&&__dj.state.{new}.cueStage===2'),elapsed=result['elapsed'],phase=result['phase'])

        # No mark, deleted mark and active zero must start the same way in both directions.
        for old,new in [('A','B'),('B','A')]:
            for mode in ['none','deleted','zero']:
                reset();page.evaluate(f"__dj.seek('{new}',{0 if mode=='zero'else 30})")
                if mode!='none':page.evaluate(f"__dj.cue('{new}')")
                if mode=='deleted':page.evaluate(f"__dj.cue('{new}');__dj.cue('{new}')")
                page.evaluate(f"window.__entry=null;currentAudio('{new}').addEventListener('playing',()=>__entry=currentAudio('{new}').currentTime,{{once:true}});__djopts.fadeSeconds=.8;__dj.setAutoMix(true);__dj.play('{old}')")
                page.wait_for_function(f'!__dj.state.{old}.paused');page.evaluate(f"__dj.seek('{old}',__dj.state.{old}.duration-currentAudio('{old}').playbackRate*1.55)");page.wait_for_function('__dj.diagnostics().mixing',timeout=5000)
                check(old+'→'+new+' '+mode+' CUE starts from 00:00',page.evaluate('__entry!==null&&__entry<.12')and page.evaluate(f'__dj.state.{new}.cueActive')==(mode=='zero'),start=page.evaluate('__entry'))

        reset();page.locator('#djBPMB').fill('130');page.locator('#djBPMB').blur();page.evaluate("__dj.setRate('B',1.04);__dj.play('B')");page.wait_for_function('!__dj.state.B.paused')
        page.evaluate("(()=>{const real=performance.now.bind(performance);let t=0;performance.now=()=>t;for(let i=0;i<5;i++){t=i*60000/130;__dj.tap('B');}performance.now=real;})()")
        check('TAP of a playing pitched deck corrects source BPM exactly once',page.evaluate('Math.abs(__dj.state.B.bpm-125)<.1')and page.locator('#djBPMB').input_value()=='125')
        page.evaluate("__dj.pause('B');__dj.setRate('A',1.04);__dj.setAutoMix(true);__dj.play('A')");page.wait_for_function('!__dj.state.A.paused');page.evaluate("__dj.seek('A',__dj.state.A.duration-currentAudio('A').playbackRate*2.2)");page.wait_for_function('__dj.diagnostics().mixing',timeout=5000)
        value=page.evaluate("({out:currentAudio('A').playbackRate,incoming:currentAudio('B').playbackRate,target:__dj.diagnostics().transition.targetBPM,matched:__dj.diagnostics().transition.matched})")
        check('Outgoing manual tempo and TAP determine the actual incoming speed',value['matched']and abs(value['out']-1.04)<.0001 and abs(value['incoming']-.9984)<.0001 and abs(value['target']-124.8)<.1,**value)

        for bpm in [60,240]:
            reset('BPM120','Alias120');page.evaluate(f"__dj.setBPM('B',{bpm});__dj.setAutoMix(true);__dj.play('A')");page.wait_for_function('!__dj.state.A.paused');page.evaluate("__dj.seek('A',__dj.state.A.duration-2.2)");page.wait_for_function('__dj.diagnostics().mixing',timeout=5000)
            check('Half/double BPM '+str(bpm)+' resolves without double-speed playback',page.evaluate("__dj.diagnostics().transition.matched&&currentAudio('B').playbackRate===1&&__dj.state.B.syncBPM===120")and '120.0'in page.locator('#djEffectiveBPMB').inner_text())
        for a,bpm,reason in [('NoBeat',None,'no-bpm'),('BPM120',180,'range')]:
            reset(a,'BPM125');page.evaluate("__dj.setRate('B',.97)")
            if bpm:page.evaluate(f"__dj.setBPM('B',{bpm})")
            page.evaluate("__dj.setAutoMix(true);__dj.play('A')");page.wait_for_function('!__dj.state.A.paused');page.evaluate("__dj.seek('A',__dj.state.A.duration-2.2)");page.wait_for_function('__dj.diagnostics().mixing',timeout=5000)
            check(reason+' falls back to real manual speed and explicitly disables BPM sync',page.evaluate(f"!__dj.diagnostics().transition.matched&&__dj.diagnostics().transition.reason==='{reason}'&&Math.abs(currentAudio('B').playbackRate-.97)<.0001")and 'Без BPM SYNC'in page.locator('#djAutoState').inner_text())

        reset();page.evaluate("__djopts.fadeSeconds=2.5;__dj.setAutoMix(true);__dj.play('A')");page.wait_for_function('!__dj.state.A.paused');page.evaluate("__dj.seek('A',__dj.state.A.duration-3.3)");page.wait_for_function('__dj.diagnostics().mixing',timeout=5000)
        page.locator('#djRateA').fill('4');page.wait_for_timeout(450)
        rates=page.evaluate("({a:currentAudio('A').playbackRate,b:currentAudio('B').playbackRate,sync:__dj.diagnostics().transition.matched})")
        check('Manual master tempo smoothly retargets both decks without fighting the slider',rates['sync']and abs(rates['a']-1.04)<.0001 and abs(rates['b']-.9984)<.0001,**rates)
        page.locator('#djRateB').fill('8');page.wait_for_timeout(450)
        check('An out-of-range manual adjustment wins and releases sync',page.evaluate("Math.abs(currentAudio('B').playbackRate-1.08)<.0001&&!__dj.diagnostics().transition.matched")and 'ручной темп'in page.locator('#djAutoState').inner_text())
        reset();page.evaluate("__djopts.fadeSeconds=2;__dj.seek('B',15);__dj.cue('B');__dj.play('A');__dj.play('B')");page.wait_for_function('!__dj.state.A.paused&&!__dj.state.B.paused');page.evaluate("__dj.setAutoMix(true);__dj.seek('A',__dj.state.A.duration-2.8)");page.wait_for_function('__dj.diagnostics().mixing',timeout=5000)
        check('Two manually playing tracks match BPM without rewinding to CUE',page.evaluate("currentAudio('B').currentTime>15&&Math.abs(currentAudio('B').playbackRate-.96)<.0001&&__dj.state.A.lastTransition.cue===null"))
        page.click('#djPauseAll');page.evaluate('__djopts.fadeSeconds=17')
        from desktop_fx_cases import run as fx_cases
        fx_cases(page,check,reset)


if __name__=='__main__':
    import ast,functools,http.server,os,threading
    from playwright.sync_api import sync_playwright
    hook=next(ast.literal_eval(n.value)for n in ast.parse((ROOT/'tests/desktop_session.py').read_text()).body if isinstance(n,ast.Assign)and any(isinstance(t,ast.Name)and t.id=='HOOK'for t in n.targets))
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*a):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'src')));threading.Thread(target=server.serve_forever,daemon=True).start();checks=[]
    def check(name,ok,**data):
        checks.append(dict(test=name,passed=bool(ok),**data));print(('PASS 'if ok else'FAIL ')+name,data,flush=True);assert ok,(name,data)
    try:
        with sync_playwright()as p:
            b=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required']);c=b.new_context(viewport={'width':1120,'height':780});c.add_init_script(hook);c.route('https://**',lambda r:r.abort());page=c.new_page();page.on('pageerror',lambda e:print('PAGE ERROR',str(e),flush=True));page.goto(f'http://127.0.0.1:{server.server_port}/index.html');page.click('#djToggle');run(page,check);b.close()
    finally:
        (ROOT/'test-output/bpm-development-report.json').write_text(json.dumps({'tests':checks},ensure_ascii=False,indent=2));server.shutdown()
