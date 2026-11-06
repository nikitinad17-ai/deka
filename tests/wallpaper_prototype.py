"""Prototype acceptance only: ordinary window, active monitor, audio and safe fallback.
This deliberately does not claim that the background or Explorer recovery passed.
"""
import ast,ctypes as C,json,os,tempfile,time
from ctypes import wintypes as W
from pathlib import Path
import psutil
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-output';OUT.mkdir(exist_ok=True);rows=[]
assert os.name=='nt' and os.environ.get('GITHUB_ACTIONS')=='true'
def check(name,ok=True,**facts):
 rows.append(dict(test=name,passed=bool(ok),**facts));print(('PASS 'if ok else'FAIL ')+name,facts,flush=True);assert ok,(name,facts)
HOOK=next(ast.literal_eval(n.value)for n in ast.parse((ROOT/'tests/desktop_session.py').read_text(encoding='utf-8')).body if isinstance(n,ast.Assign)and any(getattr(t,'id','')=='HOOK'for t in n.targets))
u=C.WinDLL('user32');u.IsWindowEnabled.restype=W.BOOL;u.IsWindowEnabled.argtypes=[W.HWND]
with sync_playwright() as p,tempfile.TemporaryDirectory() as td:
 browser=p.chromium.connect_over_cdp(os.environ['DEKA_CDP']);context=browser.contexts[0];context.route('https://**',lambda q:q.abort());page=next(x for x in context.pages if 'tauri.localhost'in x.url);page.add_init_script(HOOK);page.reload();page.wait_for_function('()=>!!DekaWallpaper.state')
 def native(mode=None):
  return page.evaluate("__TAURI__.core.invoke('wallpaper_state')"if mode is None else"mode=>__TAURI__.core.invoke('wallpaper_set',{mode,monitor:null})",mode) if mode is not None else page.evaluate("__TAURI__.core.invoke('wallpaper_state')")
 state=native();identity=json.loads((OUT/'native-integrity.json').read_text());process=psutil.Process(identity['pid'])
 check('Separate prototype identity, tray and ordinary non-elevated process',state['mode']=='normal'and state['tray']and not state['autostart']and identity['child']['integrity']==8192 and not identity['child']['elevated']and'ru.volna.deka.wallpaper'in state['settings_file'])
 files=[]
 for i,hz in enumerate([440,660,440,660]):
  f=Path(td)/f'Prototype-{i}.mp3';f.write_bytes((ROOT/'tests/fixtures'/f'dj-{hz}.mp3').read_bytes());files.append(str(f))
 page.click('#djToggle');page.set_input_files('#file',files)
 for side,i in [('A',0),('B',1)]:page.get_by_role('button',name=f'В {side}: Prototype-{i}',exact=True).click()
 page.wait_for_function("()=>['A','B'].every(s=>__dj.state[s].duration>40&&__dj.state[s].analysisStatus==='ready')")
 page.evaluate("__dj.setAutoMix(false);__dj.setRepeat(true);__dj.setBPM('A',120);__dj.setBPM('B',125);__dj.setRate('A',1.04);__dj.setCross(0);__dj.play('A');__dj.play('B');window.__engine=__dj;window.__ctx=__measure.context")
 page.wait_for_function('()=>amp(440)>.02&&amp(660)>.02')
 check('Both actual MP3 decoders are audible; prototype scratching is disabled',page.evaluate("amp(440)>.02&&amp(660)>.02&&!__djopts.vinyl&&document.getElementById('djDiscA').disabled"))
 for mode in ['active','normal','active','normal']:
  before=page.evaluate("currentAudio('A').currentTime");s=native(mode);page.wait_for_timeout(350)
  check(mode+' preserves the same engine, audio clocks and manual tempo',s['mode']==mode and page.evaluate(f"__engine===__dj&&__ctx===__measure.context&&!__dj.state.A.paused&&!__dj.state.B.paused&&currentAudio('A').currentTime>{before}&&Math.abs(__dj.state.A.rate-1.04)<.001&&outputStats().rms>.01"))
  if mode=='active':
   monitor=next(m for m in s['monitors']if m['name']==s['selected'])
   check('Active covers the selected monitor without forced topmost',all(abs(s['rect'][k]-monitor[k])<=2 for k in ['x','y','width','height'])and not(s['ex_style']&8))
  else:check('Normal restores a top-level enabled window',s['parent']==0 and bool(u.IsWindowEnabled(s['hwnd'])))
 s=native('background');page.wait_for_timeout(350);attempt=dict(mode=s['mode'],error=s['error'])
 if s['mode']=='normal':check('Unavailable wallpaper layer falls back to an accessible playing window',bool(s['error'])and bool(u.IsWindowEnabled(s['hwnd']))and page.evaluate('!__dj.state.A.paused&&__engine===__dj&&outputStats().rms>.01'),error=s['error'])
 else:
  native('normal');check('Unverified background attempt returns to a playing normal window',page.evaluate('!__dj.state.A.paused&&__engine===__dj'))
 native('active');page.keyboard.press('Escape');page.wait_for_function('()=>DekaWallpaper.mode==="normal"')
 check('Escape returns to the normal window without stopping playback',page.evaluate('!__dj.state.A.paused&&!__dj.state.B.paused'))
 page.evaluate("__dj.pause('A');__dj.pause('B');__dj.setRepeat(false);__dj.setRate('A',1);__dj.setRate('B',1);__dj.setCross(-1);__dj.setAutoMix(true);__dj.seek('A',__dj.state.A.duration-19);__dj.play('A')")
 page.wait_for_function('()=>__dj.diagnostics().mixing',timeout=6500)
 page.wait_for_function('()=>__dj.state.A.lastTransition?.completed&&!__dj.diagnostics().mixing',timeout=22000)
 transition=page.evaluate('__dj.state.A.lastTransition')
 check('Ordinary-window Auto Mix retains the measured 17-second audio transition',17<=transition['elapsed']<17.5 and page.evaluate('!__dj.state.B.paused&&outputStats().rms>.01'),transition=transition)
 report={'stage':'prototype','background_verified':False,'explorer_restart_verified':False,'physical_multi_monitor_verified':False,'tests':rows,'background_attempt':attempt,'method':'Exact built Windows EXE under an ordinary standard account. Active/normal, real MP3s, clocks, 17s fade, safe fallback and exit. This is NOT full Wallpaper acceptance.'}
 (OUT/'wallpaper-prototype-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
 try:page.evaluate("__TAURI__.core.invoke('wallpaper_exit')")
 except Exception:pass
 for _ in range(40):
  if not process.is_running():break
  time.sleep(.1)
 check('Native Exit terminates the prototype process',not process.is_running())
 report['tests']=rows;(OUT/'wallpaper-prototype-report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
