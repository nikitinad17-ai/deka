"""Real Windows shell + exact Wallpaper EXE; actual token recorded in environment."""
import ast,ctypes as C,json,os,subprocess,tempfile,time
from ctypes import wintypes as W
from pathlib import Path
import psutil
from PIL import ImageGrab
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-output';OUT.mkdir(exist_ok=True);results=[]
assert os.name=='nt'and os.environ.get('GITHUB_ACTIONS')=='true'
def check(name,ok=True,**facts):
 assert ok,(name,facts)
 results.append(dict(test=name,passed=True,**facts));print('PASS',name,facts or '',flush=True)
HOOK=next(ast.literal_eval(n.value)for n in ast.parse((ROOT/'tests/desktop_session.py').read_text()).body if isinstance(n,ast.Assign)and any(getattr(t,'id','')=='HOOK'for t in n.targets))
U=C.WinDLL('user32',use_last_error=True)
def bind(name,ret,args):
 f=getattr(U,name);f.restype=ret;f.argtypes=args;return f
get_parent=bind('GetParent',W.HWND,[W.HWND]);enabled=bind('IsWindowEnabled',W.BOOL,[W.HWND]);get_class=bind('GetClassNameW',C.c_int,[W.HWND,W.LPWSTR,C.c_int]);get_ex=bind('GetWindowLongPtrW',C.c_ssize_t,[W.HWND,C.c_int]);find=bind('FindWindowW',W.HWND,[W.LPCWSTR,W.LPCWSTR]);pid_of=bind('GetWindowThreadProcessId',W.DWORD,[W.HWND,C.POINTER(W.DWORD)])
class POINT(C.Structure):_fields_=[('x',W.LONG),('y',W.LONG)]
from_point=bind('WindowFromPoint',W.HWND,[POINT])
screen_dc=bind('GetDC',W.HDC,[W.HWND]);release_dc=bind('ReleaseDC',C.c_int,[W.HWND,W.HDC])
gdi=C.WinDLL('gdi32',use_last_error=True);pixel=gdi.GetPixel;pixel.restype=W.DWORD;pixel.argtypes=[W.HDC,C.c_int,C.c_int]
def screen_pixel(x,y):
 # Capture the composed desktop (including layered/DirectComposition windows),
 # rather than sampling the GDI desktop DC, which can omit WebView2 content.
 metric=bind('GetSystemMetrics',C.c_int,[C.c_int])
 frame=ImageGrab.grab(all_screens=True)
 return list(frame.getpixel((x-metric(76),y-metric(77)))[:3])
def classname(h):
 b=C.create_unicode_buffer(256);get_class(h,b,256);return b.value
