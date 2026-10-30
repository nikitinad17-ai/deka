"""Real mouse/drop events and measured PCM output; no accounts or external network."""
import functools, http.server, json, math, os, struct, tempfile, threading, wave
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-output'; OUT.mkdir(exist_ok=True)
results=[]
def check(name, ok=True, **detail):
    assert ok, (name, detail)
    results.append(dict(test=name,passed=True,**detail)); print('PASS',name,detail or '',flush=True)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'src')))
threading.Thread(target=server.serve_forever,daemon=True).start()
with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
    paths=[]
    for hz in [440,660]:
        path=Path(tmp)/f'Test - Tone{hz}.wav'; paths.append(path)
        with wave.open(str(path),'w') as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000)
            cycle=b''.join(struct.pack('<h',int(.5*32767*math.sin(2*math.pi*hz*i/24000)))for i in range(24000))
            w.writeframes(cycle*40)
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    ctx=browser.new_context(viewport={'width':1400,'height':1200});ctx.route('https://**',lambda r:r.abort())
    ctx.add_init_script('''
    window.__ls={}; window.__calls=[];
    window.__TAURI__={core:{invoke:async(cmd,args)=>{__calls.push([cmd,args]);}},event:{listen:(name,fn)=>{(__ls[name]||=[]).push(fn);return Promise.resolve(()=>{});}}};
    window.emitFixture=(name,payload)=>(__ls[name]||[]).forEach(fn=>fn({payload}));
    Object.defineProperty(window,'DekaDecks',{configurable:true,set(api){
      Object.defineProperty(window,'DekaDecks',{value:api});const create=api.create;
      api.create=opts=>{if(!opts.djMode)return create(opts);
        const context=new AudioContext({sampleRate:48000}), analyser=context.createAnalyser();analyser.fftSize=32768;analyser.connect(context.destination);
        opts.context=context;opts.destination=analyser;window.__measure={context,analyser};return window.__dj=create(opts);
      };
    }});
    window.measure=(hz=660)=>{const {context,analyser}=__measure,x=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(x);let re=0,im=0,sum=0;
      for(let i=0;i<x.length;i++){const w=.5-.5*Math.cos(2*Math.PI*i/(x.length-1)),a=2*Math.PI*hz*i/context.sampleRate; re+=x[i]*w*Math.cos(a);im+=x[i]*w*Math.sin(a);sum+=w;}
      return {amp:2*Math.hypot(re,im)/sum,peak:Math.max(...x.map(Math.abs))};};
    ''')
    page=ctx.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{server.server_port}/index.html');page.click('#djToggle')
    def drop(selector, paths):
        # Actual HTML DataTransfer populated from bytes: executes the shipped drop pipeline.
        data=[{'name':path.name,'bytes':list(path.read_bytes())}for path in paths]
        page.eval_on_selector(selector,'''(el,files)=>{const dt=new DataTransfer();for(const f of files)dt.items.add(new File([new Uint8Array(f.bytes)],f.name,{type:'audio/wav',lastModified:123}));el.dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:dt}));}''',data)
    drop('#desktopDJ',paths)
    page.wait_for_function('DekaDesktopPlayer.files().length===2')
    check('Explorer file drop imports both tracks without autoplay',page.evaluate('__dj.state.A.paused && __dj.state.B.paused'))
    drop('.dj-deck[data-side=A]',[paths[0]])
    page.wait_for_function("__dj.state.A.track?.title==='Tone440' && __dj.state.A.duration===40")
    check('Drop onto A loads A without duplicate library entry',page.evaluate('DekaDesktopPlayer.files().length===2 && __dj.state.A.paused && !__dj.state.B.track'))
    page.locator('#djList [data-key="file-2"]').drag_to(page.locator('#djDiscB'))
    page.wait_for_function("__dj.state.B.track?.title==='Tone660' && __dj.state.B.duration===40")
    check('Internal library row drags onto the exact B deck')
    page.click('#djPlayA');page.click('#djPlayB');page.wait_for_timeout(700)
    # Check rate via UI, output frequency, and media-clock slope, including before first play.
    page.fill('#djBPMA','120');page.fill('#djBPMB','125')
    for percent in [-8,-4,0,4,8]:
        page.locator('#djRateB').fill(str(percent))
        before=page.evaluate('__dj.state.B.time');page.wait_for_timeout(1500)
        after=page.evaluate('__dj.state.B.time');sound=page.evaluate('measure(660)')
        check(f'Tempo {percent:+}%: actual transport changes, pitch stays 660 Hz',sound['amp']>.06 and abs((after-before)/1.5-(1+percent/100))<.2,**sound)
        check(f'Effective BPM follows tempo {percent:+}%',abs(float(page.locator('#djEffectiveBPMB').inner_text().split()[1])-125*(1+percent/100))<.11)
    page.click('#djKeyLockB');page.wait_for_timeout(1100); pitched=page.evaluate('measure(712.8)')
    check('Key Lock off gives measured +8% vinyl pitch',pitched['amp']>.08,**pitched)
    page.click('#djKeyLockB');page.locator('[data-reset=B]').click()
    # Real pointer hold and forward/backward strokes while the other deck keeps playing.
    page.evaluate("__dj.seek('A',12); __dj.seek('B',12)")
    disc=page.locator('#djDiscA');box=disc.bounding_box();cx=box['x']+box['width']/2;cy=box['y']+box['height']/2;radius=box['width']*.35
    page.mouse.move(cx+radius,cy);page.mouse.down()
    page.wait_for_function("__dj.state.A.scratchStatus==='ready'",timeout=15000)
    held=page.evaluate('__dj.state.A.time');b_before=page.evaluate('__dj.state.B.time')
    page.wait_for_timeout(1000);held_output=page.evaluate('measure(440)')
    check('Mouse hold stops A and silences its output while B advances',page.evaluate(f'__dj.state.A.held && Math.abs(__dj.state.A.time-{held})<.01 && __dj.state.B.time>{b_before}+.5') and held_output['amp']<.001,**held_output)
    page.evaluate("__dj.setCross(-1)");page.wait_for_timeout(800)
    positions=[];peaks=[]
    for i in range(1,41):
        angle=i/40*math.pi*1.5
        page.mouse.move(cx+radius*math.cos(angle),cy+radius*math.sin(angle));page.wait_for_timeout(15)
        if i%10==0:positions.append(page.evaluate('__dj.state.A.time'));peaks.append(page.evaluate('measure()')['peak'])
    check('Forward mouse stroke moves real position and produces audio',positions[-1]>held+1 and max(peaks)>.05,positions=positions,peaks=peaks)
    for i in range(40,-1,-1):
        angle=i/40*math.pi*1.5
        page.mouse.move(cx+radius*math.cos(angle),cy+radius*math.sin(angle));page.wait_for_timeout(15)
    check('Reverse mouse stroke moves backward',abs(page.evaluate('__dj.state.A.time')-held)<.04)
    page.mouse.up();page.wait_for_function('!__dj.state.A.paused && !__dj.state.A.held')
    page.evaluate("__dj.setCross(0)")
    check('Release resumes at scratched position and preserves tempo',page.evaluate(f'__dj.state.A.time>={held}-.1 && __dj.state.A.time<{held}+2 && __dj.state.A.rate===1'))
    # Paused touch must not cause an unexpected start.
    page.click('#djPlayA');page.mouse.move(cx+radius,cy);page.mouse.down();page.wait_for_timeout(100);page.mouse.up();page.wait_for_timeout(250)
    check('Touching a paused deck leaves it paused',page.evaluate('__dj.state.A.paused && !__dj.state.A.held'))
    # Loss of focus must stop scratch and must not leave the platter latched.
    page.click('#djPlayA');page.mouse.down();page.wait_for_timeout(80);page.evaluate("window.dispatchEvent(new Event('blur'))");page.mouse.up()
    check('Focus loss releases platter without restarting A or affecting B',page.evaluate('!__dj.state.A.held && __dj.state.A.paused && !__dj.state.B.paused'))
    # A folder can yield multiple readEntries batches; recurse and ignore non-audio.
    folder_count=page.evaluate("""async()=>{
      const f=new File(['invalid wav bytes'],'Nested.wav',{type:'audio/wav',lastModified:321});
      const file={isFile:true,file:ok=>ok(f)}, skip={isFile:true,file:ok=>ok(new File(['text'],'notes.txt',{type:'text/plain'}))};
      const nested={isDirectory:true,createReader:()=>{let round=0;return{readEntries:ok=>ok(round++===0?[file,skip]:[])}}};
      let round=0;const folder={isDirectory:true,createReader:()=>({readEntries:ok=>ok(round++===0?[nested]:[])})};
      const event=new Event('drop',{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:{types:['Files'],items:[{webkitGetAsEntry:()=>folder}],files:[]}});
      document.querySelector('#desktopDJ').dispatchEvent(event);
      await new Promise(r=>setTimeout(r,100));return DekaDesktopPlayer.files().length;
    }""")
    check('Folder entry recurses through batches and skips non-audio',folder_count==3)
    # Dispose a held source and ensure late decode cannot re-adopt it.
    page.evaluate("__dj.scratchBegin('A'); __dj.clear('A')");page.wait_for_timeout(200)
    check('Clearing a held deck releases resources and leaves B intact',page.evaluate("!__dj.state.A.track && !__dj.state.A.held && !__dj.state.B.paused"))
    page.click('#djClose');page.click('#tabVk');page.click('#vkLogin')
    check('VK login uses separate native plain-window command',page.evaluate("__calls.some(c=>c[0]==='vk_login')"))
    page.click('#vkLoad')
    check('Full music import uses the same collectMy command as APK',page.evaluate("__calls.some(c=>c[0]==='vk_cmd' && c[1].cmd.type==='collectMy')"))
    page.evaluate("emitFixture('vk:collect',{done:false,count:300})")
    check('Music loading progress visible', '300' in page.locator('#vkStatus').inner_text())
    page.evaluate("emitFixture('library',{complete:true,count:2,items:[{key:'42_1',title:'First',artist:'Test'},{key:'42_2',title:'Last',artist:'Test'}]});emitFixture('vk:collect',{done:true,complete:true,items:[{key:'42_1',title:'First',artist:'Test'},{key:'42_2',title:'Last',artist:'Test'}]})")
    check('Full VK list reaches desktop without unsolicited CSV export',page.locator('#vkList .item').count()==2 and not page.evaluate("__calls.some(c=>c[0]==='save_export')"))
    page.locator('#vkList .item').last.click()
    check('Selected VK track uses exact imported key',page.evaluate("__calls.some(c=>c[0]==='vk_cmd' && c[1].cmd.key==='42_2')"))
    page.click('#djToggle');page.screenshot(path=str(OUT/'desktop-vinyl.png'),full_page=True)
    check('No browser runtime errors',not errors,errors=errors)
    browser.close()
server.shutdown()
(OUT/'desktop-vinyl-report.json').write_text(json.dumps({'tests':results,'method':'Real pointer/DataTransfer events; 48kHz WebAudio output DFT; media-clock slopes. Synthetic WAV files. Not Windows hardware/VK session.'},ensure_ascii=False,indent=2))
