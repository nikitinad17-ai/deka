/* Shared A/B controller. Files mix independently; VK uses its existing native source. */
(function () {
  'use strict';
  const player = window.DekaDesktopPlayer;
  if (!player || !window.DekaDecks) return;
  const root = document.createElement('section');
  root.id = 'desktopDJ'; root.className = 'win'; root.hidden = true;
  root.setAttribute('aria-label', 'DJ-пульт: файлы и библиотека VK');
  const fxNames=['Flanger','Echo','Reverb','Filter','Phaser','Roll'];
  const deckHTML = side => `<section class="dj-deck" data-side="${side}" aria-label="Дека ${side}">
    <h2>DECK ${side} <span id="djStatus${side}">Пусто</span></h2>
    <div class="dj-track"><b id="djTitle${side}">Загрузите трек из библиотеки</b><small id="djArtist${side}">Локальный файл</small></div>
    <button class="dj-disc" id="djDisc${side}" aria-label="Дека ${side}" title="Дека ${side}"><span>${side}</span></button><small class="dj-vinyl-help" id="djVinyl${side}">BPM · локальный трек</small>
    <div class="dj-times"><span id="djTime${side}">00:00 / 00:00</span><span id="djRemain${side}">−00:00</span></div>
    <div class="dj-seek-wrap"><input class="dj-seek" type="range" id="djSeek${side}" min="0" max="1000" value="0" data-seek="${side}" aria-label="Позиция деки ${side}"><span class="dj-cue-marker" id="djCueMarker${side}" hidden title="Метка CUE">C</span></div>
    <div class="dj-transport"><button data-play="${side}" id="djPlay${side}" class="btn play">▶ Играть ${side}</button><label>BPM <input type="number" min="30" max="300" step="0.1" id="djBPM${side}" data-bpm="${side}" aria-label="Ручной BPM ${side}" placeholder="—"></label><button data-tap="${side}" class="btn">TAP</button><output id="djEffectiveBPM${side}" class="dj-effective">→ — BPM</output></div>
    <div class="dj-cuefx"><div class="dj-cue"><button class="btn toggle" data-cue="${side}" aria-pressed="false" title="Поставить CUE">CUE</button><span id="djCue${side}">—</span><button id="djKeyLock${side}" data-keylock="${side}" class="btn toggle dj-keylock" aria-pressed="true" title="Key Lock — сохранять тональность">Key Lock</button></div><div class="dj-fx" aria-label="Эффекты деки ${side}">${fxNames.map(name=>`<div class="dj-fx-cell"><button class="btn toggle" id="djFX${side}${name}" data-effect="${side}" data-name="${name}" aria-pressed="false" aria-label="${name} деки ${side}">${name}</button><input type="range" min="0" max="100" value="35" data-effect-amount="${side}" data-name="${name}" aria-label="Интенсивность ${name} деки ${side}"></div>`).join('')}</div></div>
    <div class="dj-label"><div class="dj-rate-heading"><label for="djRate${side}">Темп</label><output id="djRateLabel${side}">0.0%</output><button data-reset="${side}" class="btn dj-rate-reset" title="Вернуть ручной темп к 0%">0%</button></div><input type="range" min="-8" max="8" step="0.1" value="0" id="djRate${side}" data-rate="${side}" aria-label="Темп деки ${side}"></div>
    <div class="dj-eq">${['LOW','MID','HIGH'].map((name, band) => `<label>${name}<input type="range" min="-12" max="12" value="0" data-eq="${side}" data-band="${band}" aria-label="${name} деки ${side}"></label>`).join('')}</div>
    <meter id="djMeter${side}" min="0" max="1" value="0" aria-label="Пиковый уровень ${side}"></meter>
  </section>`;
  const brakeHTML=side=>`<aside class="dj-brake" data-side="${side}" aria-label="Реверс деки ${side}"><b>РЕВЕРС</b><strong>Дека ${side}</strong>${[[1.5,'Быстро','1,5'],[2.5,'Средне','2,5'],[3.5,'Плавно','3,5']].map(([time,name,label])=>`<button class="btn" data-brake="${time}" data-side="${side}" aria-label="Реверс ${side} ${label} секунды"><b>${name}</b><small>${label} с</small></button>`).join('')}<small id="djBrakeStatus${side}">До паузы</small></aside>`;
  root.innerHTML = `<div class="bar"><div class="brand">ДЕ<b>КА</b> · DJ</div><span class="spacer"></span><button class="btn toggle" id="djShuffle" aria-pressed="false" title="Случайный следующий трек">SHUF</button><button class="btn toggle" id="djRepeat" aria-pressed="false" title="Повтор текущего трека">REP 1</button><button class="btn" id="djClose">← Плеер</button></div>
    <div id="djDeckPanel"><div class="dj-intro">AUTO MIX · 17 секунд: BPM SYNC + частоты + громкость · FX отдельно для A / B</div>
    <div class="dj-console">${brakeHTML('A')}${deckHTML('A')}<section class="dj-mixer" aria-label="Микшер">
      <b>MASTER</b><meter id="djMeterMaster" min="0" max="1" value="0" aria-label="Пиковый уровень Master"></meter><span id="djPeak">−∞ dBFS</span>
      <label>Выход<input id="djMaster" type="range" min="0" max="100" value="80" aria-label="Master DJ"></label>
      <div class="dj-cross"><b>A ⇄ B</b><input id="djCross" type="range" min="-100" max="100" value="0" aria-label="Кроссфейдер A B"><button id="djCenter" class="btn">Центр</button></div>
      <small>Равномощный переход<br>Запас уровня −12 dB<br>Без отдельного выхода наушников</small>
      <button id="djAutoMix" class="btn toggle" aria-pressed="true" title="Плавно перейти на следующую деку: темп, частоты и громкость за 17 секунд">AUTO MIX · 17 s</button><small id="djAutoState">Автопереход A ⇄ B</small><button id="djPauseAll" class="btn">Пауза обеих</button>
    </section>${deckHTML('B')}${brakeHTML('B')}</div>
    <div id="djMessage" role="status" aria-live="polite">Перетащите файлы из папки на пульт или выберите «В A» / «В B». Загрузка не запускает трек.</div>
    <section class="dj-library" aria-label="Библиотека DJ"><div class="dj-drop-hint">↓ Файлы или папка сюда · трек из списка — на пластинку A / B</div><div class="dj-tools"><select id="djSource" aria-label="Источник треков DJ"><option value="files">Мои файлы</option><option value="vk">Мои треки VK</option><option value="sets">Сеты</option></select><button class="btn" id="djSync">Загрузить VK</button><button class="btn open" id="djAdd">＋ Файлы</button><button class="btn open" id="djAddSet">＋ Сет</button><input type="search" id="djSearch" placeholder="Название или исполнитель" aria-label="Поиск треков и сетов"><span id="djCount"></span></div><form id="djSetForm" class="dj-set-form" hidden><label for="djSetLink">Ссылка на сет VK Видео</label><input id="djSetLink" type="url" placeholder="https://vkvideo.ru/video-…" required><button class="btn" type="submit">Добавить</button><button class="btn" type="button" id="djSetCancel">Отмена</button></form><div id="djList"></div><p id="djEmpty" hidden></p><small id="djSourceHint">Файлы остаются на компьютере. После закрытия приложения выберите их снова.</small></section></div>`;
  document.querySelector('.wrap').appendChild(root);
  const $ = id => document.getElementById(id);
  const engine = DekaDecks.create({ djMode: true, continuous:true, autoMix:true, smartMix:true,beatMix:true,cueCycle:true,brake:true,reverseMix:true,effects:true, externalTempo:true, analysis:DekaMixAnalysis.create(), fadeSeconds:17, ...player.settings(), vinyl:true, vk: c => player.command(c), change: render, message: text => { $('djMessage').textContent = text; } });
  const status = { empty:'Пусто', loading:'Загрузка…', ready:'Готово', playing:'Играет', paused:'Пауза', ended:'Конец', error:'Ошибка', held:'Пластинка удерживается' };
  const fmt = seconds => { const n = Math.floor(Math.max(0, Number(seconds) || 0)); return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };
  let lastPaint=0,paintTimer=null;
  function render() {
    const now=performance.now(),wait=window.DekaWallpaper?.quiet?1000-(now-lastPaint):0;if(lastPaint&&wait>0){if(paintTimer===null)paintTimer=setTimeout(()=>{paintTimer=null;render();},wait);return;}if(paintTimer!==null){clearTimeout(paintTimer);paintTimer=null;}lastPaint=now;
    const d=engine.diagnostics();
    $('djShuffle').setAttribute('aria-pressed',String(d.shuffle));
    $('djRepeat').setAttribute('aria-pressed',String(d.repeatTrack));
    $('djAutoMix').setAttribute('aria-pressed',String(d.autoMix));
    const reasons={range:'разные темпы',manual:'ручной темп','manual-bpm':'BPM изменён','no-bpm':'ритм не определён'};
    $('djAutoState').textContent=d.reverse?'Реверс '+d.reverse.from+' → '+d.reverse.to+' · '+d.reverse.elapsed.toFixed(1)+' / '+d.reverse.duration+' с':d.mixing?'Сведение '+d.transition.elapsed.toFixed(1)+' / '+d.transition.duration.toFixed(0)+' с · '+(d.transition.matched?'SYNC '+d.transition.targetBPM.toFixed(1)+' BPM':'Без BPM SYNC: '+(reasons[d.transition.reason]||'ручной режим')):d.preparing?'Подготовка BPM…':d.repeatTrack?'Повтор трека':d.autoMix?'Автосведение · 17 с · BPM':'Автопереход в конце трека';
    if(!$('djCross').matches(':active'))$('djCross').value=d.cross*100;
    ['A','B'].forEach(side => {
      const s = engine.state[side];
      $('djTitle'+side).textContent = s.track ? s.track.title : 'Загрузите трек из библиотеки';
      $('djArtist'+side).textContent = s.track ? s.track.artist + (s.track.kind==='set'?' · Сет':s.track.kind==='file'?'':' · VK') : 'Выберите файл или трек VK';
      const local=!!s.track&&s.track.kind==='file';
      root.querySelectorAll('[data-rate="'+side+'"],[data-keylock="'+side+'"],[data-nudge="'+side+'"],[data-bpm="'+side+'"],[data-tap="'+side+'"],[data-reset="'+side+'"]').forEach(el=>el.disabled=!s.track);
      $('djStatus'+side).textContent = s.braking?'Торможение…':status[s.status] || 'Пауза';
      $('djTime'+side).textContent = fmt(s.time) + ' / ' + fmt(s.duration);
      $('djRemain'+side).textContent = '−' + fmt(s.duration-s.time);
      const seek = $('djSeek'+side); if (!seek.matches(':active')) seek.value = s.duration ? s.time / s.duration * 1000 : 0;seek.style.setProperty('--progress',(s.duration?s.time/s.duration*100:0)+'%');
      $('djCue'+side).textContent = s.cueActive?fmt(s.cue):'—';
      const cueButton=root.querySelector('[data-cue="'+side+'"]'),marker=$('djCueMarker'+side),ratio=s.duration?s.cue/s.duration:0;
      cueButton.setAttribute('aria-pressed',String(s.cueActive));cueButton.disabled=!s.track;cueButton.title=!s.cueActive?'Поставить CUE в текущей позиции':s.cueStage===1?'Вернуться к CUE и поставить деку на паузу':'Удалить CUE без перемотки';
      marker.hidden=!s.cueActive;marker.style.left=`calc(${ratio*100}% + ${8-16*ratio}px)`;marker.title='CUE '+fmt(s.cue);
      $('djPlay'+side).textContent = s.paused ? '▶ Играть '+side : 'Ⅱ Пауза '+side;
      $('djPlay'+side).disabled = !s.track || s.pending;
      const disc = $('djDisc'+side);
      disc.classList.toggle('playing', !s.paused && s.status === 'playing');
      disc.classList.toggle('held', s.held);
      const actualRate=s.braking?s.braking.baseRate*s.braking.speed:s.actualRate||(s.autoRate===null?s.rate+s.nudge:s.autoRate);
      disc.querySelector('span').style.animationDuration = (1.8 / actualRate)+'s';
      disc.disabled=!local;
      $('djVinyl'+side).textContent=!s.track?'Выберите аудиофайл':!local?(s.track.kind==='set'?'СЕТ · VK Видео':'VK · один поток'):s.held?'Пластинка удерживается':s.analysisStatus==='loading'?'Анализирую ритм…':'Удержание / скретч'+(s.analysis?.bpm?' · ≈ '+s.analysis.bpm+' BPM':'');
      $('djKeyLock'+side).setAttribute('aria-pressed', String(s.keyLock));
      const baseBPM=s.syncBPM||s.bpm||s.analysis?.bpm; $('djEffectiveBPM'+side).textContent = '→ '+(baseBPM ? (baseBPM*actualRate).toFixed(1) : '—')+' BPM';
      const percent=(actualRate-1)*100;
      $('djRateLabel'+side).textContent = (percent>=0?'+':'')+percent.toFixed(1)+'%'+(s.braking?' · BRAKE':s.autoRate===null?'':' · SYNC');
      const rate=$('djRate'+side);if(!rate.matches(':active'))rate.value=Math.max(-8,Math.min(8,percent)).toFixed(1);rate.setAttribute('aria-valuetext',percent.toFixed(1)+'%'+(s.autoRate===null?'':' в автомиксе'));
      root.querySelectorAll('[data-eq="'+side+'"]').forEach(el=>{if(!el.matches(':active'))el.value=s.eq[+el.dataset.band]+s.autoEQ[+el.dataset.band];});
      fxNames.forEach(name=>{const effect=s.effects[name],button=$('djFX'+side+name),range=root.querySelector('[data-effect-amount="'+side+'"][data-name="'+name+'"]');button.setAttribute('aria-pressed',String(effect.on));button.disabled=!local||(name==='Roll'&&s.fxStatus!=='ready');range.disabled=!local;if(!range.matches(':active'))range.value=effect.amount*100;});
      if (document.activeElement !== $('djBPM'+side)) $('djBPM'+side).value = s.bpm || s.analysis?.bpm || '';
    });
    renderBrake();
  }
  function renderBrake(){
    ['A','B'].forEach(side=>{
      const s=engine.state[side],local=s.track?.kind==='file';
      root.querySelectorAll('[data-brake][data-side="'+side+'"]').forEach(b=>b.disabled=!local||s.brakeStatus!=='ready'||s.held||(s.paused&&!s.braking));
      $('djBrakeStatus'+side).textContent=!local?'Локальные файлы':s.brakeStatus==='loading'?'Подготовка…':s.brakeStatus==='error'?'Недоступно':s.braking?s.braking.elapsed.toFixed(1)+' / '+s.braking.duration+' с':engine.diagnostics().autoMix?'Переход на '+(side==='A'?'B':'A'):'До паузы';
    });
    $('djShuffle').title=engine.diagnostics().repeatTrack?'SHUF включается для следующих треков; REP 1 сейчас повторяет текущий':'Случайный следующий трек';
  }
  const renderRow = (row, t) => {
    row.className = 'dj-row'; row.replaceChildren(); row.draggable = true;
    row.ondragstart = e => { e.dataTransfer.setData('application/x-deka-track', t.key); e.dataTransfer.effectAllowed='copy'; };
    row.title = 'Перетащите на пластинку A или B';
    const meta = document.createElement('span'); meta.className = 'dj-row-meta';
    const title = document.createElement('b'); title.textContent = t.title;
    const artist = document.createElement('small'); artist.textContent = t.artist;
    meta.append(title, artist); row.appendChild(meta);
    ['A','B'].forEach(side => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'В '+side;
      b.setAttribute('aria-label', 'В '+side+': '+t.title); b.onclick = () => load(side, t.key); row.appendChild(b); });
  };
  const listElement = $('djList'), canvas = document.createElement('div'); canvas.className = 'dj-list-canvas'; listElement.appendChild(canvas);
  let items = [], sourceChosen=false;
  const sourceTracks=()=> $('djSource').value==='sets'?player.sets():$('djSource').value==='vk'?player.vkItems():player.files();
  function renderRows() {
    const first = Math.max(0, Math.floor(listElement.scrollTop / 52) - 3), last = Math.min(items.length, first + 20);
    const existing = new Map(Array.from(canvas.children).map(el => [el.dataset.key, el]));
    const visible = new Set(items.slice(first, last).map(t => t.key));
    existing.forEach((el, key) => { if (!visible.has(key)) el.remove(); });
    for (let i = first; i < last; i++) { const t = items[i]; let row = existing.get(t.key);
      if (!row) { row = document.createElement('div'); row.dataset.key = t.key; canvas.appendChild(row); }
      const signature=JSON.stringify([t.title,t.artist,t.duration]);
      if(row.dataset.signature!==signature){renderRow(row,t);row.dataset.signature=signature;}
      row.style.top = i*52+'px';
    }
  }
  listElement.addEventListener('scroll', renderRows, { passive: true });
  function library() {
    const source=$('djSource').value, sets=source==='sets';
    $('djSync').hidden=source!=='vk';
    $('djAdd').hidden=sets; $('djAddSet').hidden=!sets;
    $('djSetForm').hidden=!sets||$('djSetForm').dataset.open!=='true';
    $('djSourceHint').textContent=sets?'Сет загружается в A или B. Одновременно играет один сет VK; на второй деке можно включить локальный файл.':source==='vk'?'Музыка VK использует один поток.':'Файлы остаются на компьютере. После закрытия приложения выберите их снова.';
    const q = $('djSearch').value.toLocaleLowerCase();
    const all = sourceTracks(); const filtered = all.filter(t => (t.title+' '+t.artist).toLocaleLowerCase().includes(q));
    $('djEmpty').hidden=filtered.length>0; $('djEmpty').textContent=q?'Ничего не найдено':sets?'Добавьте ссылку кнопкой «＋ Сет» или выберите сохранённые сеты.':'Список пуст';
    items = filtered; canvas.style.height = items.length*52+'px'; renderRows(); $('djCount').textContent = filtered.length+' / '+all.length;
  }
  function load(side, key) {
    const s = engine.state[side];
    if ((!s.paused || s.held) && !window.confirm('Заменить играющий трек в деке '+side+'?')) return;
    const list = sourceTracks(), index = list.findIndex(t => t.key === key); if (index < 0) return;
    engine.load(side, list, index); $('djRate'+side).value = 0;
    $('djMessage').textContent = 'Дека '+side+': загружен «'+list[index].title+'». Нажмите «Играть».';
  }
  $('djToggle').onclick = () => {
    player.pauseForDJ(); document.body.classList.add('dj-open'); root.hidden = false; library(); render(); window.dispatchEvent(new Event('resize'));
  };
  $('djClose').onclick = () => {
    engine.pause('A'); engine.pause('B');
    player.command({type:'rate', value:1, preservePitch:true});
    root.hidden = true;
    document.body.classList.remove('dj-open');
    window.dispatchEvent(new Event('resize'));
  };
  $('djAdd').onclick = () => { $('djSource').value='files'; sourceChosen=true; player.openFiles(); };
  $('djAddSet').onclick=()=>{ $('djSetForm').dataset.open='true';library();$('djSetLink').focus(); };
  $('djSetCancel').onclick=()=>{ $('djSetForm').dataset.open='false';library(); };
  $('djSetForm').onsubmit=e=>{
    e.preventDefault();
    const item=player.addSet($('djSetLink').value);
    if(!item){$('djMessage').textContent='Нужна ссылка на видео VK: vkvideo.ru/video-…';return;}
    $('djSetLink').value='';$('djSetForm').dataset.open='false';$('djSearch').value='';
    $('djSource').value='sets';sourceChosen=true;listElement.scrollTop=0;library();
    $('djMessage').textContent='Сет добавлен. Выберите «В A» или «В B», затем нажмите «Играть» на деке.';
  };
  window.addEventListener('deka:sets',library);
  $('djSource').onchange=()=>{sourceChosen=true;listElement.scrollTop=0;canvas.replaceChildren();library();};
  $('djSync').onclick=()=>{sourceChosen=true;$('djSource').value='vk';player.collect();library();$('djMessage').textContent='Загружаю ваши треки VK…';};
  $('djShuffle').onclick=()=>player.setShuffle(!engine.diagnostics().shuffle);
  $('djRepeat').onclick=()=>player.setRepeat(!engine.diagnostics().repeatTrack);
  $('djAutoMix').onclick=()=>engine.setAutoMix(!engine.diagnostics().autoMix);
  window.addEventListener('deka:queue',e=>{engine.setShuffle(e.detail.shuffle);engine.setRepeat(e.detail.repeatTrack);});
  window.addEventListener('deka:library',()=>{if(!sourceChosen&&player.vkItems().length)$('djSource').value='vk';library();});
  window.addEventListener('deka:vk:state', e => {
    if (root.hidden) return;
    engine.noteVK(e.detail);
  });
  window.addEventListener('deka:vk:ended',e=>{if(!root.hidden)engine.endedVK(e.detail);}); $('djSearch').oninput = () => { listElement.scrollTop = 0; library(); };
  $('djCross').oninput = e => engine.setCross(e.target.value/100,true);
  $('djCenter').onclick = () => { $('djCross').value = 0; engine.setCross(0,true); };
  $('djMaster').oninput = e => engine.setMaster(e.target.value/100);
  $('djPauseAll').onclick = () => { engine.pause('A'); engine.pause('B'); };
  root.addEventListener('input', e => {
    const d = e.target.dataset, v = +e.target.value;
    if (d.rate) engine.setRate(d.rate, 1+v/100);
    if (d.gain) engine.setGain(d.gain, v/100);
    if (d.eq) engine.setEQ(d.eq, +d.band, v);
    if (d.bpm) engine.setBPM(d.bpm, v);
    if(d.effectAmount)engine.setEffect(d.effectAmount,d.name,engine.state[d.effectAmount].effects[d.name].on,v/100);
  });
  root.addEventListener('change', e => { const side = e.target.dataset.seek; if (side) engine.seek(side, e.target.value/1000*engine.state[side].duration); });
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if(d.brake)engine.brake(d.side,+d.brake);
    if (d.play) engine.toggle(d.play);
    if (d.cue) engine.cue(d.cue);
    if (d.reset) { engine.setRate(d.reset, 1); $('djRate'+d.reset).value = 0; }
    if (d.tap) engine.tap(d.tap);
    if (d.keylock) engine.setKeyLock(d.keylock, !engine.state[d.keylock].keyLock);
    if(d.effect){const fx=engine.state[d.effect].effects[d.name];engine.setEffect(d.effect,d.name,!fx.on,fx.amount);}
  });
  root.querySelectorAll('[data-nudge]').forEach(b => {
    const stop = () => engine.nudge(b.dataset.nudge, 0);
    b.addEventListener('pointerdown', e => { b.setPointerCapture(e.pointerId); engine.nudge(b.dataset.nudge, +b.dataset.value); });
    ['pointerup','pointercancel','lostpointercapture','blur'].forEach(name => b.addEventListener(name, stop));
    b.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); engine.nudge(b.dataset.nudge, +b.dataset.value); } });
    b.addEventListener('keyup', stop);
  });
  ['A','B'].forEach(side => {
    const disc = $('djDisc'+side);
    let pointer=null,angle=0,rotation=0,lastX=0,lastRadius=0;
    const record=disc.querySelector('span');
    const point=e=>{const r=disc.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;return {angle:Math.atan2(y,x),radius:Math.hypot(x,y),width:r.width};};
    disc.addEventListener('pointerdown',e=>{
      if(e.button!==0||pointer!==null||engine.state[side].track?.kind!=='file')return;e.preventDefault();
      const transform=getComputedStyle(record).transform;if(transform!=='none'){const m=new DOMMatrixReadOnly(transform);rotation=Math.atan2(m.b,m.a)*180/Math.PI;}
      record.style.animation='none';record.style.transform='rotate('+rotation+'deg)';
      const p=point(e);pointer=e.pointerId;angle=p.angle;lastRadius=p.radius;lastX=e.clientX;disc.setPointerCapture(pointer);engine.scratchBegin(side);
    });
    disc.addEventListener('pointermove',e=>{
      if(e.pointerId!==pointer)return;const p=point(e);let delta=p.angle-angle;if(delta>Math.PI)delta-=2*Math.PI;if(delta< -Math.PI)delta+=2*Math.PI;
      if(Math.min(p.radius,lastRadius)<p.width*.15)delta=(e.clientX-lastX)/p.width*2*Math.PI;
      angle=p.angle;lastRadius=p.radius;lastX=e.clientX;rotation+=delta*180/Math.PI;record.style.transform='rotate('+rotation+'deg)';engine.scratchMove(side,delta/(2*Math.PI)*1.8);
    });
    const release=e=>{if(pointer===null||(e?.pointerId!==undefined&&e.pointerId!==pointer))return;pointer=null;record.style.animation='';record.style.transform='';engine.scratchEnd(side);};
    ['pointerup','pointercancel','lostpointercapture'].forEach(name=>disc.addEventListener(name,release));window.addEventListener('blur',()=>release());
    disc.addEventListener('keydown',e=>{if((e.key===' '||e.key==='Enter')&&!e.repeat){e.preventDefault();engine.scratchBegin(side);}if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();engine.seek(side,engine.state[side].time+(e.key==='ArrowLeft'?-1:1));}});
    disc.addEventListener('keyup',e=>{if(e.key===' '||e.key==='Enter'){e.preventDefault();engine.scratchEnd(side);}});
    const deck = disc.closest('.dj-deck');
    DekaFileDrop.attach(deck, files => { const imported=player.importFiles(files); $('djSource').value='files'; sourceChosen=true; if (imported.length) load(side, imported[0].key); }, text=>$('djMessage').textContent=text);
    deck.addEventListener('dragover', e=>{ if (e.dataTransfer.types.includes('application/x-deka-track')) { e.preventDefault(); e.dataTransfer.dropEffect='copy'; deck.classList.add('file-over'); } });
    deck.addEventListener('dragleave', e=>{ if (!deck.contains(e.relatedTarget)) deck.classList.remove('file-over'); });
    deck.addEventListener('drop', e=>{ const key=e.dataTransfer.getData('application/x-deka-track'); if (key) { e.preventDefault(); deck.classList.remove('file-over'); load(side,key); } });

  });
  DekaFileDrop.attach(root, files=>{ const imported=player.importFiles(files); $('djMessage').textContent='Добавлено / найдено в библиотеке: '+imported.length+'. Перетащите трек на A или B.'; }, text=>$('djMessage').textContent=text);
  window.addEventListener('blur', () => { engine.nudge('A', 0); engine.nudge('B', 0); });
  window.addEventListener('deka:files', ()=>{sourceChosen=true;$('djSource').value='files';library();});
  window.addEventListener('deka:remove-file', e => {
    ['A','B'].forEach(side => { if (engine.state[side].track && engine.state[side].track.key === e.detail) engine.clear(side); });
    library();
  });
  window.addEventListener('beforeunload', () => engine.destroy());
  setInterval(() => {
    if (root.hidden||window.DekaWallpaper?.quiet) return;
    const levels = engine.meters();
    ['A','B','master'].forEach(side => { const el = $('djMeter'+(side === 'master' ? 'Master' : side)); el.value = levels[side] ? levels[side].peak : 0; });
    const peak = levels.master && levels.master.peak;
    $('djPeak').textContent = peak > 0.00001 ? (20*Math.log10(peak)).toFixed(1)+' dBFS' : '−∞ dBFS';
  }, 70);
  render();
})();
