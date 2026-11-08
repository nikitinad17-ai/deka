"""Three actual control surfaces: mouse/keyboard or CDP touch, measured live PCM."""
import functools,http.server,json,math,os,struct,sys,tempfile,threading,wave
from pathlib import Path
from playwright.sync_api import sync_playwright
from mobile_test_support import ROOT,bundle,fixture,INIT
MOBILE='--mobile' in sys.argv
OUT=ROOT/'test-output';OUT.mkdir(exist_ok=True);checks=[]
def check(name,ok=True,**facts):
    checks.append(dict(test=name,passed=bool(ok),**facts));print(('PASS ' if ok else 'FAIL ')+name,facts,flush=True);assert ok,(name,facts)
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'src')))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with tempfile.TemporaryDirectory() as tmp,sync_playwright() as p:
    paths=[]
    for hz in [440,660]:
        f=Path(tmp)/f'Studio-{hz}.wav';paths.append(str(f))
        with wave.open(str(f),'wb') as w:
            w.setnchannels(1);w.setsampwidth(2);w.setframerate(24000)
            cycle=b''.join(struct.pack('<h',int(.45*32767*math.sin(2*math.pi*hz*i/24000)))for i in range(24000));w.writeframes(cycle*180)
    browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required'])
    c=browser.new_context(viewport=dict(width=844 if MOBILE else 1440,height=390 if MOBILE else 1050),has_touch=MOBILE,is_mobile=MOBILE,device_scale_factor=1)
    init=INIT+"\nwindow.__engineCount=0;"
    if MOBILE:
        c.route('https://vk.ru/**',lambda q:q.fulfill(content_type='text/html; charset=utf-8',body=fixture));c.add_init_script(init+'\n'+bundle)
    else:
        c.add_init_script(init+"\nwindow.__TAURI__={core:{invoke:async n=>n==='wallpaper_state'?{mode:'normal',quiet:false,monitors:[]}:null},event:{listen:()=>Promise.resolve(()=>{})}};")
        c.route('https://**',lambda q:q.abort())
    page=c.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto('https://vk.ru/audios42' if MOBILE else f'http://127.0.0.1:{server.server_port}/index.html')
    prefix='#deka-overlay ' if MOBILE else ''
    q=lambda s:page.locator(prefix+s)
    root=q('.app' if MOBILE else '#desktopDJ')
    q('#files' if MOBILE else '#file').set_input_files(paths)
    if MOBILE:q('#listA .vlrow').first.tap();q('#listB .vlrow').nth(1).tap()
    else:page.get_by_role('button',name='В A: Studio-440',exact=True).click();page.get_by_role('button',name='В B: Studio-660',exact=True).click()
    page.wait_for_function('__dj.state.A.duration===180&&__dj.state.B.duration===180')
    page.evaluate("__dj.setAutoMix(false);__dj.setRepeat(true);window.__savedEngine=__dj;window.__savedA=currentAudio('A');__dj.play('A');__dj.play('B')")
    page.wait_for_function('measure(440).amp>.03&&measure(660).amp>.03')
    session=c.new_cdp_session(page) if MOBILE else None
    def activate(el):el.tap() if MOBILE else el.click()
    def surface(selector):return q(selector).locator('..').locator('.dc-surface')
    def gesture(el,kind,points=1,cancel=False):
        el.scroll_into_view_if_needed();r=el.bounding_box();cx=r['x']+r['width']/2;cy=r['y']+r['height']/2
        if kind=='rotary':coords=[(cx+min(r['width'],r['height'])*.38*math.cos(a),cy+min(r['width'],r['height'])*.38*math.sin(a)) for a in [i*math.pi/20 for i in range(11)]]
        elif kind=='vertical':coords=[(cx,r['y']+r['height']*.7),(cx,r['y']+r['height']*.25)]
        elif kind=='encoder':coords=[(cx,cy+10),(cx,cy-30)]
        else:coords=[(r['x']+r['width']*.35,cy),(r['x']+r['width']*.75,cy)]
        if MOBILE:
            finger=lambda x,y:dict(x=x,y=y,id=1,radiusX=3,radiusY=3,force=1)
            session.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[finger(*coords[0])]))
            for xy in coords[1:]:session.send('Input.dispatchTouchEvent',dict(type='touchMove',touchPoints=[finger(*xy)]));page.wait_for_timeout(35)
            session.send('Input.dispatchTouchEvent',dict(type='touchCancel' if cancel else 'touchEnd',touchPoints=[]))
        else:
            page.mouse.move(*coords[0]);page.mouse.down()
            for xy in coords[1:]:page.mouse.move(*xy,steps=3);page.wait_for_timeout(20)
            page.mouse.up()
    for theme,kind in [('aurora','rotary'),('acid','vertical'),('editorial','encoder')]:
        activate(q('#djStyle'));activate(q('[data-theme='+theme+']'));activate(q('#djThemeSave'))
        check(theme+' selects a distinct physical interaction',q('[data-eq=A][data-band="0"]').locator('..').get_attribute('data-kind')==kind)
        check(theme+' keeps the exact live decoder and engine',page.evaluate("__dj===__savedEngine&&currentAudio('A')===__savedA&&!__dj.state.A.paused&&!__dj.state.B.paused"))
        page.evaluate("__dj.setEQ('A',0,0);__dj.setEQ('B',0,0);__dj.setCross(0);__dj.setMaster(.8)")
        gesture(surface('[data-eq=A][data-band="0"]'),kind)
        check(theme+' pointer controls only A EQ',page.evaluate('__dj.state.A.eq[0]>2&&__dj.state.B.eq[0]===0'),eq=page.evaluate('[__dj.state.A.eq[0],__dj.state.B.eq[0]]'))
        if not MOBILE:
            el=surface('[data-eq=A][data-band="0"]');el.focus();el.press('Home');check(theme+' keyboard clamps to minimum',page.evaluate('__dj.state.A.eq[0]===-12'));el.press('End');check(theme+' keyboard clamps to maximum',page.evaluate('__dj.state.A.eq[0]===12'));el.press('0')
        if theme=='editorial':
            if MOBILE:
                page.set_viewport_size(dict(width=390,height=844));page.wait_for_timeout(350);activate(q('#djBtn'))
            inc=q('[data-eq=A][data-band="0"]').locator('..').locator('.dc-step').last
            before=page.evaluate('__dj.state.A.eq[0]');activate(inc)
            check('Precision plus advances by exactly one EQ step',page.evaluate('__dj.state.A.eq[0]')==before+1)
            if MOBILE:page.set_viewport_size(dict(width=844,height=390));page.wait_for_timeout(350);activate(q('#djBtn'))
        page.evaluate("__dj.setEQ('A',0,0);__dj.setEQ('A',1,0);__dj.setEQ('A',2,0)")
        if MOBILE:activate(q('#tabA3'))
        fx=q('#amountAEcho' if MOBILE else '[data-effect-amount=A][data-name=Echo]');fx.fill('35')
        fxsurf=fx.locator('..').locator('.dc-surface');fxkind=fx.locator('..').get_attribute('data-kind');gesture(fxsurf,fxkind)
        activate(q('#fxAEcho' if MOBILE else '#djFXAEcho'))
        check(theme+' FX amount and pad drive the live A processor',page.evaluate('__dj.state.A.effects.Echo.on&&__dj.state.A.effects.Echo.amount>.5&&!__dj.state.B.effects.Echo.on'))
        activate(q('#fxAEcho' if MOBILE else '#djFXAEcho'))
        if MOBILE:activate(q('#tabA0'))
        page.wait_for_timeout(800)
        check(theme+' retains both measured audio signals',page.evaluate('measure(440).amp>.02&&measure(660).amp>.02'))
        if MOBILE:
            for width,height in [(844,390),(390,844)]:
                page.set_viewport_size(dict(width=width,height=height));page.wait_for_timeout(350);activate(q('#djBtn'))
                q('.console').evaluate('e=>e.scrollTop=0');q('#message').evaluate('e=>e.hidden=true')
                check(theme+f' mobile has no horizontal overflow {width}x{height}',root.evaluate('e=>e.scrollWidth<=e.clientWidth+1'))
                page.screenshot(path=str(OUT/f'console-mobile-{theme}-{width}.png'))
            page.set_viewport_size(dict(width=844,height=390));page.wait_for_timeout(350);activate(q('#djBtn'))
        else:
            page.evaluate('scrollTo(0,0)');page.screenshot(path=str(OUT/f'console-desktop-{theme}.png'),full_page=True)
            activate(q('#djCompact'));check(theme+' compact mode keeps actual transport and EQ',q('#djDiscA').is_hidden() and surface('[data-eq=A][data-band="0"]').is_visible() and page.evaluate('!__dj.state.A.paused&&!__dj.state.B.paused'))
            page.screenshot(path=str(OUT/f'console-compact-{theme}.png'),full_page=True);activate(q('#djCompact'))
    activate(q('#djStyle'));activate(q('[data-theme=acid]'));activate(q('#djThemeCancel'))
    check('Cancel restores the saved control mechanics',root.get_attribute('data-console-theme')=='editorial' and q('[data-eq=A][data-band="0"]').locator('..').get_attribute('data-kind')=='encoder')
    activate(q('#djStyle'));activate(q('[data-theme=aurora]'));page.keyboard.press('Escape')
    check('Escape restores the saved design',root.get_attribute('data-console-theme')=='editorial')
    if MOBILE:
        # Two fingers on different linear faders must never steal each other's state.
        activate(q('#djStyle'));activate(q('[data-theme=acid]'));activate(q('#djThemeSave'))
        page.evaluate("__dj.setEQ('A',0,0);__dj.setEQ('B',0,0)")
        q('.console').evaluate('e=>e.scrollTop=0');a=surface('[data-eq=A][data-band="0"]').bounding_box();b=surface('[data-eq=B][data-band="0"]').bounding_box()
        finger=lambda r,f,i:dict(x=r['x']+r['width']/2,y=r['y']+r['height']*f,id=i,radiusX=3,radiusY=3,force=1)
        session.send('Input.dispatchTouchEvent',dict(type='touchStart',touchPoints=[finger(a,.5,1),finger(b,.5,2)]))
        session.send('Input.dispatchTouchEvent',dict(type='touchMove',touchPoints=[finger(a,.2,1),finger(b,.8,2)]))
        check('Two real fingers independently move A up and B down',page.evaluate('__dj.state.A.eq[0]>3&&__dj.state.B.eq[0]<-3'))
        session.send('Input.dispatchTouchEvent',dict(type='touchCancel',touchPoints=[]))
        check('Touch cancellation leaves no captured knobs or audio interruption',q('.dc-dragging').count()==0 and page.evaluate('!__dj.state.A.paused&&!__dj.state.B.paused'))
    else:
        page.evaluate("__dj.setEQ('A',0,0);__dj.setEQ('B',0,0);__dj.setCross(0);__dj.setMaster(.8)");page.wait_for_timeout(800)
        before=page.evaluate('measure(660).amp');el=surface('#djMaster');el.focus();el.press('Home')
        for _ in range(4):el.press('PageUp')
        page.wait_for_timeout(800);check('Hardware master changes measured gain to half',abs(page.evaluate('measure(660).amp')/before-.5)<.08)
        cross=surface('#djCross');cross.focus();cross.press('End');page.wait_for_timeout(800)
        check('Hardware crossfader isolates the actual B signal',page.evaluate('measure(440).amp<.001&&measure(660).amp>.02'))
        for size in [(1120,780),(1024,640),(896,624)]:
            page.set_viewport_size(dict(width=size[0],height=size[1]));check('No desktop horizontal overflow '+str(size),page.evaluate('document.documentElement.scrollWidth<=innerWidth'))
    check('No surface runtime exceptions',not errors,errors=errors)
    browser.close()
finally:
 server.shutdown()
 (OUT/('console-mobile-report.json' if MOBILE else 'console-desktop-report.json')).write_text(json.dumps({'tests':checks,'method':'Actual mouse / keyboard or CDP multitouch; measured Web Audio PCM; VK content and native bridge are explicit fixtures, not a physical phone test.'},ensure_ascii=False,indent=2))
