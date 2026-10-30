"""Desktop UI + measured WebAudio output. Synthetic files; no account or network."""
import json, math, os, struct, tempfile, wave
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'test-output'
OUT.mkdir(exist_ok=True)
results = []
def check(name, ok=True, **details):
    assert ok, f'{name}: {details}'
    results.append(dict(test=name, passed=True, **details))
    print('PASS', name, details or '', flush=True)
def tone(path, hz, seconds=72):
    with wave.open(str(path), 'w') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(24000)
        cycle = b''.join(struct.pack('<h', int(0.5*32767*math.sin(2*math.pi*hz*i/24000))) for i in range(24000))
        w.writeframes(cycle*seconds)
with tempfile.TemporaryDirectory() as tmp, sync_playwright() as p:
    a, b = Path(tmp)/'Test - Tone440.wav', Path(tmp)/'Test - Tone660.wav'
    tone(a, 440); tone(b, 660)
    browser = p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'), headless=True, args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    ctx = browser.new_context(viewport={'width':1360,'height':1100})
    ctx.route('https://**', lambda r: r.abort())
    ctx.add_init_script('''
      window.__ls = {}; window.__calls = [];
      window.__TAURI__ = { core: { invoke: async (cmd, args) => { __calls.push([cmd,args]); } },
        event: { listen: (name, fn) => { (__ls[name] ||= []).push(fn); return Promise.resolve(() => {}); } } };
      Object.defineProperty(window, 'DekaDecks', { configurable:true, set(api) {
        Object.defineProperty(window, 'DekaDecks', { value:api });
        const create=api.create;
        api.create = opts => {
          if (!opts.djMode) return create(opts);
          const context = new AudioContext({sampleRate:48000}), analyser=context.createAnalyser();
          analyser.fftSize=32768; analyser.connect(context.destination);
          opts.context=context; opts.destination=analyser;
          window.__measure={context, analyser}; window.__dj=create(opts); return __dj;
        };
      }});
      window.measure = (ha=440, hb=660) => {
        const {context,analyser}=__measure, x=new Float32Array(analyser.fftSize); analyser.getFloatTimeDomainData(x);
        const amp = hz => { let re=0, im=0, sum=0;
          for(let i=0;i<x.length;i++){ const w=0.5-0.5*Math.cos(2*Math.PI*i/(x.length-1));
            const angle=2*Math.PI*hz*i/context.sampleRate; re+=x[i]*w*Math.cos(angle); im+=x[i]*w*Math.sin(angle); sum+=w; }
          return 2*Math.hypot(re,im)/sum;
        };
        return {a:amp(ha), b:amp(hb), peak:Math.max(...x.map(Math.abs))};
      };
    ''')
    page = ctx.new_page(); errors=[]; page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto((ROOT/'src/index.html').as_uri())
    page.click('#djToggle'); page.set_input_files('#file', [str(a), str(b)])
    page.get_by_role('button', name='В A: Tone440', exact=True).click()
    page.get_by_role('button', name='В B: Tone660', exact=True).click()
    page.wait_for_function("__dj.state.A.duration > 0 && __dj.state.B.duration > 0")
    check('File import in DJ does not autoplay either deck', page.evaluate('__dj.state.A.paused && __dj.state.B.paused'))
    check('Exact tracks assigned independently', page.evaluate("__dj.state.A.track.title==='Tone440' && __dj.state.B.track.title==='Tone660'"))
    page.click('#djPlayA'); page.click('#djPlayB')
    page.wait_for_function("__dj.state.A.time > 1 && __dj.state.B.time > 1")
    page.wait_for_timeout(900)
    center=page.evaluate('measure()')
    check('Measured master contains both frequencies at centre', center['a']>.04 and center['b']>.04, **center)
    page.evaluate("__dj.setCross(-1)"); page.wait_for_timeout(1000); left=page.evaluate('measure()')
    check('A endpoint suppresses B by at least 40 dB', left['b'] < left['a']*.01, **left)
    page.evaluate("__dj.setCross(1)"); page.wait_for_timeout(1000); right=page.evaluate('measure()')
    check('B endpoint suppresses A by at least 40 dB', right['a'] < right['b']*.01, **right)
    page.evaluate("__dj.setCross(0); __dj.setGain('A',0)"); page.wait_for_timeout(1000); muted=page.evaluate('measure()')
    check('Channel A fader mutes only A', muted['a'] < muted['b']*.01 and abs(muted['b']/center['b']-1)<.05, **muted)
    page.evaluate("__dj.setGain('A',1); __dj.setEQ('A',1,-12)"); page.wait_for_timeout(1000); eq=page.evaluate('measure()')
    check('EQ changes only its own signal', eq['a'] < center['a']*.8 and abs(eq['b']/center['b']-1)<.05, **eq)
    page.evaluate("__dj.setEQ('A',1,0); __dj.setMaster(.4)"); page.wait_for_timeout(1000); master=page.evaluate('measure()')
    check('Master scales both channels', abs(master['a']/center['a']-.5)<.03 and abs(master['b']/center['b']-.5)<.03)
    page.evaluate("__dj.setMaster(.8); __dj.setRate('B',1.08)"); page.wait_for_timeout(1000)
    pitched=page.evaluate('measure(440,712.8)')
    check('Tempo changes the actual B audio frequency, leaving A intact', pitched['b'] > .08 and abs(pitched['a']/center['a']-1)<.05, **pitched)
    page.evaluate("__dj.nudge('B',-.04)"); page.wait_for_timeout(1000)
    nudged=page.evaluate('measure(440,686.4)')
    check('Nudge changes actual B audio frequency', nudged['b'] > .08, **nudged)
    page.evaluate("__dj.nudge('B',0); __dj.setRate('B',1); __dj.setMaster(.8); __dj.pause('B'); __dj.seek('B',10); __dj.cue('B'); __dj.setRate('B',1.08); __dj.nudge('B',-.04)")
    a_before=page.evaluate('__dj.state.A.time'); page.wait_for_timeout(450)
    check('Pause/seek/rate/nudge B leave A running', page.evaluate(f'!__dj.state.A.paused && __dj.state.A.time>{a_before} && __dj.state.B.cue===10 && __dj.state.B.rate===1.08'))
    page.evaluate("__dj.nudge('B',0); __dj.setRate('B',1); __dj.play('B')"); page.wait_for_timeout(500); page.evaluate("__dj.cue('B')")
    check('CUE returns B to saved point and pauses', page.evaluate('__dj.state.B.paused && Math.abs(__dj.state.B.time-10)<.1'))
    page.on('dialog', lambda dialog: dialog.dismiss())
    page.get_by_role('button', name='В A: Tone660', exact=True).click()
    check('Cancelling replacement preserves playing A', page.evaluate("__dj.state.A.track.title==='Tone440' && !__dj.state.A.paused"))
    page.evaluate("__dj.play('B')"); page.wait_for_timeout(300)
    page.fill('#djSearch','Tone660')
    check('Search remains independent of transport', page.locator('#djList .dj-row').count()==1 and page.evaluate('!__dj.state.A.paused && !__dj.state.B.paused'))
    page.fill('#djSearch',''); page.set_viewport_size({'width':460,'height':1000}); page.wait_for_timeout(350)
    check('Narrow window keeps both transports running, no horizontal overflow', page.evaluate('!__dj.state.A.paused && !__dj.state.B.paused && document.documentElement.scrollWidth<=innerWidth'))
    page.set_viewport_size({'width':1360,'height':1100}); page.wait_for_timeout(200)
    page.screenshot(path=str(OUT/'desktop-dj.png'), full_page=True)
    # Long overlap checks real advancing media transports for 60 seconds, not a timeout-only assertion.
    page.evaluate("__dj.seek('A',0); __dj.seek('B',0)")
    for i in range(6):
        page.wait_for_timeout(10000)
        check(f'Both independent local files advance: {(i+1)*10}s', page.evaluate(f'!__dj.state.A.paused && !__dj.state.B.paused && __dj.state.A.time>{(i+1)*10-2} && __dj.state.B.time>{(i+1)*10-2}'))
    page.evaluate("__dj.seek('B',71.7)"); page.wait_for_timeout(700)
    check('DJ end does not autoplay next or stop A', page.evaluate("__dj.state.B.status==='ended' && __dj.state.B.track.title==='Tone660' && !__dj.state.A.paused"))
    page.evaluate("__dj.load('B',[{key:'bad',kind:'file',title:'Bad',url:URL.createObjectURL(new Blob(['invalid'],{type:'audio/wav'}))}],0)")
    page.wait_for_function("__dj.state.B.status==='error'")
    check('Decode error in B preserves A', page.evaluate('!__dj.state.A.paused'))
    # Late callbacks from released sources cannot overwrite the current track.
    page.evaluate("__dj.load('B',DekaDesktopPlayer.files(),0); __dj.load('B',DekaDesktopPlayer.files(),1)")
    page.wait_for_function("__dj.state.B.status==='ready'")
    check('Rapid loads keep the newest track', page.evaluate("__dj.state.B.track.title==='Tone660' && __dj.state.B.duration===72"))
    # Peak protection with both channels boosted on the actual output graph.
    page.evaluate("__dj.play('B'); __dj.setGain('A',1); __dj.setGain('B',1); __dj.setMaster(1); for(const side of ['A','B']) for(let band=0;band<3;band++) __dj.setEQ(side,band,12)")
    page.wait_for_timeout(1100); boosted=page.evaluate('measure()')
    check('Measured output stays below safety ceiling with boosted EQ', 0.02 < boosted['peak'] <= .981, **boosted)
    page.evaluate("window.__filesBefore=DekaDesktopPlayer.files; const t=__filesBefore()[0]; DekaDesktopPlayer.files=()=>Array.from({length:1500},(_,i)=>({...t,key:'large-'+i,title:'Track '+String(i).padStart(4,'0')})); window.dispatchEvent(new Event('deka:files'))")
    page.locator('#djList').evaluate('(el)=>el.scrollTop=el.scrollHeight'); page.wait_for_timeout(150)
    check('Desktop DJ reaches last track of a 1500-track library with bounded DOM', page.locator('#djList [data-key="large-1499"]').count()==1 and page.locator('#djList .dj-row').count()<=20)
    page.fill('#djSearch','Track 1499')
    check('Search uses the entire Desktop DJ library', page.locator('#djList .dj-row').count()==1 and '1499' in page.locator('#djList').inner_text())
    page.evaluate("DekaDesktopPlayer.files=__filesBefore")
    check('No JavaScript runtime errors' , not errors, errors=errors)
    page.click('#djClose')
    check('Leaving DJ pauses both; ordinary sets UI remains usable', page.evaluate('__dj.state.A.paused && __dj.state.B.paused'))
    page.click('#tabSets'); check('Sets tab preserved', page.locator('#setApp').is_visible())
    browser.close()
(OUT/'desktop-dj-report.json').write_text(json.dumps({'tests':results,'method':'Hann-window DFT of 32768 samples at 48 kHz, actual master WebAudio output in Chromium. Synthetic mono WAV files 440/660 Hz. Not Windows hardware capture.'},ensure_ascii=False,indent=2))
