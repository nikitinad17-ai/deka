"""Test the real interactive CI shell, without replacing Explorer's identity.

This is a shell/compositor test, not a claim of a physical Windows 10 machine
or a standard user. The runner token is recorded explicitly. No UAC settings,
desktop ACLs, or user accounts are changed.
"""
import ctypes as C,json,os,platform,subprocess,sys,time,urllib.request
from ctypes import wintypes as W
from pathlib import Path
import psutil

assert os.name=='nt' and os.environ.get('GITHUB_ACTIONS')=='true'
root=Path(__file__).resolve().parents[1];out=root/'test-output';out.mkdir(exist_ok=True)
exe=Path(sys.argv[1]).resolve(strict=True)
u=C.WinDLL('user32',use_last_error=True);u.FindWindowW.restype=W.HWND;u.FindWindowW.argtypes=[W.LPCWSTR,W.LPCWSTR]
u.GetWindowThreadProcessId.argtypes=[W.HWND,C.POINTER(W.DWORD)]
pid=W.DWORD();u.GetWindowThreadProcessId(u.FindWindowW('Progman',None),C.byref(pid))
assert pid.value,'A real existing Explorer desktop is required'
owner=psutil.Process(pid.value).username();assert owner==psutil.Process().username(),(owner,psutil.Process().username())
environment={'os':platform.platform(),'version':sys.getwindowsversion().build,'shell_pid':pid.value,'same_user':True,'admin_token':bool(C.windll.shell32.IsUserAnAdmin()),'physical_windows10_tested':False}
print('Actual shell environment',environment,flush=True)
(out/'shell-environment.json').write_text(json.dumps(environment,indent=2))
# A real desktop shortcut with an unmistakable icon must remain visible and clickable.
from PIL import Image
ico=out/'desktop-probe.ico';im=Image.new('RGBA',(64,64),(38,255,82,255));im.save(ico,sizes=[(16,16),(32,32),(48,48),(64,64)])
marker=out/'desktop-shortcut-opened.txt'
script=out/'create-shortcut.ps1'
def ps(s):return "'"+str(s).replace("'","''")+"'"
script.write_text("$desktop=[Environment]::GetFolderPath('Desktop')\n$s=(New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $desktop 'Deka Shell Probe.lnk'))\n$s.TargetPath="+ps(sys.executable)+"\n$s.Arguments="+ps('-c "from pathlib import Path;Path(\''+str(marker).replace('\\','/')+'\').write_text(\'opened\')"')+"\n$s.IconLocation="+ps(str(ico)+',0')+"\n$s.Save()\n",encoding='utf-8')
subprocess.run(['powershell','-NoProfile','-File',str(script)],check=True)
env=dict(os.environ,WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-address=127.0.0.1 --remote-debugging-port=9225',WEBVIEW2_USER_DATA_FOLDER=str(out/'webview-profile'))
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
with (out/'native-stdout.txt').open('wb') as stdout,(out/'native-stderr.txt').open('wb') as stderr:
 app=subprocess.Popen([str(exe)],env=env,stdout=stdout,stderr=stderr)
 try:
  (out/'native-integrity.json').write_text(json.dumps({'pid':app.pid,'environment':environment},indent=2))
  version=None
  for _ in range(150):
   assert app.poll() is None,'App exited before WebView2 initialized'
   try:
    with opener.open('http://127.0.0.1:9225/json/list',timeout=.5) as r:targets=json.load(r)
    if any('tauri.localhost'in t.get('url','') for t in targets):
     with opener.open('http://127.0.0.1:9225/json/version',timeout=.5) as r:version=json.load(r)
     break
   except (OSError,ValueError):pass
   time.sleep(.3)
  assert version,'WebView2 did not initialize in the real CI shell'
  (out/'webview-version.json').write_text(json.dumps(version,indent=2))
  test_env=dict(os.environ,DEKA_CDP=version['webSocketDebuggerUrl'],DEKA_EXE=str(exe),DEKA_EXISTING_SHELL='1')
  subprocess.run([sys.executable,'tests/wallpaper_native.py'],env=test_env,check=True,timeout=330)
 finally:
  if app.poll() is None:subprocess.run(['taskkill.exe','/PID',str(app.pid),'/T','/F'],check=False,capture_output=True)
  print((out/'native-stderr.txt').read_text(errors='replace'),flush=True)
