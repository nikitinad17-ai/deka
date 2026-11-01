"""Visual edition must retain every JS controller and every inline script verbatim."""
import hashlib,json,re,subprocess
from pathlib import Path
r=Path(__file__).resolve().parents[1];base='7844358154a7a9122cb2a47a3b691d20b4d8269b';rows=[]
for p in sorted((r/'src').glob('*.js')):
 before=subprocess.check_output(['git','show',base+':src/'+p.name],cwd=r);after=p.read_bytes();assert before==after,p.name;rows.append({'file':'src/'+p.name,'sha256':hashlib.sha256(after).hexdigest()})
old=subprocess.check_output(['git','show',base+':src/index.html'],cwd=r).decode();new=(r/'src/index.html').read_text();scripts=lambda s:re.findall(r'<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)</script>',s,re.I)
assert scripts(old)==scripts(new)
assert (r/'src/dar-music.css').exists()and "content:'dar'"in(r/'src/dar-music.css').read_text()and "content:' music'"in(r/'src/dar-music.css').read_text()
assert not re.search(r'\bверь\b',(r/'src/dar-music.css').read_text()+new,re.I)
config=json.loads((r/'src-tauri/tauri.conf.json').read_text());assert config['identifier']=='ru.volna.deka.darmusic'
assert subprocess.check_output(['git','show',base+':src-tauri/src/lib.rs'],cwd=r)==(r/'src-tauri/src/lib.rs').read_bytes()
out=r/'test-output';out.mkdir(exist_ok=True);(out/'darmusic-source-report.json').write_text(json.dumps({'passed':True,'base_source':'7844358154a7a9122cb2a47a3b691d20b4d8269b','files':rows,'inline_scripts_identical':True,'inline_script_sha256':[hashlib.sha256(s.encode()).hexdigest()for s in scripts(new)],'native_backend_identical':subprocess.check_output(['git','show',base+':src-tauri/src/lib.rs'],cwd=r)==(r/'src-tauri/src/lib.rs').read_bytes()},indent=2));print('PASS all',len(rows),'external JS files and inline controller scripts are byte-identical to Desktop 0.18')
