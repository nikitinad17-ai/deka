"""Desktop Reverse 0.18: real audio handoffs and both Shuffle controls."""
import json
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]


def run(page,check,native=False):
    page.evaluate("window.__reverseTracks=DekaDesktopPlayer.files().filter(t=>t.title.startsWith('Track-'));window.__originalRandom=Math.random")
    def reset(side='A',auto=True):
        page.evaluate('''([side,auto])=>{__dj.pause('A');__dj.pause('B');__dj.clear('A');__dj.clear('B');DekaDesktopPlayer.setShuffle(false);__dj.setRepeat(false);__dj.setCross(side==='A'?-1:1);__djopts.reverseMix=true;__djopts.fadeSeconds=17;__dj.load('A',__reverseTracks,0);__dj.load('B',__reverseTracks,1);for(const s of ['A','B']){__dj.setGain(s,1);__dj.setKeyLock(s,true);for(let i=0;i<3;i++)__dj.setEQ(s,i,0);for(const name of DekaEffects.names)__dj.setEffect(s,name,false,.35);}__dj.setAutoMix(auto);}''',[side,auto])
        page.wait_for_function("['A','B'].every(s=>__dj.state[s].duration>40&&__dj.state[s].analysisStatus==='ready'&&__dj.state[s].brakeStatus==='ready')")
    def watch(new):
        page.evaluate(f'''window.__reverseStarts=[];currentAudio('{new}').addEventListener('playing',()=>__reverseStarts.push(currentAudio('{new}').currentTime));window.__reverseSamples=[];window.__reverseSampler=setInterval(()=>__reverseSamples.push({{...outputStats(),cross:__dj.diagnostics().cross,low:__dj.state.{new}.eq[0]+__dj.state.{new}.autoEQ[0]}}),25)''')
    for side in ['A','B']:
        to='B'if side=='A'else'A'
        for seconds in [1.5,2.5,3.5]:
            reset(side);page.evaluate(f"__dj.seek('{to}',7)");page.wait_for_function(f"!currentAudio('{to}').seeking");page.evaluate(f"__dj.cue('{to}');__dj.play('{side}')");page.wait_for_function(f'!__dj.state.{side}.paused');page.wait_for_timeout(150);watch(to)
            page.click(f'[data-side="{side}"][data-brake="{seconds}"]');page.wait_for_function(f'__dj.state.{side}.braking!==null');identifier=page.evaluate(f'__dj.state.{side}.braking.id')
            page.wait_for_function(f'__dj.diagnostics().lastReverse?.id==={identifier}',timeout=6000);page.evaluate('clearInterval(__reverseSampler)')
            d=page.evaluate(f"({{result:__dj.diagnostics().lastReverse,starts:__reverseStarts,samples:__reverseSamples,to:__dj.state.{to}.track.title,playing:!__dj.state.{to}.paused,cue:__dj.state.{to}.cue,active:__dj.state.{to}.cueActive,cross:__dj.diagnostics().cross,players:__dj.diagnostics().localPlayers}})")
            values=d['samples'];minimum=min(x['rms']for x in values);direction=1 if to=='B'else-1
            check(f'{side}→{to} Reverse {seconds}s starts prepared CUE once and reaches the exact audio-clock stop',d['result']['elapsed']==seconds and d['result']['duration']==seconds and d['playing']and len(d['starts'])==1 and abs(d['starts'][0]-7)<.12 and d['active']and d['cue']==7 and d['players']==2,duration=d['result']['elapsed'],entry=d['starts'])
            check(f'{side}→{to} Reverse {seconds}s fades volume and bass continuously without a sound gap',minimum>.003 and min(x['low']for x in values)<-4 and values[-1]['low']>-.5 and abs(d['cross']-direction)<.001 and all((b['cross']-a['cross'])*direction>=-.001 for a,b in zip(values,values[1:])),minimum_rms=minimum,peak=max(x['peak']for x in values))
            if side=='A'and seconds==1.5:
                page.wait_for_function("__dj.state.A.track.title==='Track-02'&&__dj.state.A.analysisStatus==='ready'")
                page.evaluate("__dj.seek('B',__dj.state.B.duration-currentAudio('B').playbackRate*17.85)");page.wait_for_function('__dj.diagnostics().mixing',timeout=5000)
                page.wait_for_function('__dj.state.B.lastTransition?.completed&&!__dj.diagnostics().mixing',timeout=21000)
                elapsed=page.evaluate('__dj.state.B.lastTransition.elapsed')
                check('Ordinary 17-second Auto Mix resumes after a Reverse handoff',abs(elapsed-17)<.2 and page.evaluate("__dj.state.A.track.title==='Track-02'&&!__dj.state.A.paused"),elapsed=elapsed)
        for seconds in [1.5,2.5,3.5]:
            reset(side,False);page.evaluate(f"__dj.seek('{side}',5)");page.wait_for_function(f"!currentAudio('{side}').seeking");page.evaluate(f"__dj.cue('{side}');__dj.play('{side}')");page.wait_for_function(f'!__dj.state.{side}.paused');watch(to)
            page.click(f'[data-side="{side}"][data-brake="{seconds}"]');page.wait_for_function(f'__dj.state.{side}.braking!==null');identifier=page.evaluate(f'__dj.state.{side}.braking.id');page.wait_for_function(f'__dj.state.{side}.lastBrake?.id==={identifier}&&__dj.state.{side}.paused',timeout=6000);page.evaluate('clearInterval(__reverseSampler)')
            check(f'{side} Reverse {seconds}s with Auto Mix OFF leaves the other deck stopped and keeps CUE',page.evaluate(f"__dj.state.{to}.paused&&__reverseStarts.length===0&&__dj.state.{side}.cueActive&&__dj.state.{side}.cue===5&&__dj.state.{side}.keyLock&&__dj.state.{side}.lastBrake.elapsed==={seconds}&&!__dj.diagnostics().reverse"))
        reset(side);page.evaluate(f"__dj.seek('{to}',11);__dj.cue('{to}');__dj.play('A');__dj.play('B')");page.wait_for_function('!__dj.state.A.paused&&!__dj.state.B.paused');watch(to);before=page.evaluate(f"currentAudio('{to}').currentTime")
        page.click(f'[data-side="{side}"][data-brake="1.5"]');page.wait_for_function(f'__dj.state.{side}.braking!==null');identifier=page.evaluate(f'__dj.state.{side}.braking.id');page.wait_for_function(f'__dj.diagnostics().lastReverse?.id==={identifier}',timeout=5000);page.evaluate('clearInterval(__reverseSampler)')
        check(f'{side}→{to} preserves an already playing target without a second play event or a rewind',page.evaluate(f"__reverseStarts.length===0&&currentAudio('{to}').currentTime>{before}+1.2&&!__dj.state.{to}.paused"))
        reset(side);page.evaluate(f"__dj.clear('{to}');__dj.play('{side}')");page.wait_for_function(f'!__dj.state.{side}.paused');before=page.evaluate(f"currentAudio('{side}').currentTime");page.click(f'[data-side="{side}"][data-brake="1.5"]');page.wait_for_timeout(200)
        check(f'{side} with an empty target gives a hint before stopping any music',page.evaluate(f"!__dj.state.{side}.braking&&!__dj.state.{side}.paused&&!__dj.state.{to}.track&&currentAudio('{side}').currentTime>{before}+.1")and f'деку {to}'in page.locator('#djMessage').inner_text())
    reset();page.evaluate("__dj.play('A')");page.wait_for_function('!__dj.state.A.paused');watch('B')
    for seconds in [1.5,2.5,3.5]:
        page.click(f'[data-side="A"][data-brake="{seconds}"]');page.wait_for_timeout(120)
    identifier=page.evaluate('__dj.state.A.braking.id');page.wait_for_function(f'__dj.diagnostics().lastReverse?.id==={identifier}',timeout=6000);page.evaluate('clearInterval(__reverseSampler)')
    check('Repeated Reverse presses replace the stop and handoff without replaying B',page.evaluate('__reverseStarts.length===1&&__dj.diagnostics().lastReverse.duration===3.5&&!__dj.diagnostics().preparing&&!__dj.diagnostics().phaseTimer')and min(x['rms']for x in page.evaluate('__reverseSamples'))>.003)
    reset();page.evaluate("__dj.play('A')");page.wait_for_function('!__dj.state.A.paused');page.evaluate("window.__resume=__measure.context.resume.bind(__measure.context);__measure.context.resume=()=>new Promise(r=>window.__releaseReverse=r);__dj.brake('A',1.5)");page.wait_for_function('__dj.state.B.pending');before=page.evaluate("currentAudio('A').currentTime");page.wait_for_timeout(150)
    check('Waiting for target playback keeps the outgoing audio playing at full selected speed',page.evaluate(f"!__dj.state.A.braking&&!__dj.state.A.paused&&currentAudio('A').currentTime>{before}+.1"))
    page.click('#djPauseAll');page.evaluate('__releaseReverse();__measure.context.resume=__resume');page.wait_for_timeout(250)
    check('Pause both cancels a pending Reverse play promise with no late restart',page.evaluate('__dj.state.A.paused&&__dj.state.B.paused&&!__dj.state.A.braking&&!__dj.diagnostics().preparing'))
    reset();page.evaluate("__dj.load('B',[{key:'stale-file',kind:'file',title:'Expired old URL',url:'blob:http://127.0.0.1/expired-deka-url'}],0);__dj.state.B.autoBlocked=true;__dj.play('A')");page.wait_for_function('__dj.state.B.status==="error"&&!__dj.state.A.paused');page.click('[data-side="A"][data-brake="1.5"]');page.wait_for_timeout(100)
    check('An expired restored file URL cannot stop a valid newly loaded track',page.evaluate('!__dj.state.A.braking&&!__dj.state.A.paused'))
    reset();page.evaluate("__dj.clear('A');__dj.clear('B');__dj.load('A',__reverseTracks,0);__dj.play('A')");page.wait_for_function('__dj.state.B.autoLoaded&&__dj.state.B.duration>40');page.evaluate("__dj.pause('A')");page.click('#djShuffle')
    check('Changing SHUF clears all metadata of an invalidated idle preload',page.evaluate('__dj.state.B.track===null&&__dj.state.B.duration===0&&__dj.state.B.bpm===null&&__dj.state.B.analysis===null&&__dj.state.B.rate===1'))
    # Exercise the real Shuffle button in a live fade, with a deterministic non-next choice.
    reset();page.evaluate("__dj.clear('A');__dj.clear('B');__dj.load('A',__reverseTracks,0);__djopts.fadeSeconds=.8;Math.random=()=>.999");page.click('#djShuffle');page.evaluate("__dj.play('A')");page.wait_for_function("__dj.state.B.track?.title==='Track-07'&&__dj.state.B.analysisStatus==='ready'");check('SHUF really preloads a random non-sequential successor',page.evaluate("__dj.diagnostics().shuffle&&__dj.state.B.track.title==='Track-07'"))
    page.evaluate("__dj.seek('A',__dj.state.A.duration-1.6)");page.wait_for_function('__dj.diagnostics().mixing',timeout=5000);page.click('#djShuffle')
    check('Changing SHUF during a fade preserves its running audio transition',page.evaluate('__dj.diagnostics().mixing&&!__dj.diagnostics().shuffle'))
    page.wait_for_function('__dj.state.A.lastTransition?.completed&&!__dj.diagnostics().mixing',timeout=5000);check('The in-flight successor survives SHUF and the next queue returns to sequential order',page.evaluate("__dj.state.B.track.title==='Track-07'&&!__dj.state.B.paused"))
    page.click('#djClose');page.click('#bShuf');page.click('#bPlay');page.wait_for_function('!__audios[0].paused');page.click('#bNext');page.wait_for_function('__audios[0].src===DekaDesktopPlayer.files().at(-1).url')
    check('The main-player SHUF changes the real audio source and shares its setting with DJ',page.locator('#bShuf').get_attribute('aria-pressed')=='true'and page.locator('#djShuffle').get_attribute('aria-pressed')=='true')
    page.click('#bStop');page.click('#bShuf');page.click('#djToggle');page.evaluate('Math.random=__originalRandom;__djopts.fadeSeconds=17;__dj.setAutoMix(true)')
