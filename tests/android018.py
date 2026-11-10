"""APK 0.18 acceptance: real audio, touch layouts, CUE, FX, BPM transitions and CSP fallback."""
import array,json,math,os,tempfile,wave
from pathlib import Path
from playwright.sync_api import sync_playwright
from mobile_test_support import ROOT,bundle,fixture,INIT
OUT=ROOT/'test-output';OUT.mkdir(exist_ok=True);results=[]
def check(name,ok=True,**facts):
    assert ok,(name,facts)
    results.append(dict(test=name,passed=True,**facts));print('PASS',name,facts or '',flush=True)
with tempfile.TemporaryDirectory()as td,sync_playwright()as p:
    paths=[]
    for bpm,hz in [(120,440),(125,660),(120,330),(125,550)]:
        path=Path(td)/f'BPM{bpm}-{hz}.wav';paths.append(str(path));data=array.array('h');sr=12000
        for i in range(sr*12):
            t=i/sr;u=t%(60/bpm)
            value=.25*math.sin(2*math.pi*hz*t)+.12*math.sin(2*math.pi*110*u)*math.exp(-u*35)+.04*math.sin(2*math.pi*3300*t)
            data.append(int(value*32767))
        with wave.open(str(path),'wb')as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr);w.writeframes(data.tobytes()*11)
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    def open_page(strict=False):
        c=browser.new_context(viewport={'width':844,'height':390},has_touch=True,is_mobile=True)
        allowed="'self' 'unsafe-inline'"+(''if strict else ' blob:');policy=f"default-src 'none'; script-src {allowed}; worker-src {allowed}; style-src 'unsafe-inline'; media-src blob:; connect-src 'none'"
        c.route('https://vk.ru/**',lambda q:q.fulfill(status=200,content_type='text/html; charset=utf-8',headers={'Content-Security-Policy':policy},body=fixture));c.add_init_script(INIT+'\n'+bundle);page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.goto('https://vk.ru/audios42')
        page.locator('#deka-overlay #files').set_input_files(paths)
        page.locator('#deka-overlay #listA .vlrow').first.tap();page.locator('#deka-overlay #listB .vlrow').nth(1).tap()
        page.wait_for_function("()=>['A','B'].every(s=>__dj.state[s].duration===132&&__dj.state[s].brakeStatus==='ready'&&__dj.state[s].fxStatus==='ready')")
        page.evaluate("window.__tracks=__dj.state.A.list;window.__baseRandom=Math.random;window.watch=()=>{window.__samples=[];clearInterval(window.__sampleTimer);window.__sampleTimer=setInterval(()=>{const x=new Float32Array(__measure.analyser.fftSize);__measure.analyser.getFloatTimeDomainData(x);__samples.push({rms:Math.sqrt(x.reduce((a,b)=>a+b*b,0)/x.length),mid:[__dj.state.A.autoEQ[1]+__dj.state.A.eq[1],__dj.state.B.autoEQ[1]+__dj.state.B.eq[1]],bass:[__dj.state.A.autoEQ[0]+__dj.state.A.eq[0],__dj.state.B.autoEQ[0]+__dj.state.B.eq[0]],cross:__dj.diagnostics().cross});},80);};")
        return c,page,errors
    c,page,errors=open_page();ov=lambda q:page.locator('#deka-overlay '+q)
    def reset(side='A',auto=True):
        page.evaluate("""([side,auto])=>{clearInterval(window.__sampleTimer);__dj.pause('A');__dj.pause('B');__dj.clear('A');__dj.clear('B');__dj.setShuffle(false);__dj.setRepeat(false);__dj.setCross(side==='A'?-1:1);__dj.load('A',__tracks,0);__dj.load('B',__tracks,1);['A','B'].forEach(s=>{__dj.setGain(s,1);__dj.setKeyLock(s,true);__dj.setRate(s,1);__dj.setEQ(s,0,0);__dj.setEQ(s,2,0);DekaEffects.names.forEach(n=>__dj.setEffect(s,n,false,.35));__dj.setBPM(s,s==='A'?120:125);});__dj.setAutoMix(auto);}""",[side,auto])
        page.wait_for_function("()=>['A','B'].every(s=>__dj.state[s].duration===132&&__dj.state[s].brakeStatus==='ready')")
    check('APK bundles all six Desktop FX and both PCM processor classes',page.evaluate('DekaEffects.names.length===6&&!!DekaRollTransport&&!!DekaBrakeTransport&&!!DekaBrakeModuleSource'))
    check('Auto Mix defaults on, and APK has no Nudge or Mid input',page.evaluate('__dj.diagnostics().autoMix')and ov('[data-nudge]').count()==0 and ov('[data-eq][data-band="1"]').count()==0)
    for size in [(844,390),(667,375),(390,844),(360,640)]:
        page.set_viewport_size(dict(width=size[0],height=size[1]));page.wait_for_timeout(300);ov('#djBtn').tap();page.wait_for_timeout(250)
        for side in ['A','B']:
            ov('#disc'+side).scroll_into_view_if_needed();box=ov('#disc'+side).bounding_box();assert box['width']>=100 and box['x']>=0 and box['x']+box['width']<=size[0]
            if size[0]>size[1]:
                ov('#tab'+side+'3').tap()
            else:
                check(side+' portrait exposes effects beside the track list',ov('#tab'+side+'3').is_hidden() and ov('#fxPanel'+side).is_visible() and ov('#list'+side).is_visible())
            for selector in ['#play'+side,'[data-cmd=next][data-side='+side+']','#cue'+side,'#tab'+side+'1','#fx'+side+'Flanger','[data-brake='+side+'][data-seconds="3.5"]']:
                el=ov(selector);el.scroll_into_view_if_needed();b=el.bounding_box();assert b['x']>=0 and b['x']+b['width']<=size[0] and b['height']>=28
        check(f'Touch controls and larger discs fit {size[0]}x{size[1]} with scroll access',disc_width=box['width'])
        if size in [(844,390),(390,844)]:
            ov('#message').evaluate('(e)=>e.hidden=true');ov('.console').evaluate('(e)=>e.scrollTop=0');page.screenshot(path=str(OUT/f'android018-{size[0]}x{size[1]}.png'))
    page.set_viewport_size({'width':844,'height':390});page.wait_for_timeout(300);ov('#djBtn').tap();page.wait_for_timeout(250)
    ov('[data-gain=A]').fill('65');ov('[data-eq=A][data-band="0"]').fill('-8');ov('[data-eq=B][data-band="2"]').fill('5')
    check('Gain and outer Low/High controls are independent; Mid stays neutral',page.evaluate('__dj.state.A.gain===.65&&__dj.state.B.gain===1&&__dj.state.A.eq[0]===-8&&__dj.state.B.eq[0]===0&&__dj.state.B.eq[2]===5&&__dj.state.A.eq[2]===0&&__dj.state.A.eq[1]===0&&__dj.state.B.eq[1]===0'))
    for side in ['A','B']:
        reset(side,False);page.evaluate(f"__dj.seek('{side}',7);__dj.play('{side}')");page.wait_for_function(f'()=>!__dj.state.{side}.paused');ov('#cue'+side).tap();cue=page.evaluate(f'__dj.state.{side}.cue')
        check(side+' CUE sets a point while music keeps playing',7<=cue<8 and page.evaluate(f'!__dj.state.{side}.paused&&__dj.state.{side}.cueStage===1'))
        page.evaluate(f"__dj.seek('{side}',18)");ov('#cue'+side).tap();page.wait_for_function(f'()=>Math.abs(currentAudio("{side}").currentTime-{cue})<.05')
        check(side+' CUE returns to its own point',page.evaluate(f'__dj.state.{side}.paused&&__dj.state.{side}.cueStage===2'))
        ov('#cue'+side).tap();check(side+' third CUE deletes without starting or stopping',page.evaluate(f'!__dj.state.{side}.cueActive&&__dj.state.{side}.paused'))
        page.evaluate(f"__dj.seek('{side}',10)");ov('#cue'+side).tap();other='B'if side=='A'else'A';page.evaluate(f"__dj.seek('{other}',4);__dj.cue('{other}');__dj.load('{side}',__tracks,2)")
        check(side+' fourth CUE can be replaced; changing its track preserves other cue',page.evaluate(f'!__dj.state.{side}.cueActive&&__dj.state.{other}.cueActive&&__dj.state.{other}.cue===4'))
    for side in ['A','B']:
        other='B'if side=='A'else'A';reset(side)
        page.evaluate(f"__dj.play('{side}')");page.wait_for_function(f'()=>!__dj.state.{side}.paused');page.evaluate(f"watch();__dj.seek('{side}',112.8)")
        page.wait_for_function('()=>__dj.diagnostics().mixing',timeout=7000);page.wait_for_timeout(600)
        rates=page.evaluate(f"[currentAudio('{side}').playbackRate,currentAudio('{other}').playbackRate,__dj.diagnostics().transition]")
        effective=page.evaluate(f"(__dj.state.{other}.bpm||__dj.state.{other}.analysis.bpm)*currentAudio('{other}').playbackRate")
        check(side+' to '+other+' Auto Mix matches the real decoder rate and BPM display',rates[2]['matched']and abs(rates[0]*(120 if side=='A'else 125)-rates[1]*(125 if side=='A'else 120))<.8 and abs(float(ov('#effectiveBPM'+other).inner_text().split()[0])-effective)<.11,rates=rates[:2])
        page.wait_for_function(f'()=>__dj.state.{side}.lastTransition?.completed&&!__dj.diagnostics().mixing',timeout=20000)
        facts=page.evaluate(f"({{elapsed:__dj.state.{side}.lastTransition.elapsed,minRMS:Math.min(...__samples.map(s=>s.rms)),mid:Math.max(...__samples.flatMap(s=>s.mid.map(Math.abs))),first:__samples.find(s=>s.bass[{0 if other=='A'else 1}]<-.5)?.bass[{0 if other=='A'else 1}],end:__dj.state.{other}.eq[0]+__dj.state.{other}.autoEQ[0],playing:!__dj.state.{other}.paused}})")
        check(side+' to '+other+' completes a real 17s volume/bass fade with neutral Mid and no signal gap',17<=facts['elapsed']<17.25 and facts['minRMS']>.002 and facts['mid']==0 and facts['first']<-.5 and abs(facts['end'])<.01 and facts['playing'],**facts)
    for auto in [True,False]:
        for side in ['A','B']:
            other='B'if side=='A'else'A'
            for seconds in [1.5,2.5,3.5]:
                reset(side,auto);page.evaluate(f"__dj.seek('{other}',5);__dj.cue('{other}');__dj.play('{side}')");page.wait_for_function(f'()=>!__dj.state.{side}.paused');page.wait_for_timeout(150);page.evaluate('watch()');ov(f'[data-brake={side}][data-seconds="{seconds}"]').tap();page.wait_for_function(f'()=>__dj.state.{side}.lastBrake?.elapsed==={seconds}&&__dj.state.{side}.paused',timeout=6000)
                facts=page.evaluate(f"({{otherPlaying:!__dj.state.{other}.paused,otherTime:currentAudio('{other}').currentTime,mid:Math.max(...__samples.flatMap(s=>s.mid.map(Math.abs))),minRMS:Math.min(...__samples.slice(1).map(s=>s.rms)),completed:__dj.diagnostics().lastReverse?.completed}})")
                check(f'{side} {seconds}s Reverse AUTO={auto} uses real PCM stop and correct other-deck behavior',facts['otherPlaying']==auto and facts['mid']==0 and (not auto or(facts['otherTime']>=5+seconds*.7 and facts['minRMS']>.002 and facts['completed'])),**facts)
    reset();page.evaluate("__dj.play('A');__dj.play('B')");page.wait_for_function('()=>!__dj.state.A.paused&&!__dj.state.B.paused');page.evaluate("__dj.seek('B',22)");ov('[data-brake=A][data-seconds="1.5"]').tap();page.wait_for_function('()=>__dj.state.A.paused')
    check('Reverse preserves an already playing target position',page.evaluate("currentAudio('B').currentTime>23&&!__dj.state.B.paused"))
    reset();page.evaluate("__dj.clear('B');__dj.state.B.autoBlocked=true;__dj.play('A')");page.wait_for_function('()=>!__dj.state.A.paused');ov('[data-brake=A][data-seconds="1.5"]').tap();page.wait_for_timeout(150)
    check('Empty target shows a hint before stopping any music',page.evaluate('!__dj.state.A.paused&&!__dj.state.A.braking')and 'загрузите' in ov('#message').inner_text().lower())
    reset();page.evaluate("__dj.play('A')");page.wait_for_function('()=>!__dj.state.A.paused');ov('[data-brake=A][data-seconds="3.5"]').tap();page.wait_for_timeout(250);ov('[data-brake=A][data-seconds="1.5"]').tap();page.wait_for_function('()=>__dj.state.A.lastBrake?.elapsed===1.5&&__dj.state.A.paused',timeout=5000)
    check('Repeated Reverse taps replace one transition and leave two players',page.evaluate('__dj.diagnostics().localPlayers===2&&!__dj.diagnostics().preparing&&!__dj.diagnostics().reverse&&!__dj.state.B.paused'))
    reset(auto=False);page.evaluate("__dj.setCross(-1);__dj.play('A')");page.wait_for_function('()=>!__dj.state.A.paused');page.wait_for_timeout(300)
    ov('#tabA3').tap()
    for name in ['Flanger','Echo','Reverb','Filter','Phaser','Roll']:
        ov('#amountA'+name).fill('90');ov('#fxA'+name).tap();page.wait_for_timeout(650)
        check(name+' touch button controls a real independent processor',page.evaluate(f"__dj.diagnostics().effects.A.{name}.on&&!__dj.diagnostics().effects.B.{name}.on&&__dj.diagnostics().effects.A.{name}.status==='ready'&&measure().peak>.001"))
        if name=='Roll':check('Roll captures actual prior PCM samples',page.evaluate('__dj.diagnostics().effects.A.Roll.captureFrames>128&&__dj.diagnostics().effects.A.Roll.captureRMS>.05'))
        if name=='Filter':check('Filter attenuates real high-frequency PCM',page.evaluate('measure(3300).amp<.0008'))
        ov('#fxA'+name).tap()
    check('New APK UI has no runtime errors',not errors,errors=errors);c.close()
    c,page,errors=open_page(True);ov=lambda q:page.locator('#deka-overlay '+q)
    check('Strict VK-like CSP uses bundled compatibility Roll',page.evaluate("__dj.diagnostics().effects.A.Roll.backend==='compatibility'&&__dj.state.A.brakeStatus==='ready'"))
    for side in ['A','B']:
        other='B'if side=='A'else'A';page.evaluate(f"__dj.pause('A');__dj.pause('B');__dj.setCross('{side}'==='A'?-1:1);__dj.setAutoMix(true);__dj.seek('{side}',10);__dj.play('{side}')");page.wait_for_function(f'()=>!__dj.state.{side}.paused');ov(f'[data-brake={side}][data-seconds="1.5"]').tap();page.wait_for_function(f'()=>__dj.state.{side}.paused&&!__dj.state.{other}.paused',timeout=6000)
        check(side+' strict-CSP Reverse hands off actual audio',page.evaluate('__dj.diagnostics().lastReverse.completed&&measure().peak>.01'))
    page.evaluate("__dj.setEffect('A','Roll',true,.8);__dj.play('A')");page.wait_for_timeout(800)
    check('Strict-CSP Roll processes real PCM and all FX remain ready',page.evaluate("__dj.diagnostics().effects.A.Roll.captureRMS>.02&&Object.values(__dj.diagnostics().effects.A).every(s=>s.status==='ready')"))
    check('Compatibility bundle has no runtime errors',not errors,errors=errors);c.close();browser.close()
(OUT/'android018-report.json').write_text(json.dumps({'tests':results,'method':'Chromium mobile emulation with real CDP touch in android_dj.py, synthetic beat WAVs, decoder clocks, 48kHz PCM measurement and restrictive CSP. Not physical Android, VK account or system-picker validation.'},ensure_ascii=False,indent=2))
