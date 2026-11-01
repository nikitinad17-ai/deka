"""Inspect both real UI pages. Native path uses exact built EXE, no IPC replacement."""
import json,os,re,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
ROOT=Path(__file__).resolve().parents[1];OUT=ROOT/'test-output';OUT.mkdir(exist_ok=True);rows=[];native='--native'in sys.argv
with sync_playwright()as p:
 if native:
  browser=p.chromium.connect_over_cdp(os.environ['DEKA_CDP']);context=browser.contexts[0];page=next(q for q in context.pages if 'tauri.localhost'in q.url);page.reload()
 else:
  browser=p.chromium.launch(executable_path=os.environ.get('CHROMIUM_PATH'),args=['--no-sandbox','--autoplay-policy=no-user-gesture-required']);context=browser.new_context(viewport={'width':1120,'height':950});context.route('https://**',lambda q:q.abort());page=context.new_page();page.goto((ROOT/'src/index.html').as_uri())
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)));page.wait_for_selector('.brand')
 def check(name,ok,**facts):
  assert ok,(name,facts);rows.append(dict(test=name,passed=True,**facts));print('PASS',name,facts or '',flush=True)
 for dj in [False,True]:
  if dj:page.click('#djToggle')
  state=page.evaluate("""()=>{const root=document.querySelector('#desktopDJ:not([hidden])')||document.querySelector('.win-main'),brand=root.querySelector('.brand');return {before:getComputedStyle(brand,'::before').content,after:getComputedStyle(brand,'::after').content,bg:getComputedStyle(document.body).backgroundImage,text:document.body.innerText};}""")
  check(('DJ'if dj else'Main')+' renders dar music with the generated charcoal/gold artwork',state['before']=='"dar"'and state['after']=='" music"'and 'dar-music-background.webp'in state['bg'])
  check(('DJ'if dj else'Main')+' contains no album-title word',not re.search(r'\bверь\b',state['text'],re.I))
  for sel in (['#djShuffle','#djRepeat','#djAutoMix','#djPlayA','#djPlayB']if dj else['#djToggle','#bShuf','#bRep']):
   el=page.locator(sel);el.scroll_into_view_if_needed();box=el.bounding_box();assert box['x']>=0 and box['x']+box['width']<=page.evaluate('innerWidth')
  check(('DJ'if dj else'Main')+' keeps primary controls inside the window',True)
  page.evaluate('window.scrollTo(0,0)');page.screenshot(path=str(OUT/f'darmusic-{ "native"if native else"browser"}-{ "dj"if dj else"main"}.png'))
 check('Dar Music theme has no UI runtime errors',not errors,errors=errors)
 (OUT/('darmusic-native-visual.json'if native else'darmusic-visual.json')).write_text(json.dumps({'tests':rows,'method':'Exact built Windows WebView2 EXE, no IPC mock'if native else'Chromium render of exact project HTML/CSS, external requests blocked'},ensure_ascii=False,indent=2))
 if not native:browser.close()
