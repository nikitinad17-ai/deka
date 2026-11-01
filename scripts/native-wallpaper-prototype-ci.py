"""Run the exact release GUI under a disposable standard Windows CI account.

CreateRestrictedToken is unsupported by WebView2 (WebView2Feedback #4850).
No UAC, sandbox or OS policies are changed; no app is elevated.
"""
from __future__ import annotations
import ctypes as C
from ctypes import wintypes as W
import hashlib,json,os,secrets,shutil,subprocess,sys,time,urllib.request,uuid
from pathlib import Path


def main():
    if os.name!='nt' or os.environ.get('GITHUB_ACTIONS')!='true':
        raise RuntimeError('Disposable Windows CI only')
    exe=Path(sys.argv[1]).resolve(strict=True)
    if exe.name.lower()!='deka-wallpaper.exe':raise RuntimeError('Only the built Deka executable is accepted')
    out=Path('test-output');out.mkdir(exist_ok=True)
    account='DekaCI'+uuid.uuid4().hex[:10];password=secrets.token_urlsafe(24)+'aA1!'
    print('::add-mask::'+password,flush=True)
    folder=Path(os.environ['PUBLIC'])/account
    kernel=C.WinDLL('kernel32',use_last_error=True);adv=C.WinDLL('advapi32',use_last_error=True)
    net=C.WinDLL('netapi32',use_last_error=True);userenv=C.WinDLL('userenv',use_last_error=True);PTR=C.c_void_p
    class SID_AND_ATTRIBUTES(C.Structure):
        _fields_=[('Sid',PTR),('Attributes',W.DWORD)]
    class USER_INFO_1(C.Structure):
        _fields_=[('name',W.LPWSTR),('password',W.LPWSTR),('password_age',W.DWORD),('priv',W.DWORD),
                  ('home_dir',W.LPWSTR),('comment',W.LPWSTR),('flags',W.DWORD),('script_path',W.LPWSTR)]
    class MEMBER(C.Structure):
        _fields_=[('name',W.LPWSTR)]
    class STARTUPINFO(C.Structure):
        _fields_=[('cb',W.DWORD),('lpReserved',W.LPWSTR),('lpDesktop',W.LPWSTR),('lpTitle',W.LPWSTR),
                  ('dwX',W.DWORD),('dwY',W.DWORD),('dwXSize',W.DWORD),('dwYSize',W.DWORD),
                  ('dwXCountChars',W.DWORD),('dwYCountChars',W.DWORD),('dwFillAttribute',W.DWORD),
                  ('dwFlags',W.DWORD),('wShowWindow',W.WORD),('cbReserved2',W.WORD),('lpReserved2',PTR),
                  ('hStdInput',W.HANDLE),('hStdOutput',W.HANDLE),('hStdError',W.HANDLE)]
    class PROCESS_INFORMATION(C.Structure):
        _fields_=[('hProcess',W.HANDLE),('hThread',W.HANDLE),('dwProcessId',W.DWORD),('dwThreadId',W.DWORD)]
    def bind(dll,name,result,args):
        fn=getattr(dll,name);fn.restype=result;fn.argtypes=args;return fn
    close=bind(kernel,'CloseHandle',W.BOOL,[W.HANDLE]);local_free=bind(kernel,'LocalFree',PTR,[PTR])
    open_process=bind(kernel,'OpenProcess',W.HANDLE,[W.DWORD,W.BOOL,W.DWORD])
    exit_code=bind(kernel,'GetExitCodeProcess',W.BOOL,[W.HANDLE,C.POINTER(W.DWORD)])
    open_token=bind(adv,'OpenProcessToken',W.BOOL,[W.HANDLE,W.DWORD,C.POINTER(W.HANDLE)])
    get_token=bind(adv,'GetTokenInformation',W.BOOL,[W.HANDLE,C.c_int,PTR,W.DWORD,C.POINTER(W.DWORD)])
    sid_to_string=bind(adv,'ConvertSidToStringSidW',W.BOOL,[PTR,C.POINTER(W.LPWSTR)])
    restricted=bind(adv,'IsTokenRestricted',W.BOOL,[W.HANDLE])
    create_process=bind(adv,'CreateProcessWithLogonW',W.BOOL,
        [W.LPCWSTR,W.LPCWSTR,W.LPCWSTR,W.DWORD,W.LPCWSTR,W.LPWSTR,W.DWORD,PTR,W.LPCWSTR,
         C.POINTER(STARTUPINFO),C.POINTER(PROCESS_INFORMATION)])
    add_user=bind(net,'NetUserAdd',W.DWORD,[W.LPCWSTR,W.DWORD,PTR,C.POINTER(W.DWORD)])
    delete_user=bind(net,'NetUserDel',W.DWORD,[W.LPCWSTR,W.LPCWSTR])
    add_group=bind(net,'NetLocalGroupAddMembers',W.DWORD,[W.LPCWSTR,W.LPCWSTR,W.DWORD,PTR,W.DWORD])
    delete_profile=bind(userenv,'DeleteProfileW',W.BOOL,[W.LPCWSTR,W.LPCWSTR,W.LPCWSTR])
    def check(ok,operation):
        if not ok:raise OSError(C.get_last_error(),operation+': '+C.FormatError(C.get_last_error()))
    def token_info(handle):
        token=W.HANDLE();check(open_token(handle,0x8,C.byref(token)),'Read child token')
        try:
            size=W.DWORD()
            def token_sid(kind):
                get_token(token,kind,None,0,C.byref(size));buffer=C.create_string_buffer(size.value)
                check(get_token(token,kind,buffer,size,C.byref(size)),'Read token SID')
                label=C.cast(buffer,C.POINTER(SID_AND_ATTRIBUTES)).contents;sid=W.LPWSTR()
                check(sid_to_string(label.Sid,C.byref(sid)),'Convert token SID')
                try:return sid.value
                finally:local_free(C.cast(sid,PTR))
            integrity=int(token_sid(25).rsplit('-',1)[1]);sid=token_sid(1);elevated=W.DWORD()
            check(get_token(token,20,C.byref(elevated),C.sizeof(elevated),C.byref(size)),'Read elevation')
            return dict(integrity=integrity,elevated=bool(elevated.value),restricted=bool(restricted(token)),sid=sid)
        finally:close(token)
    process=PROCESS_INFORMATION();app_handle=None;created=False;launched=False;sid=None
    try:
        # Unique account, in Users only. Never add administrator rights.
        info=USER_INFO_1(account,password,0,1,None,'Disposable Deka audio verification',0x1|0x200|0x10000,None)
        parameter=W.DWORD();status=add_user(None,1,C.byref(info),C.byref(parameter))
        if status:raise OSError(status,'Create disposable standard user')
        created=True;member=MEMBER(os.environ['COMPUTERNAME']+'\\'+account)
        status=add_group(None,'Users',3,C.byref(member),1)
        if status not in (0,1378):raise OSError(status,'Add disposable user to Users')
        folder.mkdir();target=folder/'Deka.exe';shutil.copy2(exe,target)
        assert hashlib.sha256(target.read_bytes()).digest()==hashlib.sha256(exe.read_bytes()).digest()
        # This new task directory is the only ACL changed.
        subprocess.run(['icacls.exe',str(folder),'/grant:r',account+':(OI)(CI)M'],check=True)

        # The disposable CI desktop may already have an administrator-owned
        # Explorer. A real standard-user shell must own the desktop used by
        # this test, just as on a user's workstation. Never run this harness
        # outside GitHub Actions.
        u=C.WinDLL('user32',use_last_error=True)
        fw=bind(u,'FindWindowW',W.HWND,[W.LPCWSTR,W.LPCWSTR])
        window_pid=bind(u,'GetWindowThreadProcessId',W.DWORD,[W.HWND,C.POINTER(W.DWORD)])

        get_station=bind(u,'GetProcessWindowStation',W.HANDLE,[])
        get_desktop=bind(u,'GetThreadDesktop',W.HANDLE,[W.DWORD])
        thread_id=bind(kernel,'GetCurrentThreadId',W.DWORD,[])
        object_info=bind(u,'GetUserObjectInformationW',W.BOOL,[W.HANDLE,C.c_int,PTR,W.DWORD,C.POINTER(W.DWORD)])
        def object_name(obj):
            name=C.create_unicode_buffer(256);size=W.DWORD()
            check(object_info(obj,2,name,C.sizeof(name),C.byref(size)),'Read desktop context')
            return name.value
        station=get_station();flags=(W.DWORD*3)();size=W.DWORD()
        check(object_info(station,1,flags,C.sizeof(flags),C.byref(size)),'Read window station visibility')
        print('CAPTURE DESKTOP CONTEXT',dict(station=object_name(station),desktop=object_name(get_desktop(thread_id())),visible=bool(flags[2]&1)),flush=True)

        shell=fw('Progman',None)
        if shell:
            shell_id=W.DWORD();window_pid(shell,C.byref(shell_id))
            if shell_id.value:
                print('Replacing CI-owned Explorer with the disposable standard-user desktop',shell_id.value,flush=True)
                subprocess.run(['taskkill.exe','/PID',str(shell_id.value),'/F'],check=True)
                for _ in range(50):
                    if not fw('Progman',None):break
                    time.sleep(.1)

        bootstrap=folder/'launch.py'
        bootstrap.write_text("""import ctypes,json,os,subprocess,time,sys,traceback
from pathlib import Path
folder=Path(__file__).resolve().parent
def log_error(t,v,tb):
 (folder/'bootstrap-error.txt').write_text(''.join(traceback.format_exception(t,v,tb)),encoding='utf-8')
sys.excepthook=log_error
env=dict(os.environ)
env['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS']='--remote-debugging-address=127.0.0.1 --remote-debugging-port=9225'
env['WEBVIEW2_USER_DATA_FOLDER']=str(Path(os.environ['LOCALAPPDATA'])/'Deka-AutoMix-CI')
env['RUST_BACKTRACE']='1'
u=ctypes.WinDLL('user32')
u.FindWindowW.restype=ctypes.c_void_p
u.FindWindowW.argtypes=[ctypes.c_wchar_p,ctypes.c_wchar_p]
def shell():
 if not u.FindWindowW('Progman',None):
  subprocess.Popen([str(Path(os.environ['WINDIR'])/'explorer.exe')],env=dict(os.environ))
 for _ in range(150):
  if u.FindWindowW('Progman',None) and u.FindWindowW('Shell_TrayWnd',None):return
  time.sleep(.2)
 raise RuntimeError('Real Explorer desktop did not initialize in the disposable CI account')
shell()
with open(folder/'native-stdout.txt','wb') as stdout,open(folder/'native-stderr.txt','wb') as stderr:
 app=subprocess.Popen([str(folder/'Deka.exe')],cwd=folder,env=env,stdout=stdout,stderr=stderr)
 (folder/'app-pid.json').write_text(json.dumps({'pid':app.pid}))
 while app.poll() is None:
  request=folder/'restart-explorer'
  if request.exists():
   request.unlink()
   shell()
  time.sleep(.1)
 code=app.returncode
 (folder/'app-exit.json').write_text(json.dumps({'code':code}))
""")
        # NULL environment and LOGON_WITH_PROFILE load the real user's profile.
        # The bootstrap passes the diagnostic flags only to its Deka child.
        command=C.create_unicode_buffer(subprocess.list2cmdline([sys.executable,str(bootstrap)]))
        startup=STARTUPINFO();startup.cb=C.sizeof(startup)
        check(create_process(account,'.',password,1,sys.executable,command,0x08000000,
                             None,str(folder),C.byref(startup),C.byref(process)),'Launch standard-user bootstrap')
        launched=True;bootstrap_info=token_info(process.hProcess);sid=bootstrap_info['sid']
        if bootstrap_info['elevated'] or bootstrap_info['restricted'] or bootstrap_info['integrity']!=8192:
            raise RuntimeError('Bootstrap must be an ordinary, unrestricted standard user')
        opener=urllib.request.build_opener(urllib.request.ProxyHandler({}));ready=False
        for _ in range(160):
            code=W.DWORD();check(exit_code(process.hProcess,C.byref(code)),'Read bootstrap exit')
            if code.value!=259:raise RuntimeError('GUI bootstrap exited: '+str(code.value))
            if (folder/'app-exit.json').exists():raise RuntimeError('GUI exited: '+(folder/'app-exit.json').read_text())
            if app_handle is None and (folder/'app-pid.json').exists():
                pid=json.loads((folder/'app-pid.json').read_text())['pid']
                app_handle=open_process(0x1000,False,pid);check(app_handle,'Read actual app process')
                app_info=token_info(app_handle)
                shell_id=W.DWORD();window_pid(fw('Progman',None),C.byref(shell_id))
                shell_handle=open_process(0x1000,False,shell_id.value);check(shell_handle,'Read shell process')
                try:shell_info=token_info(shell_handle)
                finally:close(shell_handle)
                print('Real Explorer shell token',shell_info,flush=True)
                if shell_info['sid']!=app_info['sid'] or shell_info['integrity']!=8192:raise RuntimeError('Explorer must belong to the same ordinary test account as Wallpaper')
                (out/'native-integrity.json').write_text(json.dumps(dict(bootstrap=bootstrap_info,child=app_info,pid=pid),indent=2))
                if app_info!=bootstrap_info:raise RuntimeError('Actual GUI identity differs from ordinary-user bootstrap')
                print('Built GUI PID',pid,'under ordinary Windows user',app_info,flush=True)
            try:
                with opener.open('http://127.0.0.1:9225/json/list',timeout=.5) as response:targets=json.load(response)
                if not any('tauri.localhost' in t.get('url','') for t in targets):raise ValueError('Main controller not ready')
                with opener.open('http://127.0.0.1:9225/json/version',timeout=.5) as response:version=json.load(response)
                if version.get('webSocketDebuggerUrl'):
                    (out/'webview-version.json').write_text(json.dumps(version,indent=2));ready=True;break
            except (OSError,ValueError):time.sleep(.3)
        if not ready:raise RuntimeError('Ordinary-user WebView2 main page did not initialize')
        test_env=dict(os.environ,DEKA_CDP=version['webSocketDebuggerUrl'],DEKA_CI_SHELL_REQUEST=str(folder/'restart-explorer'))
        subprocess.run([sys.executable,'tests/wallpaper_prototype.py'],check=True,timeout=360,env=test_env)
    finally:
        if launched:subprocess.run(['taskkill.exe','/PID',str(process.dwProcessId),'/T','/F'],check=False)
        for name in ['native-stdout.txt','native-stderr.txt','bootstrap-error.txt','app-exit.json']:
            p=folder/name
            if p.exists():
                shutil.copy2(p,out/name)
                if name in ['native-stderr.txt','bootstrap-error.txt']:print(p.read_text(errors='replace'),flush=True)
        for handle in [app_handle,process.hThread,process.hProcess]:
            if handle:close(handle)
        if sid:print('Disposable profile cleanup:',bool(delete_profile(sid,None,None)),flush=True)
        if created:print('Disposable account cleanup status:',delete_user(None,account),flush=True)
        shutil.rmtree(folder,ignore_errors=True)


if __name__=='__main__':main()
