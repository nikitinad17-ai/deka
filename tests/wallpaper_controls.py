"""User-facing return paths and the shared DJ Sets panel in the real Windows EXE."""
import base64
import ctypes as C
from ctypes import wintypes as W
from pathlib import Path
import re
import time


def verify_controls(page, context, native, check, root):
    user = C.WinDLL("user32", use_last_error=True)

    def bind(name, result, *args):
        func = getattr(user, name)
        func.argtypes, func.restype = args, result
        return func

    key = bind("keybd_event", None, W.BYTE, W.BYTE, W.DWORD, C.c_size_t)
    cursor = bind("SetCursorPos", W.BOOL, C.c_int, C.c_int)
    mouse = bind("mouse_event", None, W.DWORD, W.DWORD, W.DWORD, W.DWORD, C.c_size_t)
    foreground = bind("GetForegroundWindow", W.HWND)
    ancestor = bind("GetAncestor", W.HWND, W.HWND, W.UINT)
    hit = bind("WindowFromPoint", W.HWND, W.POINT)
    wnd = bind("FindWindowW", W.HWND, W.LPCWSTR, W.LPCWSTR)
    child = bind("FindWindowExW", W.HWND, W.HWND, W.HWND, W.LPCWSTR, W.LPCWSTR)
    bounds = bind("GetWindowRect", W.BOOL, W.HWND, C.POINTER(W.RECT))
    menu_handle = bind("SendMessageW", C.c_ssize_t, W.HWND, W.UINT, W.WPARAM, W.LPARAM)
    menu_count = bind("GetMenuItemCount", C.c_int, W.HMENU)
    menu_text = bind("GetMenuStringW", C.c_int, W.HMENU, W.UINT, W.LPWSTR, C.c_int, W.UINT)
    menu_rect = bind("GetMenuItemRect", W.BOOL, W.HWND, W.HMENU, W.UINT, C.POINTER(W.RECT))

    def click(x, y):
        assert cursor(round(x), round(y))
        mouse(2, 0, 0, 0, 0)
        mouse(4, 0, 0, 0, 0)

    def chord(expected):
        for code in (0x11, 0x12, 0x78):
            key(code, 0, 0, 0)
        try:
            # Holding the shortcut must not immediately toggle back.
            for _ in range(4):
                key(0x78, 0, 0, 0)
                page.wait_for_timeout(90)
        finally:
            for code in (0x78, 0x12, 0x11):
                key(code, 0, 2, 0)
        page.wait_for_function("m=>DekaWallpaper.mode===m", arg=expected, timeout=8000)
        assert native()['mode'] == expected

    def tray_activate():
        rect = native()['tray_rect']
        if not rect:
            notify = child(wnd('Shell_TrayWnd', None), None, 'TrayNotifyWnd', None)
            chevron = child(notify, None, 'Button', None)
            r = W.RECT()
            assert chevron and bounds(chevron, C.byref(r)), 'Hidden-icons arrow missing'
            click((r.left+r.right)//2, (r.top+r.bottom)//2)
            page.wait_for_timeout(400)
            rect = native()['tray_rect']
        assert rect, 'Tray icon has no visible screen rectangle'
        x, y, w, h = map(int, re.findall(r'(?:x|y|width|height): (-?\d+)', rect))
        click(x+w//2, y+h//2)
        deadline = time.monotonic()+5
        while time.monotonic() < deadline:
            popup = wnd('#32768', None)
            menu = menu_handle(popup, 0x1e1, 0, 0) if popup else 0
            if menu:
                for index in range(menu_count(menu)):
                    label, r = C.create_unicode_buffer(128), W.RECT()
                    menu_text(menu, index, label, len(label), 0x400)
                    if label.value.replace('&','') == 'Активно' and menu_rect(None,menu,index,C.byref(r)):
                        click((r.left+r.right)//2, (r.top+r.bottom)//2)
                        page.wait_for_function("DekaWallpaper.mode==='active'",timeout=8000)
                        return
            page.wait_for_timeout(80)
        raise AssertionError('The native Active menu item did not appear')

    def click_tab(id):
        page.locator('#'+id).scroll_into_view_if_needed()
        state = native()
        rect = page.locator('#'+id).bounding_box()
        scale = page.evaluate('devicePixelRatio')
        x = round(state['rect']['x']+(rect['x']+rect['width']/2)*scale)
        y = round(state['rect']['y']+(rect['y']+rect['height']/2)*scale)
        assert ancestor(hit(W.POINT(x,y)), 2) == state['engine_hwnd'], 'A different native window receives the click'
        click(x, y)

    state = native()
    # The preceding shell suite ran Auto Mix for over a minute. Establish the
    # manual two-source session before testing a silent load into the idle A;
    # otherwise a legitimate automatic handoff can occupy A and show Replace.
    page.evaluate("__dj.setAutoMix(false);__dj.pause('A');__dj.setRepeat(true);__dj.seek('B',5);__dj.play('B')")
    page.wait_for_function("__dj.state.A.paused&&!__dj.state.B.paused")
    check('System-wide mode shortcut registered',state['hotkey_registered'])
    page.locator('#wallActive').click()
    page.wait_for_function("DekaWallpaper.mode==='active'")
    chord('background')
    passive = next(p for p in context.pages if 'wallpaper-display.html' in p.url)
    passive.wait_for_function("document.querySelector('.wallpaper-toolbar')?.textContent.includes('F9') && !document.querySelector('#wallActive')")
    tray_activate()
    click_tab('djAddSet') if page.locator('#djAddSet').is_visible() else click_tab('djShuffle')
    check('Actual tray Active item restores a physically clickable player', foreground()==state['engine_hwnd'])
    page.select_option('#djSource','sets')
    chord('background')
    assert foreground() != state['engine_hwnd']
    chord('active')
    click_tab('djAddSet')
    page.wait_for_selector('#djSetForm',state='visible')
    check('Global shortcut restores mouse input; browsing Sets keeps deck B playing',
          foreground()==state['engine_hwnd'] and page.evaluate('!__dj.state.B.paused'))

    # The actual secondary WebView runs the shipped VK bridge against local media.
    url='https://vkvideo.ru/video-123_456'
    mp3=base64.b64encode((root/'tests/fixtures/dj-440.mp3').read_bytes()).decode()
    markup='<h1>CI DJ Set</h1><video src="data:audio/mpeg;base64,'+mp3+'"></video>'
    context.route(url,lambda r:r.fulfill(content_type='text/html',body=markup))
    context.route('https://vk.ru/audio',lambda r:r.fulfill(content_type='text/html',body='<title>VK fixture</title>'))
    vk=next(p for p in context.pages if p!=page and 'wallpaper-display' not in p.url)
    vk.goto('https://vk.ru/audio')
    vk.wait_for_function("typeof window.__deka?.cmd==='function'")
    page.locator('#djSetLink').fill(url)
    page.locator('#djSetForm button[type=submit]').click()
    check('Adding a set in the DJ source list does not navigate or stop the local deck',
          vk.url=='https://vk.ru/audio' and page.evaluate('!__dj.state.B.paused'))
    page.locator('#djList .dj-row button').first.click()
    loaded=page.evaluate("({kind:__dj.state.A.track?.kind,aPaused:__dj.state.A.paused,bPaused:__dj.state.B.paused,message:document.querySelector('#djMessage').textContent})")
    check('Loading a saved set into A is silent and leaves B running',
          loaded['kind']=='set' and loaded['aPaused'] and not loaded['bPaused'],**loaded)
    page.locator('#djPlayA').click()
    vk.wait_for_url(url)
    vk.wait_for_function("document.querySelector('video')?.currentTime > .4")
    page.wait_for_function("!__dj.state.A.paused && !__dj.state.A.pending && __dj.state.A.track.title==='CI DJ Set'")
    check('The set plays on deck A while the local track on B continues',page.evaluate('!__dj.state.B.paused'))
    page.locator('#djPlayA').click()
    vk.wait_for_function("document.querySelector('video').paused")
    page.wait_for_function('__dj.state.A.paused')
    page.locator('#djSeekA').fill('300')
    vk.wait_for_function("document.querySelector('video').currentTime > 10")
    position=vk.evaluate("document.querySelector('video').currentTime")
    page.locator('#djPlayA').click()
    vk.wait_for_function("!document.querySelector('video').paused")
    page.wait_for_function('!__dj.state.A.pending')
    check('Deck pause, seek and resume preserve the video position',vk.evaluate("document.querySelector('video').currentTime")>=position-.5)
    page.locator('#djCross').fill('100')
    vk.wait_for_function("document.querySelector('video').volume < .01")
    page.locator('#djCross').fill('-100')
    vk.wait_for_function("document.querySelector('video').volume > .5")
    check('The physical set stream follows the deck crossfader')
    chord('background')
    passive.wait_for_function("document.querySelector('#djTitleA')?.textContent==='CI DJ Set'")
    before=vk.evaluate("document.querySelector('video').currentTime")
    page.wait_for_timeout(1200)
    chord('active')
    check('A set on deck A advances under icons and survives hotkey return',vk.evaluate("document.querySelector('video').currentTime")>before+.5)
    before=vk.evaluate("document.querySelector('video').currentTime")
    page.locator('#djCompact').click()
    page.locator('#djStyle').click();page.locator('[data-theme=acid]').click();page.locator('#djThemeSave').click()
    page.wait_for_timeout(700)
    check('Native compact/theme switch preserves set playback and the local deck',vk.evaluate("document.querySelector('video').currentTime")>before+.3 and page.evaluate('!__dj.state.A.paused&&!__dj.state.B.paused') and page.locator('#djDiscA').is_hidden())
    chord('background')
    passive.wait_for_function("document.documentElement.classList.contains('deka-theme-acid')&&document.querySelector('#desktopDJ').classList.contains('dj-compact')")
    chord('active')
    page.locator('#djCompact').click()
    page.locator('#djPauseAll').click()
    vk.wait_for_function("document.querySelector('video').paused")
    check('Pause both stops the set and the local deck',page.evaluate('__dj.state.A.paused && __dj.state.B.paused'))
    page.locator('#djCompact').click()
    check('Compact DJ retains the saved set list and controls',page.locator('#djList .dj-row').count()==1 and page.locator('#djPlayA').is_visible())
    page.locator('#djPlayA').click()
    vk.wait_for_function("!document.querySelector('video').paused")
    native('normal')
