"""Exact Wallpaper EXE in the existing interactive Explorer session, without elevation.
GitHub Actions disposable VM only. Reuse Explorer's genuine medium token; never
fabricate a restricted token or change UAC, desktop ACLs, accounts or OS policy.
"""
import ctypes as C
from ctypes import wintypes as W
import hashlib,json,os,shutil,subprocess,sys,time,urllib.request,uuid
from pathlib import Path

def main():
 if os.name!='nt' or os.environ.get('GITHUB_ACTIONS')!='true':raise RuntimeError('Disposable Windows CI only')
 exe=Path(sys.argv[1]).resolve(strict=True)
 if exe.name.lower()!='deka-wallpaper.exe':raise RuntimeError('Only the exact Wallpaper EXE is accepted')
 out=Path('test-output');out.mkdir(exist_ok=True)
 folder=Path(os.environ['PUBLIC'])/('DekaCI'+uuid.uuid4().hex[:10]);folder.mkdir()
 kernel=C.WinDLL('kernel32',use_last_error=True);adv=C.WinDLL('advapi32',use_last_error=True);user=C.WinDLL('user32',use_last_error=True);PTR=C.c_void_p
 def bind(dll,name,ret,args):
  f=getattr(dll,name);f.restype=ret;f.argtypes=args;return f
 def check(ok,label):
  if not ok:raise OSError(C.get_last_error(),label+': '+C.FormatError(C.get_last_error()))
 class SID_ATTRIBUTES(C.Structure):_fields_=[('Sid',PTR),('Attributes',W.DWORD)]
 class STARTUPINFO(C.Structure):
  _fields_=[('cb',W.DWORD),('lpReserved',W.LPWSTR),('lpDesktop',W.LPWSTR),('lpTitle',W.LPWSTR),('dwX',W.DWORD),('dwY',W.DWORD),('dwXSize',W.DWORD),('dwYSize',W.DWORD),('dwXCountChars',W.DWORD),('dwYCountChars',W.DWORD),('dwFillAttribute',W.DWORD),('dwFlags',W.DWORD),('wShowWindow',W.WORD),('cbReserved2',W.WORD),('lpReserved2',PTR),('hStdInput',W.HANDLE),('hStdOutput',W.HANDLE),('hStdError',W.HANDLE)]
 class PROCESS_INFORMATION(C.Structure):_fields_=[('hProcess',W.HANDLE),('hThread',W.HANDLE),('dwProcessId',W.DWORD),('dwThreadId',W.DWORD)]
 close=bind(kernel,'CloseHandle',W.BOOL,[W.HANDLE]);free=bind(kernel,'LocalFree',PTR,[PTR])
 open_process=bind(kernel,'OpenProcess',W.HANDLE,[W.DWORD,W.BOOL,W.DWORD]);exit_code=bind(kernel,'GetExitCodeProcess',W.BOOL,[W.HANDLE,C.POINTER(W.DWORD)])
 open_token=bind(adv,'OpenProcessToken',W.BOOL,[W.HANDLE,W.DWORD,C.POINTER(W.HANDLE)])
 info=bind(adv,'GetTokenInformation',W.BOOL,[W.HANDLE,C.c_int,PTR,W.DWORD,C.POINTER(W.DWORD)])
 sid_string=bind(adv,'ConvertSidToStringSidW',W.BOOL,[PTR,C.POINTER(W.LPWSTR)])
 restricted=bind(adv,'IsTokenRestricted',W.BOOL,[W.HANDLE])
 find=bind(user,'FindWindowW',W.HWND,[W.LPCWSTR,W.LPCWSTR]);pid_of=bind(user,'GetWindowThreadProcessId',W.DWORD,[W.HWND,C.POINTER(W.DWORD)])
 create=bind(adv,'CreateProcessWithTokenW',W.BOOL,[W.HANDLE,W.DWORD,W.LPCWSTR,W.LPWSTR,W.DWORD,PTR,W.LPCWSTR,C.POINTER(STARTUPINFO),C.POINTER(PROCESS_INFORMATION)])
 def token_info(handle):
  token=W.HANDLE();check(open_token(handle,8,C.byref(token)),'Query process token')
  try:
   needed=W.DWORD()
   def sid(kind):
    info(token,kind,None,0,C.byref(needed));buffer=C.create_string_buffer(needed.value)
    check(info(token,kind,buffer,needed,C.byref(needed)),'Read token SID')
    value=C.cast(buffer,C.POINTER(SID_ATTRIBUTES)).contents;txt=W.LPWSTR()
    check(sid_string(value.Sid,C.byref(txt)),'Format token SID')
    try:return txt.value
    finally:free(C.cast(txt,PTR))
   integrity=int(sid(25).rsplit('-',1)[1]);owner=sid(1);elevated=W.DWORD()
   check(info(token,20,C.byref(elevated),C.sizeof(elevated),C.byref(needed)),'Read elevation')
   return dict(integrity=integrity,elevated=bool(elevated.value),restricted=bool(restricted(token)),sid=owner)
  finally:close(token)
 shell=find('Shell_TrayWnd',None) or find('Progman',None);shell_pid=W.DWORD();pid_of(shell,C.byref(shell_pid));check(shell_pid.value,'Locate the actual interactive Explorer')
 shell_process=open_process(0x1000,False,shell_pid.value);check(shell_process,'Read interactive Explorer process')
 shell_info=token_info(shell_process)
 if shell_info['integrity']!=8192 or shell_info['elevated'] or shell_info['restricted']:raise RuntimeError('Existing Explorer must supply an ordinary medium-integrity token: '+str(shell_info))
 source_token=W.HANDLE();check(open_token(shell_process,0xB,C.byref(source_token)),'Open genuine Explorer primary token')
 target=folder/'Deka.exe';shutil.copy2(exe,target);assert hashlib.sha256(target.read_bytes()).digest()==hashlib.sha256(exe.read_bytes()).digest()
 bootstrap=folder/'launch.py'
 bootstrap.write_text("""import ctypes,json,os,subprocess,sys,time,traceback
from pathlib import Path
folder=Path(__file__).resolve().parent
def failure(t,v,tb):(folder/'bootstrap-error.txt').write_text(''.join(traceback.format_exception(t,v,tb)),encoding='utf-8')
sys.excepthook=failure
u=ctypes.WinDLL('user32');u.FindWindowW.restype=ctypes.c_void_p;u.FindWindowW.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p]
def shell():
 if not u.FindWindowW('Progman',None):subprocess.Popen([str(Path(os.environ['WINDIR'])/'explorer.exe')])
 for _ in range(100):
  if u.FindWindowW('Progman',None) and u.FindWindowW('Shell_TrayWnd',None):return
  time.sleep(.2)
 raise RuntimeError('Interactive Explorer restart timed out')
env=dict(os.environ)
env['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS']='--remote-debugging-address=127.0.0.1 --remote-debugging-port=9225'
env['WEBVIEW2_USER_DATA_FOLDER']=str(folder/'WebView2')
env['RUST_BACKTRACE']='1'
with open(folder/'native-stdout.txt','wb') as stdout,open(folder/'native-stderr.txt','wb') as stderr:
 app=subprocess.Popen([str(folder/'Deka.exe')],cwd=folder,env=env,stdout=stdout,stderr=stderr)
 (folder/'app-pid.json').write_text(json.dumps({'pid':app.pid}))
 while app.poll() is None:
  request=folder/'restart-explorer'
  if request.exists():request.unlink();shell()
  time.sleep(.1)
 (folder/'app-exit.json').write_text(json.dumps({'code':app.returncode}))
""",encoding='utf-8')
 process=PROCESS_INFORMATION();app_handle=None;launched=False
 try:
  command=C.create_unicode_buffer(subprocess.list2cmdline([sys.executable,str(bootstrap)]));startup=STARTUPINFO();startup.cb=C.sizeof(startup)
  check(create(source_token,1,sys.executable,command,0x08000000,None,str(folder),C.byref(startup),C.byref(process)),'Launch using Explorer medium token')
  launched=True;bootstrap_info=token_info(process.hProcess)
  if bootstrap_info!=shell_info:raise RuntimeError('Bootstrap must match the existing ordinary Explorer token')
  print('Existing interactive Explorer and bootstrap:',shell_info,flush=True)
  opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));ready=False
  for _ in range(180):
   code=W.DWORD();check(exit_code(process.hProcess,C.byref(code)),'Read bootstrap status')
   if code.value!=259:raise RuntimeError('GUI bootstrap exited: '+str(code.value))
   if (folder/'app-exit.json').exists():raise RuntimeError('GUI exited: '+(folder/'app-exit.json').read_text())
   if app_handle is None and (folder/'app-pid.json').exists():
    pid=json.loads((folder/'app-pid.json').read_text())['pid'];app_handle=open_process(0x1000,False,pid);check(app_handle,'Read exact GUI')
    app_info=token_info(app_handle);assert app_info==shell_info
    (out/'native-integrity.json').write_text(json.dumps(dict(bootstrap=bootstrap_info,child=app_info,shell=shell_info,pid=pid,method='Genuine existing interactive Explorer primary token, no elevation or restricted-token simulation'),indent=2))
    print('Exact EXE PID',pid,'ordinary token:',app_info,flush=True)
   try:
    with opener.open('http://127.0.0.1:9225/json/list',timeout=.5)as response:targets=json.load(response)
    if not any('tauri.localhost'in t.get('url','')for t in targets):raise ValueError('Main page not ready')
    with opener.open('http://127.0.0.1:9225/json/version',timeout=.5)as response:version=json.load(response)
    if version.get('webSocketDebuggerUrl'):(out/'webview-version.json').write_text(json.dumps(version,indent=2));ready=True;break
   except (OSError,ValueError):time.sleep(.3)
  if not ready:raise RuntimeError('Interactive ordinary-user WebView2 did not initialize')
  test_env=dict(os.environ,DEKA_CDP=version['webSocketDebuggerUrl'],DEKA_CI_SHELL_REQUEST=str(folder/'restart-explorer'))
  subprocess.run([sys.executable,'tests/wallpaper_native.py'],check=True,timeout=360,env=test_env)
 finally:
  if launched:subprocess.run(['taskkill.exe','/PID',str(process.dwProcessId),'/T','/F'],check=False)
  for name in ['native-stdout.txt','native-stderr.txt','bootstrap-error.txt','app-exit.json']:
   p=folder/name
   if p.exists():
    shutil.copy2(p,out/name)
    if name in ['native-stderr.txt','bootstrap-error.txt']:print(p.read_text(errors='replace'),flush=True)
  for handle in [app_handle,process.hThread,process.hProcess,source_token,shell_process]:
   if handle:close(handle)
  shutil.rmtree(folder,ignore_errors=True)
if __name__=='__main__':main()
