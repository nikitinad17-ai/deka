"""Launch the exact installed GUI at standard-user integrity on a disposable CI runner.

WebView2 ignores user-scoped diagnostic environment flags in elevated hosts.
This harness reduces the CI token; it never changes policies, elevates the
application, or embeds debug settings into the shipped executable.
"""
from __future__ import annotations
import ctypes as C
from ctypes import wintypes as W
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
import urllib.request
import uuid


def main() -> None:
    if os.name != 'nt' or os.environ.get('GITHUB_ACTIONS') != 'true':
        raise RuntimeError('Disposable Windows CI only')
    exe = Path(sys.argv[1]).resolve(strict=True)
    if exe.name.lower() != 'deka2.exe':
        raise RuntimeError('Only the installed Deka 2 executable is accepted')
    out = Path('test-output'); out.mkdir(exist_ok=True)
    profile = Path(os.environ['RUNNER_TEMP']) / ('deka2-standard-' + str(uuid.uuid4()))
    profile.mkdir()
    kernel = C.WinDLL('kernel32', use_last_error=True)
    adv = C.WinDLL('advapi32', use_last_error=True)
    PTR = C.c_void_p

    class SID_AND_ATTRIBUTES(C.Structure):
        _fields_ = [('Sid', PTR), ('Attributes', W.DWORD)]

    class STARTUPINFO(C.Structure):
        _fields_ = [('cb', W.DWORD), ('lpReserved', W.LPWSTR), ('lpDesktop', W.LPWSTR),
                    ('lpTitle', W.LPWSTR), ('dwX', W.DWORD), ('dwY', W.DWORD),
                    ('dwXSize', W.DWORD), ('dwYSize', W.DWORD), ('dwXCountChars', W.DWORD),
                    ('dwYCountChars', W.DWORD), ('dwFillAttribute', W.DWORD),
                    ('dwFlags', W.DWORD), ('wShowWindow', W.WORD), ('cbReserved2', W.WORD),
                    ('lpReserved2', PTR), ('hStdInput', W.HANDLE), ('hStdOutput', W.HANDLE),
                    ('hStdError', W.HANDLE)]

    class PROCESS_INFORMATION(C.Structure):
        _fields_ = [('hProcess', W.HANDLE), ('hThread', W.HANDLE),
                    ('dwProcessId', W.DWORD), ('dwThreadId', W.DWORD)]

    def bind(dll, name, restype, argtypes):
        fn = getattr(dll, name); fn.restype = restype; fn.argtypes = argtypes
        return fn

    current = bind(kernel, 'GetCurrentProcess', W.HANDLE, [])
    close = bind(kernel, 'CloseHandle', W.BOOL, [W.HANDLE])
    local_free = bind(kernel, 'LocalFree', PTR, [PTR])
    open_token = bind(adv, 'OpenProcessToken', W.BOOL, [W.HANDLE, W.DWORD, C.POINTER(W.HANDLE)])
    get_token = bind(adv, 'GetTokenInformation', W.BOOL, [W.HANDLE, C.c_int, PTR, W.DWORD, C.POINTER(W.DWORD)])
    restrict = bind(adv, 'CreateRestrictedToken', W.BOOL,
                    [W.HANDLE, W.DWORD, W.DWORD, PTR, W.DWORD, PTR, W.DWORD, PTR, C.POINTER(W.HANDLE)])
    sid_from_string = bind(adv, 'ConvertStringSidToSidW', W.BOOL, [W.LPCWSTR, C.POINTER(PTR)])
    sid_to_string = bind(adv, 'ConvertSidToStringSidW', W.BOOL, [PTR, C.POINTER(W.LPWSTR)])
    sid_length = bind(adv, 'GetLengthSid', W.DWORD, [PTR])
    set_token = bind(adv, 'SetTokenInformation', W.BOOL, [W.HANDLE, C.c_int, PTR, W.DWORD])
    create_process = bind(adv, 'CreateProcessAsUserW', W.BOOL,
                          [W.HANDLE, W.LPCWSTR, W.LPWSTR, PTR, PTR, W.BOOL, W.DWORD, PTR,
                           W.LPCWSTR, C.POINTER(STARTUPINFO), C.POINTER(PROCESS_INFORMATION)])
    exit_code = bind(kernel, 'GetExitCodeProcess', W.BOOL, [W.HANDLE, C.POINTER(W.DWORD)])

    def check(ok, operation):
        if not ok:
            raise OSError(C.get_last_error(), operation + ': ' + C.FormatError(C.get_last_error()))

    def token_info(token):
        size = W.DWORD()
        get_token(token, 25, None, 0, C.byref(size))  # TokenIntegrityLevel
        buffer = C.create_string_buffer(size.value)
        check(get_token(token, 25, buffer, size, C.byref(size)), 'Read integrity level')
        label = C.cast(buffer, C.POINTER(SID_AND_ATTRIBUTES)).contents
        sid_text = W.LPWSTR()
        check(sid_to_string(label.Sid, C.byref(sid_text)), 'Convert integrity SID')
        try:
            integrity = int(sid_text.value.rsplit('-', 1)[1])
        finally:
            local_free(C.cast(sid_text, PTR))
        elevated = W.DWORD()
        check(get_token(token, 20, C.byref(elevated), C.sizeof(elevated), C.byref(size)), 'Read elevation')
        return {'integrity': integrity, 'elevated': bool(elevated.value)}

    original = W.HANDLE(); reduced = W.HANDLE(); medium_sid = PTR()
    process = PROCESS_INFORMATION(); launched = False
    try:
        # Rights to query, duplicate, assign the reduced token and lower its integrity.
        check(open_token(current(), 0x0001 | 0x0002 | 0x0008 | 0x0080, C.byref(original)), 'Open own token')
        parent_info = token_info(original)
        # DISABLE_MAX_PRIVILEGE | LUA_TOKEN; never SANDBOX_INERT.
        check(restrict(original, 0x1 | 0x4, 0, None, 0, None, 0, None, C.byref(reduced)), 'Reduce own token')
        check(sid_from_string('S-1-16-8192', C.byref(medium_sid)), 'Create medium integrity label')
        label = SID_AND_ATTRIBUTES(medium_sid, 0x20)  # SE_GROUP_INTEGRITY
        check(set_token(reduced, 25, C.byref(label), C.sizeof(label) + sid_length(medium_sid)), 'Lower integrity')
        child_info = token_info(reduced)
        if child_info['elevated'] or child_info['integrity'] > 8192:
            raise RuntimeError('Refusing to run the browser host elevated')
        env = dict(os.environ)
        env['WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS'] = '--remote-debugging-address=127.0.0.1 --remote-debugging-port=9225'
        env['WEBVIEW2_USER_DATA_FOLDER'] = str(profile)
        env_block = C.create_unicode_buffer('\0'.join(k + '=' + v for k, v in sorted(env.items(), key=lambda p: p[0].upper())) + '\0\0')
        command = C.create_unicode_buffer('"' + str(exe) + '"')
        startup = STARTUPINFO(); startup.cb = C.sizeof(startup)
        check(create_process(reduced, str(exe), command, None, None, False, 0x400,
                             env_block, str(exe.parent), C.byref(startup), C.byref(process)), 'Launch standard-user app')
        launched = True
        # Verify the real child's primary token, not just the prepared one.
        actual_token = W.HANDLE()
        check(open_token(process.hProcess, 0x8, C.byref(actual_token)), 'Read child token')
        try:
            actual_info = token_info(actual_token)
        finally:
            close(actual_token)
        (out / 'native-integrity.json').write_text(json.dumps({'parent': parent_info, 'child': actual_info,
                                                              'pid': process.dwProcessId}, indent=2))
        if actual_info['elevated'] or actual_info['integrity'] > 8192:
            raise RuntimeError('Actual browser host is elevated')
        print('Installed GUI PID', process.dwProcessId, 'at standard-user integrity', actual_info, flush=True)
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
        ready = False
        for _ in range(100):
            code = W.DWORD(); check(exit_code(process.hProcess, C.byref(code)), 'Read app exit code')
            if code.value != 259:
                raise RuntimeError('Installed GUI exited: ' + str(code.value))
            try:
                with opener.open('http://127.0.0.1:9225/json/version', timeout=0.5) as response:
                    version = json.load(response)
                if version.get('webSocketDebuggerUrl'):
                    (out / 'webview-version.json').write_text(json.dumps(version, indent=2)); ready = True; break
            except (OSError, ValueError):
                time.sleep(0.3)
        if not ready:
            raise RuntimeError('Standard-user WebView2 did not expose the per-process test endpoint')
        subprocess.run([sys.executable, 'tests/desktop-flow.py', '--native'], check=True)
    finally:
        if launched:
            # Only the process tree created by this CI harness, never another app.
            subprocess.run(['taskkill.exe', '/PID', str(process.dwProcessId), '/T', '/F'], check=False)
        for handle in [process.hThread, process.hProcess, reduced, original]:
            if handle: close(handle)
        if medium_sid: local_free(medium_sid)
        shutil.rmtree(profile, ignore_errors=True)


if __name__ == '__main__':
    main()
