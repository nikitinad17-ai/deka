"""Actual Android WebView bounds against real three-button navigation, both rotations.

The x86_64 debug APK uses the same source/generator as the arm64 release APK.
VK is an explicit local fixture; this does not test an account or a physical phone.
"""
import json, re, subprocess, sys, time, urllib.request, xml.etree.ElementTree as ET
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'test-output'; OUT.mkdir(exist_ok=True)
PACKAGE='ru.volna.player.consolepreview0211'
checks=[]
def adb(*args):
    return subprocess.check_output(['adb',*args],text=True).strip()
def check(name,ok,**facts):
    checks.append(dict(test=name,passed=bool(ok),**facts))
    (OUT/'android-native-insets-report.json').write_text(json.dumps(checks,indent=2))
    print(('PASS ' if ok else 'FAIL ')+name,facts,flush=True)
    assert ok,(name,facts)
def rect(node):
    return tuple(map(int,re.findall(r'\d+',node.attrib['bounds'])))
def intersects(a,b):
    return min(a[2],b[2])>max(a[0],b[0]) and min(a[3],b[3])>max(a[1],b[1])

adb('install','-r',str(Path(sys.argv[1]).resolve()))
adb('shell','cmd','overlay','enable-exclusive','--category','com.android.internal.systemui.navbar.threebutton')
adb('shell','settings','put','system','accelerometer_rotation','0')
adb('shell','settings','put','system','user_rotation','0')
adb('shell','am','start','-n',PACKAGE+'/.MainActivity')
pid=''; endpoint=None
for _ in range(90):
    try:
        pid=adb('shell','pidof',PACKAGE).split()[0]
        if 'webview_devtools_remote_'+pid in adb('shell','cat','/proc/net/unix'):
            adb('forward','tcp:9222','localabstract:webview_devtools_remote_'+pid)
            with urllib.request.urlopen('http://127.0.0.1:9222/json/version') as r: endpoint=json.load(r)['webSocketDebuggerUrl']
            break
    except Exception: pass
    time.sleep(1)
assert endpoint,'Debug WebView did not expose DevTools'
with sync_playwright() as p:
    browser=p.chromium.connect_over_cdp(endpoint)
    context=browser.contexts[0]
    page=context.pages[0]
    fixture=(ROOT/'tests/fixtures/vk-music.html').read_text()
    context.route('https://vk.ru/**',lambda route:route.fulfill(content_type='text/html; charset=utf-8',body=fixture))
    context.add_cookies([dict(name='remixsid',value='ci-fixture',domain='.vk.ru',path='/',secure=True)])
    page.goto('https://vk.ru/audios42',wait_until='domcontentloaded')
    page.locator('#deka-overlay').wait_for(timeout=30000)
    q=lambda s:page.locator('#deka-overlay '+s)
    # Use the modules actually embedded in the APK, not an injected source bundle.
    check('APK contains the mounted control surfaces',page.evaluate('!!window.DekaConsoleDesigns&&!!window.DekaConsoleControls'))
    q('#djBtn').click()
    for rotation,name in [(0,'portrait'),(1,'landscape-right'),(3,'landscape-left'),(0,'portrait-return')]:
        adb('shell','settings','put','system','user_rotation',str(rotation))
        time.sleep(2)
        q('#djBtn').click()
        adb('shell','uiautomator','dump','/sdcard/deka-insets.xml')
        xml=adb('shell','cat','/sdcard/deka-insets.xml');(OUT/(name+'.xml')).write_text(xml)
        nodes=list(ET.fromstring(xml).iter('node'))
        webviews=[n for n in nodes if n.get('class')=='android.webkit.WebView']
        nav=[n for n in nodes if n.get('package')=='com.android.systemui' and n.get('resource-id','').split('/')[-1] in ['back','home','recent_apps']]
        check(name+' exposes WebView and three native navigation buttons',bool(webviews) and len(nav)>=3)
        web=max((rect(n) for n in webviews),key=lambda r:(r[2]-r[0])*(r[3]-r[1]))
        check(name+' native navigation never overlaps the WebView',all(not intersects(web,rect(n)) for n in nav),webview=web,navigation=[rect(n) for n in nav])
        for theme in ['aurora','acid','editorial']:
            q('#djStyle').click();q('[data-theme='+theme+']').click();q('#djThemeSave').click()
            for side in ['A','B']:
                control=q(f'[data-eq={side}][data-band="2"]').locator('..').locator('.dc-surface')
                control.scroll_into_view_if_needed(); box=control.bounding_box()
                check(name+' '+theme+' '+side+' high EQ stays inside the usable viewport',box['x']>=0 and box['x']+box['width']<=page.evaluate('innerWidth')+1)
            q('.console').evaluate('e=>e.scrollTop=0')
            page.screenshot(path=str(OUT/(name+'-'+theme+'-webview.png')))
        with (OUT/(name+'-screen.png')).open('wb') as f:
            subprocess.run(['adb','exec-out','screencap','-p'],stdout=f,check=True)
    check('Rotation retains the same Activity process',adb('shell','pidof',PACKAGE).split()[0]==pid)
    browser.close()