with sync_playwright()as p,tempfile.TemporaryDirectory()as td:
 browser=p.chromium.connect_over_cdp(os.environ['DEKA_CDP']);context=browser.contexts[0];context.route('https://**',lambda q:q.abort());page=next(q for q in context.pages if 'tauri.localhost'in q.url);
 # Exercise the shipped toolbar on a fresh profile, before the suite reloads the page or installs hooks.
 # The native API is used only for observation and to bring back the hidden window.
 page.wait_for_selector('#wallBackground', state='visible', timeout=20000)
 for entry_mode in ('normal', 'active'):
  if entry_mode == 'active':
   page.locator('#wallActive').click()
   page.wait_for_function("window.DekaWallpaper?.mode === 'active'")
  page.locator('#wallBackground').click(timeout=10000)
  deadline = time.monotonic() + 15
  while True:
   state = page.evaluate("window.__TAURI__.core.invoke('wallpaper_state')")
   if state['mode'] == 'background' or state['error'] or time.monotonic() >= deadline:
    break
   time.sleep(.25)
  facts = {'mode': state['mode'], 'error': state['error'], 'attachment': state['attachment'],
           'label': page.locator('#wallState').text_content(), 'engine_visible': state['engine_visible']}
  check('Toolbar click enters background from '+entry_mode,
        state['mode']=='background' and state['placement_verified'] and not state['engine_visible'], **facts)
  page.evaluate("window.__TAURI__.core.invoke('wallpaper_set', {mode:'normal',monitor:null})")
  page.wait_for_selector('#wallBackground', state='visible')
 page.add_init_script(HOOK);page.reload();errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.wait_for_function('()=>!!window.DekaWallpaper?.state')
 def native(mode=None,monitor=None):
  if mode is None:return page.evaluate("__TAURI__.core.invoke('wallpaper_state')")
  return page.evaluate("([mode,monitor])=>__TAURI__.core.invoke('wallpaper_set',{mode,monitor})",[mode,monitor])
 # Record the real Explorer layout; do not fabricate a WorkerW window.
 shell_pid=W.DWORD();pid_of(find('Progman',None),C.byref(shell_pid))
 print('Explorer desktop owner',psutil.Process(shell_pid.value).username(),flush=True)
 enum_windows=bind('EnumWindows',W.BOOL,[C.WINFUNCTYPE(W.BOOL,W.HWND,W.LPARAM),W.LPARAM])
 enum_children=bind('EnumChildWindows',W.BOOL,[W.HWND,C.WINFUNCTYPE(W.BOOL,W.HWND,W.LPARAM),W.LPARAM])
 callback_type=C.WINFUNCTYPE(W.BOOL,W.HWND,W.LPARAM)
 def describe(top,_):
  if classname(top) in ['Progman','WorkerW']:
   children=[]
   @callback_type
   def each(h,_):children.append({'class':classname(h),'hwnd':h,'parent':get_parent(h)});return True
   enum_children(top,each,0);print('REAL SHELL TREE',classname(top),top,children,flush=True)
  return True
 enumerate_callback=callback_type(describe);enum_windows(enumerate_callback,0)
 # The hosted runner's terminal is a normal foreground application. It must
 # be minimized before checking desktop pixels; Wallpaper must stay below it.
 minimize=bind('ShowWindowAsync',W.BOOL,[W.HWND,C.c_int]);is_visible=bind('IsWindowVisible',W.BOOL,[W.HWND])
 @callback_type
 def minimize_runner_terminal(h,_):
  if classname(h) in ['CASCADIA_HOSTING_WINDOW_CLASS','ConsoleWindowClass'] and is_visible(h):minimize(h,6)
  return True
 enum_windows(minimize_runner_terminal,0);page.wait_for_timeout(300)
 state=native();initial_settings=state['settings_file'];h=state['hwnd'];identity=json.loads((OUT/'native-integrity.json').read_text());process=psutil.Process(identity['pid']);environment=identity.get('environment',{})
 check('Separate Wallpaper identity, ordinary window, tray, no autostart',state['mode']=='normal'and state['tray']and 'ru.volna.deka.wallpaper'in initial_settings and not state['autostart'],settings=initial_settings,monitors=state['monitors'],tray_rect=state['tray_rect'])
 for i,hz in enumerate([440,660,440,660]):
  path=Path(td)/f'Wallpaper-{i}.mp3';path.write_bytes((ROOT/'tests/fixtures'/f'dj-{hz}.mp3').read_bytes())
 page.click('#djToggle');page.set_input_files('#file',list(map(str,Path(td).glob('*.mp3'))))
 page.get_by_role('button',name='В A: Wallpaper-0',exact=True).click();page.get_by_role('button',name='В B: Wallpaper-1',exact=True).click();page.wait_for_function("()=>['A','B'].every(s=>__dj.state[s].duration>40&&__dj.state[s].analysisStatus==='ready')")
 page.evaluate("__dj.setAutoMix(false);__dj.setRepeat(true);__dj.setBPM('A',120);__dj.setBPM('B',125);__dj.setRate('A',1.04);__dj.setGain('A',.72);__dj.setGain('B',.85);__dj.setEQ('A',0,-3);__dj.setEQ('B',2,2);__dj.setCross(.15);__dj.play('A');__dj.play('B');window.__sameEngine=__dj;window.__sameContext=__measure.context;window.__sourceRefs=[currentAudio('A'),currentAudio('B')];window.__shellSamples=[];window.__shellTimer=setInterval(()=>__shellSamples.push(outputStats().rms),60);window.__saved=JSON.stringify(['A','B'].map(s=>{const x=__dj.state[s];return {key:x.track.key,rate:x.rate,eq:x.eq,gain:x.gain,cue:x.cue,keyLock:x.keyLock};}));")
 # A playing event and the first nonzero PCM block precede the full FFT
 # window. Wait for both tones, rather than testing the second decoder
 # immediately after the first decoder becomes audible.
 page.wait_for_function("()=>!__dj.state.A.paused&&!__dj.state.B.paused&&amp(440)>.02&&amp(660)>.02",timeout=10000)
 check('Two actual MP3 sources are audible; scratching is disabled',page.evaluate("amp(440)>.02&&amp(660)>.02&&!__djopts.vinyl&&document.getElementById('djDiscA').disabled"),signal=page.evaluate('({a:amp(440),b:amp(660),rms:outputStats().rms})'))
 # A temporary render canary proves that the actual desktop displays our
 # WebView below the real icons, not just that its HWND has a shell parent.
 page.evaluate("""()=>{const p=document.createElement('div');p.id='shellRenderProbe';p.style.cssText='position:fixed;left:85%;top:80%;width:32px;height:32px;z-index:2147483647;background:rgb(217,31,193);pointer-events:none';document.body.append(p);}""")
 resources=[];desktop_shown=False
 def sample_resource(mode):
  before={q.pid:sum(q.cpu_times()[:2])for q in[process]+process.children(recursive=True)if q.is_running()};start=time.monotonic();rss=[]
  for _ in range(15):
   page.wait_for_timeout(200);rss.append(sum(q.memory_info().rss for q in[process]+process.children(recursive=True)if q.is_running()))
  duration=time.monotonic()-start;after={q.pid:sum(q.cpu_times()[:2])for q in[process]+process.children(recursive=True)if q.is_running()};cpu=sum(after[k]-before.get(k,after[k])for k in after)/duration*100
  resources.append(dict(mode=mode,seconds=duration,cpu_one_core_percent=cpu,aggregate_rss_bytes=sum(rss)/len(rss),processes=len(after),gpu=None))
 for mode in ['active','background','normal','background','active','normal']:
  before=page.evaluate("[currentAudio('A').currentTime,currentAudio('B').currentTime]");state=native(mode);page.wait_for_timeout(250);print('MODE STATE',json.dumps(state,ensure_ascii=False),flush=True)
  check(mode+' preserves one engine, both tracks and all manual audio settings',state['mode']==mode and page.evaluate("__dj===__sameEngine&&__measure.context===__sameContext&&['A','B'].every((s,i)=>currentAudio(s)===__sourceRefs[i]&&!__dj.state[s].paused)&&__saved===JSON.stringify(['A','B'].map(s=>{const x=__dj.state[s];return {key:x.track.key,rate:x.rate,eq:x.eq,gain:x.gain,cue:x.cue,keyLock:x.keyLock};}))"))
  if mode=='background' and not desktop_shown:
   key=bind('keybd_event',None,[W.BYTE,W.BYTE,W.DWORD,C.c_size_t])
   key(0x5B,0,0,0);key(0x44,0,0,0);key(0x44,0,2,0);key(0x5B,0,2,0);page.wait_for_timeout(500);desktop_shown=True
   check('Win+D keeps the background display attached and the audio player hidden',native()['mode']=='background' and not native()['engine_visible'])
  if mode in ['active','background']:
   probe=page.locator('#shellRenderProbe').bounding_box();viewport=page.evaluate('({w:innerWidth,h:innerHeight})')
   sx=state['rect']['x']+round((probe['x']+16)*state['rect']['width']/viewport['w']);sy=state['rect']['y']+round((probe['y']+16)*state['rect']['height']/viewport['h'])
   actual=[]
   for attempt in range(20):
    actual=screen_pixel(sx,sy)
    if all(abs(a-b)<=8 for a,b in zip(actual,[217,31,193])):break
    page.wait_for_timeout(100)
   ImageGrab.grab(all_screens=True).save(OUT/('wallpaper-screen-'+mode+'.png'))
   page.screenshot(path=str(OUT/('wallpaper-webview-'+mode+'.png')))
   check('Actual composed desktop shows Wallpaper in '+mode,all(abs(a-b)<=8 for a,b in zip(actual,[217,31,193])),screen_pixel=actual,position=[sx,sy])
  if mode=='background':
   background_h=state['hwnd'];parent=get_parent(background_h)
   surface=state['host'] or background_h
   actual_parent=bind('GetAncestor',W.HWND,[W.HWND,W.UINT])(surface,1)
   check('Real background parent is a child layer of WorkerW or Progman, with native input disabled',actual_parent==state['shell'] and classname(actual_parent)in['WorkerW','Progman'] and not enabled(background_h)and get_ex(background_h,-20)&0x08000020==0x08000020,parent_class=classname(actual_parent))
   if not state['raised']:
    steps = {entry['step']: entry for entry in state['attachment']}
    created = steps.get('create-in-worker', {})
    local = steps.get('display-to-local-host', {})
    check('Classic WorkerW owns a host created in place and the display uses a local parent',
          bool(state['host']) and created.get('host') == state['host']
          and created.get('actual_parent') == state['shell']
          and local.get('actual_parent') == state['host']
          and local['before']['pid'] == local['target']['pid']
          and get_parent(background_h) == state['host'], steps=list(steps))
   check('Native placement remains below the visible icon layer',state.get('placement_verified') is True)
   check('Audio player stays outside Explorer; wallpaper surface contains no audio engine',state['engine_hwnd']==h and state['engine_parent']==0 and not state['engine_visible'] and state['hwnd']!=h)
   passive=next(q for q in context.pages if 'wallpaper-display.html' in q.url)
   check('Passive display has no audio elements or DJ engine',passive.evaluate('typeof __dj===\"undefined\"&&!document.querySelector(\"audio,video\")'))
   if os.environ.get('DEKA_EXISTING_SHELL'):
    frame=ImageGrab.grab(all_screens=True).convert('RGB');pixels=frame.load();points=[]
    for y in range(0,frame.height,2):
     for x in range(0,frame.width,2):
      color=pixels[x,y]
      if color[0]<55 and color[1]>240 and 65<color[2]<100:points.append((x,y))
    check('Real desktop shortcut icon remains visible over Wallpaper',len(points)>=40,green_pixels=len(points))
    if not (OUT/'desktop-shortcut-opened.txt').exists():
     x,y=points[len(points)//2];cursor=bind('SetCursorPos',W.BOOL,[C.c_int,C.c_int]);cursor(x,y)
     click=bind('mouse_event',None,[W.DWORD,W.DWORD,W.DWORD,W.DWORD,C.c_size_t])
     for _ in range(2):click(2,0,0,0,0);click(4,0,0,0,0);page.wait_for_timeout(90)
     for _ in range(30):
      if (OUT/'desktop-shortcut-opened.txt').exists():break
      page.wait_for_timeout(100)
     check('Real desktop shortcut opens through background Wallpaper', (OUT/'desktop-shortcut-opened.txt').exists())
   before_cross=page.evaluate('__dj.diagnostics().cross');page.evaluate("document.getElementById('djPauseAll').click();document.getElementById('djCross').value=-100;document.getElementById('djCross').dispatchEvent(new Event('input',{bubbles:true}));window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));")
   check('Background blocks click, slider and keyboard transport input',page.evaluate(f'!__dj.state.A.paused&&!__dj.state.B.paused&&__dj.diagnostics().cross==={before_cross}&&DekaWallpaper.mode==="background"'))
   hit=from_point(POINT(state['rect']['x']+100,state['rect']['y']+100));check('Native desktop hit testing reaches outside the wallpaper WebView',classname(hit) in ['SysListView32','SHELLDLL_DefView'],hit_class=classname(hit))
  elif mode=='active':
   monitor=next((m for m in state['monitors']if m['name']==state['selected']),state['monitors'][0]);check('Active fills selected monitor in physical pixels without topmost',all(abs(state['rect'][k]-monitor[k])<=2 for k in ['x','y','width','height'])and not(get_ex(h,-20)&8),rect=state['rect'],monitor=monitor)
  else:check('Normal restores a top-level enabled window and original desktop',not get_parent(h)and enabled(h))
  if not any(x['mode']==mode for x in resources):sample_resource(mode)
  else:page.wait_for_timeout(200)
  after=page.evaluate("[currentAudio('A').currentTime,currentAudio('B').currentTime]");check(mode+' clocks advance through mode changes',all(a>b+.1 for a,b in zip(after,before)))
 state=native('active');page.keyboard.press('Escape');page.wait_for_function('()=>DekaWallpaper.mode==="normal"');check('Escape returns to an ordinary window without stopping music',page.evaluate('!__dj.state.A.paused&&!__dj.state.B.paused'))
 # Verify an actual automatically timed fade and the next queue preparation under icons.
 page.evaluate("__dj.pause('A');__dj.pause('B');__dj.setRepeat(false);__dj.setRate('A',1);__dj.setRate('B',1);__dj.setCross(-1);__dj.setEQ('A',0,0);__dj.setEQ('B',2,0);__dj.setAutoMix(true);__dj.seek('A',__dj.state.A.duration-19);__dj.play('A')")
 state=native('background');page.wait_for_function('()=>__dj.diagnostics().mixing',timeout=6000);page.wait_for_timeout(600);check('Background Auto Mix performs real BPM synchronization',page.evaluate('Math.abs(currentAudio("B").playbackRate-.96)<.002&&__dj.diagnostics().transition.matched'))
 page.wait_for_function('()=>__dj.state.A.lastTransition?.completed&&!__dj.diagnostics().mixing',timeout=20000);transition=page.evaluate('__dj.state.A.lastTransition');check('A-to-B Auto Mix completes a measured 17s transition under desktop icons',17<=transition['elapsed']<17.3 and page.evaluate('!__dj.state.B.paused&&outputStats().rms>.01'),transition=transition)
 page.wait_for_function('()=>__dj.state.A.track?.title==="Wallpaper-2"');check('Queue prepares its next file in background mode',page.evaluate('__dj.state.A.paused&&__dj.state.A.track.title==="Wallpaper-2"'))
 native('normal');page.screenshot(path=str(OUT/'wallpaper-native.png'));state=native('background');shell=find('Shell_TrayWnd',None);shell_pid=W.DWORD();pid_of(shell,C.byref(shell_pid));assert shell_pid.value
 # Restart only Explorer in this disposable GitHub Actions desktop, never a user workstation.
 before_engine=page.evaluate('currentAudio("B").currentTime');subprocess.run(['taskkill.exe','/PID',str(shell_pid.value),'/F'],check=True,capture_output=True);page.wait_for_timeout(1300);subprocess.Popen(['explorer.exe']) if os.environ.get('DEKA_EXISTING_SHELL') else Path(os.environ['DEKA_CI_SHELL_REQUEST']).write_text('restart',encoding='utf-8')
 page.wait_for_function('()=>DekaWallpaper.mode==="normal"',timeout=15000);page.wait_for_timeout(1800);state=native()
 print('POST-RESTART SHELL',find('Progman',None),find('Shell_TrayWnd',None),flush=True)
 enum_windows(enumerate_callback,0)
 print('POST-RESTART EXPLORER',[(q.pid,q.username(),q.cmdline())for q in psutil.process_iter()if q.name().lower()=='explorer.exe'],flush=True)
 ImageGrab.grab(all_screens=True).save(OUT/'wallpaper-after-explorer.png')
 check('Explorer restart fixture provides a real desktop and taskbar',bool(find('Progman',None)) and bool(find('Shell_TrayWnd',None)))
 for _ in range(40):
  state=native()
  if state.get('tray_registered'):break
  page.wait_for_timeout(250)
 print('TRAY REGISTRATION',state.get('tray_registered'),state.get('tray_attempts'),state['tray_rect'],flush=True)
 if not state['tray_rect']:
  # Explorer may move a successfully restored icon into the hidden-icons popup.
  # Open the real chevron with a mouse click before requiring its coordinates.
  candidates=[]
  @callback_type
  def tray_child(q,_):
   title=C.create_unicode_buffer(256);U.GetWindowTextW(q,title,256)
   if classname(q)=='Button' and is_visible(q):candidates.append(q)
   print('TRAY CHILD',q,classname(q),title.value,flush=True);return True
  enum_children(find('Shell_TrayWnd',None),tray_child,0)
  for q in candidates:
   r=W.RECT();get_rect=bind('GetWindowRect',W.BOOL,[W.HWND,C.POINTER(W.RECT)]);get_rect(q,C.byref(r))
   cursor=bind('SetCursorPos',W.BOOL,[C.c_int,C.c_int]);cursor((r.left+r.right)//2,(r.top+r.bottom)//2)
   click=bind('mouse_event',None,[W.DWORD,W.DWORD,W.DWORD,W.DWORD,C.c_size_t]);click(2,0,0,0,0);click(4,0,0,0,0)
   page.wait_for_timeout(500);state=native()
   if state['tray_rect']:break
 ImageGrab.grab(all_screens=True).save(OUT/'wallpaper-restored-tray.png')
 check('Actual Explorer restart restores an accessible window, tray and the same running audio engine',state['recoveries']>=1 and state['tray'] and state['tray_rect'] is not None and enabled(h)and not get_parent(h)and page.evaluate(f'__dj===__sameEngine&&!__dj.state.B.paused&&currentAudio("B").currentTime>{before_engine}'),recoveries=state['recoveries'],tray_rect=state['tray_rect'],registered=state.get('tray_registered'))
 state=native('background');page.wait_for_timeout(1200)
 check('Background display can be recreated after Explorer restart without replacing audio',state['mode']=='background' and state['engine_hwnd']==h and state['engine_parent']==0 and page.evaluate('__dj===__sameEngine&&!__dj.state.B.paused'))
 actual=[]
 for _ in range(20):
  actual=screen_pixel(sx,sy)
  if all(abs(a-b)<=8 for a,b in zip(actual,[217,31,193])):break
  page.wait_for_timeout(100)
 ImageGrab.grab(all_screens=True).save(OUT/'wallpaper-screen-recovered.png')
 check('Recreated background surface is visible on the actual desktop',all(abs(a-b)<=8 for a,b in zip(actual,[217,31,193])),screen_pixel=actual)
 native('normal')
 saved=page.evaluate("__TAURI__.core.invoke('wallpaper_report')")
 report_lines = Path(saved).read_text(encoding='utf-8').splitlines()
 rows = [json.loads(line) for line in report_lines[1:] if line.strip()]
 background_rows = [row for row in rows if row['event'] == 'background' and
                    row['state'].get('version') == '0.1.2-rc.3' and row['state']['placement_verified']]
 recorded = background_rows[-1]['state'] if background_rows else {}
 expected_step = 'host-to-desktop' if state['raised'] else 'create-in-worker'
 check('Save report writes native placement diagnostics',
       recorded.get('host') == state['host'] and recorded.get('shell') == state['shell']
       and any(a['step'] == expected_step and a['actual_parent'] == state['shell'] and 'last_error' in a
               for a in recorded.get('attachment', []))
       and any(row['event'] == 'watchdog-recovery' for row in rows))
 check('Windows provides monitor selection; mixed-DPI/unplug geometry is also unit-tested',len(state['monitors'])>=1,physical_monitor_count=len(state['monitors']),physical_two_monitors_tested=False,physical_dpi_change_tested=False)
 # A second launch must hand back to the existing instance, never make another player.
 copied=Path(os.environ['DEKA_EXE']) if os.environ.get('DEKA_EXE') else next(Path(os.environ['PUBLIC']).glob('DekaCI*/Deka.exe'));second=subprocess.Popen([str(copied)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);second.wait(timeout=12);page.wait_for_timeout(300)
 check('A second EXE exits and focuses the existing experiment',second.returncode==0 and page.evaluate('__dj===__sameEngine&&!__dj.state.B.paused'))
 from wallpaper_controls import verify_controls
 verify_controls(page,context,native,check,ROOT)
 page.evaluate("__dj.pause('A');__dj.pause('B');clearInterval(__shellTimer)");samples=page.evaluate('__shellSamples');check('Mode-switching and Explorer test produced no runtime exceptions',not errors,errors=errors)
 (OUT/'wallpaper-resource-report.json').write_text(json.dumps({'conditions':'Same two local MP3s, key lock on, A +4%, fixed independent EQ/gain/cross; 3 seconds per mode, process tree sum, CPU 100%=one core, aggregate RSS may include shared pages. GPU counters unavailable. Short CI comparison is not a desktop-PC performance guarantee.','samples':resources},indent=2))
 (OUT/'wallpaper-native-report.json').write_text(json.dumps({'tests':results,'resources':resources,'environment':environment,'source':'Actual built Windows EXE in the recorded CI shell. Physical Windows 10, multi-monitor, DPI/hotplug and tray mouse clicks require manual validation.'},ensure_ascii=False,indent=2))
 # Exit is a native command; background host is detached before process termination.
 try:page.evaluate("__TAURI__.core.invoke('wallpaper_exit')")
 except Exception:pass
 for _ in range(30):
  if not process.is_running():break
  time.sleep(.1)
 check('Exit stops the process and restores the desktop',not process.is_running())
 (OUT/'wallpaper-native-report.json').write_text(json.dumps({'tests':results,'resources':resources,'environment':environment,'method':'Actual EXE in the recorded CI shell, real shell placement/input blocking, Explorer restart and process exit. Physical Windows 10, two-monitor/DPI/hotplug and tray clicks remain manual.'},ensure_ascii=False,indent=2))
