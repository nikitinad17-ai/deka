"""Real tape-stop transport, simultaneous decks and old/new DSP comparison."""
import array,base64,json,math,statistics,wave
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]


def run(page,check,reset):
    reset()
    check('Braking a paused or empty deck never starts it',page.evaluate("!__dj.brake('A',.5)&&__dj.state.A.paused&&!__dj.state.A.braking"))
    for side in ['A','B']:
        other='B'if side=='A'else'A'
        for seconds in [.5,1,2]:
            reset();page.evaluate(f"__dj.seek('{side}',5);__dj.cue('{side}');__dj.play('A');__dj.play('B')");page.wait_for_function('!__dj.state.A.paused&&!__dj.state.B.paused');page.wait_for_timeout(250)
            page.select_option('#djBrakeTarget',side)
            before=page.evaluate(f"({{time:currentAudio('{side}').currentTime,other:currentAudio('{other}').currentTime,cross:__dj.diagnostics().cross,rate:__dj.state.{other}.rate,eq:__dj.state.{other}.eq,key:__dj.state.{side}.keyLock}})")
            page.click(f'[data-brake="{seconds:g}"]');page.wait_for_function(f'__dj.state.{side}.braking!==null');page.wait_for_function(f'__dj.state.{side}.braking===null&&__dj.state.{side}.paused',timeout=5000)
            after=page.evaluate(f"({{last:__dj.state.{side}.lastBrake,time:currentAudio('{side}').currentTime,other:currentAudio('{other}').currentTime,cross:__dj.diagnostics().cross,rate:__dj.state.{other}.rate,eq:__dj.state.{other}.eq,key:__dj.state.{side}.keyLock,cue:__dj.state.{side}.cue,active:__dj.state.{side}.cueActive}})")
            check(side+' '+str(seconds)+'s brake reaches pause, preserves CUE/Key Lock and leaves other deck alone',after['last']['elapsed']==seconds and abs(after['time']-after['last']['time'])<.04 and after['active']and after['cue']==5 and after['key']==before['key']and after['other']>before['other']+seconds*.8 and after['rate']==before['rate']and after['eq']==before['eq']and abs(after['cross']-before['cross'])<1e-8,elapsed=after['last']['elapsed'],position=after['time'])
            page.wait_for_timeout(150);check(side+' '+str(seconds)+'s stop stays paused until Play',page.evaluate(f'__dj.state.{side}.paused&&__dj.state.{side}.manualStopped')and page.locator('#djBrakeTarget').input_value()==side)
            page.click('#djPlay'+side);page.wait_for_function(f'!__dj.state.{side}.paused')
            check(side+' resumes from the reached position at normal selected speed',page.evaluate(f"currentAudio('{side}').currentTime>={after['time']-.05}&&Math.abs(currentAudio('{side}').playbackRate-1)<.0001&&!__dj.state.{side}.manualStopped"))

    # Master PCM proves a real pitch fall with Key Lock both enabled and disabled.
    for key_lock in [True,False]:
        reset('NoBeat','BPM125');page.evaluate(f"__dj.setCross(-1);__dj.setKeyLock('A',{str(key_lock).lower()});__dj.play('A');__dj.play('B')");page.wait_for_function('!__dj.state.A.paused&&!__dj.state.B.paused');page.wait_for_timeout(300)
        page.evaluate('startRecord(1.5,true)');page.evaluate("__dj.brake('A',1)");record=page.evaluate('window.__recording');page.wait_for_function('__dj.state.A.paused&&!__dj.state.A.braking');last=page.evaluate('__dj.state.A.lastBrake')
        pcm=array.array('h',base64.b64decode(record['channels'][0]));sr=record['sampleRate'];start=last['audioStart']-record['first']
        def hz(lo,hi):
            left=max(1,int((start+lo)*sr));right=min(len(pcm),int((start+hi)*sr));return sum(pcm[i-1]<0<=pcm[i]for i in range(left,right))/(hi-lo)
        high=hz(.06,.16);low=hz(.46,.56)
        check('Actual tape-stop PCM pitch falls despite Key Lock '+str(key_lock),high>340 and 160<low<280 and page.evaluate('__dj.state.A.keyLock')==key_lock,early_Hz=high,middle_Hz=low)

    reset();page.evaluate("__dj.play('A');__dj.play('B')");page.wait_for_function('!__dj.state.A.paused&&!__dj.state.B.paused');page.evaluate("__dj.brake('A',.5)");page.wait_for_timeout(100);page.evaluate("__dj.brake('A',1)");page.wait_for_timeout(100);page.evaluate("__dj.brake('A',2)");new_id=page.evaluate('__dj.state.A.braking.id');page.wait_for_function(f'__dj.state.A.lastBrake?.id==={new_id}&&__dj.state.A.paused',timeout=5000)
    check('Repeated presses replace the stop without parallel timers or restart',page.evaluate(f'__dj.state.A.lastBrake.id==={new_id}&&__dj.state.A.lastBrake.elapsed===2&&!__dj.diagnostics().phaseTimer&&!__dj.state.B.paused'))

    # A stopped slot is never reused by Auto Mix, even when the other deck ends.
    stopped=page.evaluate('({key:__dj.state.A.track.key,time:__dj.state.A.time,cue:__dj.state.A.cue})');page.evaluate("__dj.setAutoMix(true);__dj.seek('B',__dj.state.B.duration-.15)");page.wait_for_function("__dj.state.B.track.title==='BPM120'&&!__dj.state.B.paused",timeout=5000)
    check('Other-deck natural end advances its own queue while the braked deck stays parked',page.evaluate(f"__dj.state.A.paused&&__dj.state.A.track.key==={json.dumps(stopped['key'])}&&Math.abs(__dj.state.A.time-{stopped['time']})<.05&&__dj.state.A.manualStopped"))

    # Cancellation before and during the automatic transition.
    reset();page.evaluate("__djopts.fadeSeconds=2.5;__dj.setAutoMix(true);__dj.play('A')");page.wait_for_function('!__dj.state.A.paused');page.evaluate("__dj.seek('A',__dj.state.A.duration-3.35)");page.wait_for_function('__dj.diagnostics().phaseTimer&&!__dj.diagnostics().mixing',timeout=5000);page.evaluate("__dj.brake('A',.5)");page.wait_for_function('__dj.state.A.paused&&!__dj.state.A.braking');page.wait_for_timeout(400)
    check('Brake before beat launch cancels pending autoplay',page.evaluate('__dj.state.B.paused&&!__dj.diagnostics().phaseTimer&&!__dj.diagnostics().mixing'))
    for side in ['A','B']:
        other='B'if side=='A'else'A';reset();page.evaluate("__djopts.fadeSeconds=2.5;__dj.setAutoMix(true);__dj.play('A')");page.wait_for_function('!__dj.state.A.paused');page.evaluate("__dj.seek('A',__dj.state.A.duration-3.3)");page.wait_for_function('__dj.diagnostics().mixing',timeout=5000);page.wait_for_timeout(400)
        before=page.evaluate(f"(()=>{{const s=__dj.state.{other},r={{cross:__dj.diagnostics().cross,rate:currentAudio('{other}').playbackRate,eq:s.eq.map((v,j)=>v+s.autoEQ[j])}};__dj.brake('{side}',.5);return r;}})()")
        page.wait_for_function(f'__dj.state.{side}.paused&&!__dj.state.{side}.braking');page.wait_for_timeout(300)
        after=page.evaluate(f"({{cross:__dj.diagnostics().cross,rate:currentAudio('{other}').playbackRate,eq:__dj.state.{other}.eq.map((v,j)=>v+__dj.state.{other}.autoEQ[j]),playing:!__dj.state.{other}.paused}})")
        check(side+' brake during Auto Mix preserves the other deck and exact crossfader',after['playing']and abs(after['cross']-before['cross'])<1e-8 and abs(after['rate']-before['rate'])<1e-8 and max(abs(a-b)for a,b in zip(after['eq'],before['eq']))<1e-8 and page.evaluate(f'__dj.state.{side}.manualStopped&&!__dj.diagnostics().mixing&&!__dj.diagnostics().phaseTimer'),**after)

    # A one-second tone burst followed by silence gives measurable repeats/tails.
    old=(ROOT/'tests/fixtures/deck-effects-0.16.js').read_text()
    comparison=page.evaluate('''async oldSource=>{
      const current=DekaEffects;(0,eval)(oldSource);const previous=DekaEffects;window.DekaEffects=current;
      async function render(api,name,amount){const sr=24000,c=new OfflineAudioContext(2,sr*4.5,sr),fx=api.create(c,c.destination),buffer=c.createBuffer(1,sr*.24,sr),x=buffer.getChannelData(0);
       for(let i=0;i<x.length;i++){const t=i/sr;x[i]=Math.min(1,t/.01)*Math.min(1,(.24-t)/.02)*(.15*Math.sin(2*Math.PI*220*t)+.08*Math.sin(2*Math.PI*440*t)+.04*Math.sin(2*Math.PI*660*t));}
       const source=c.createBufferSource();source.buffer=buffer;source.connect(fx.input);if(name)fx.set(name,true,amount);source.start();const b=await c.startRendering();fx.dispose();return [b.getChannelData(0),b.getChannelData(1)];}
      const stats=x=>{let tail=0,body=0,peak=0;for(let i=0;i<x.length;i++){peak=Math.max(peak,Math.abs(x[i]));if(i>24000*.7)tail+=x[i]**2;if(i<24000*.24)body+=x[i]**2;}return {tail:Math.sqrt(tail/(x.length-24000*.7)),body:Math.sqrt(body/(24000*.24)),peak};};
      const encode=channels=>{const bytes=new Uint8Array(channels[0].length*4),v=new DataView(bytes.buffer);for(let i=0;i<channels[0].length;i++)for(let ch=0;ch<2;ch++)v.setInt16(i*4+ch*2,Math.max(-32768,Math.min(32767,Math.round(channels[ch][i]*32767))),true);let s='';for(let i=0;i<bytes.length;i+=16000)s+=String.fromCharCode(...bytes.subarray(i,i+16000));return btoa(s);};
      const result={effects:{},preserved:{},audio:[]},dry=await render(current,null,0);result.audio.push(encode(dry));
      for(const name of ['Echo','Reverb']){const before=await render(previous,name,1);result.effects[name]={before:stats(before[0]),after:[]};result.audio.push(encode(before));for(const amount of [.1,.5,1]){const after=await render(current,name,amount);result.effects[name].after.push(stats(after[0]));result.audio.push(encode(after));}}
      for(const name of ['Flanger','Filter','Phaser']){const a=await render(previous,name,.65),b=await render(current,name,.65);let difference=0;for(let i=0;i<a[0].length;i++)difference=Math.max(difference,Math.abs(a[0][i]-b[0][i]));result.preserved[name]=difference;}
      return result;
    }''',old)
    for name,data in comparison['effects'].items():
        levels=data['after'];check(name+' low/mid/max slider produces stronger audible tail than 0.16 without overload',levels[0]['tail']<levels[1]['tail']<levels[2]['tail']and levels[2]['tail']>data['before']['tail']*1.4 and max(x['peak']for x in levels)<.981,old=data['before'],new=levels)
    for name,delta in comparison['preserved'].items():check(name+' character is unchanged on identical rendered PCM',delta<.000001,max_difference=delta)
    out=ROOT/'test-output';out.mkdir(exist_ok=True)
    with wave.open(str(out/'Deka-0.17.0-Echo-Reverb.wav'),'wb')as w:
        w.setnchannels(2);w.setsampwidth(2);w.setframerate(24000)
        for clip in comparison['audio']:w.writeframes(base64.b64decode(clip))
    (out/'echo-reverb-comparison.json').write_text(json.dumps({k:v for k,v in comparison.items()if k!='audio'},indent=2))
    reset();page.evaluate('__djopts.fadeSeconds=17;__dj.setAutoMix(true)');check('All preparation timers and rate ramps are gone after repeated actions',page.evaluate('!__dj.diagnostics().phaseTimer&&!__dj.diagnostics().preparing&&__dj.diagnostics().rateRamps===0&&__dj.diagnostics().localPlayers===2'))
