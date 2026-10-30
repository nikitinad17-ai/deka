/* Desktop controller: shared local engine, no VK source or remote audio imports. */
(function () {
  'use strict';
  const player = window.DekaDesktopPlayer;
  if (!player || !window.DekaDecks) return;
  const root = document.createElement('section');
  root.id = 'desktopDJ'; root.className = 'win'; root.hidden = true;
  root.setAttribute('aria-label', 'DJ-пульт для локальных файлов');
  const deckHTML = side => `<section class="dj-deck" data-side="${side}" aria-label="Дека ${side}">
    <h2>DECK ${side} <span id="djStatus${side}">Пусто</span></h2>
    <div class="dj-track"><b id="djTitle${side}">Загрузите трек из библиотеки</b><small id="djArtist${side}">Локальный файл</small></div>
    <button class="dj-disc" id="djDisc${side}" aria-label="Перемотка ${side}: стрелки ±1 с, колесо ±1 с" title="Колесо или стрелки: перемотка ±1 с">${side}</button>
    <div class="dj-times"><span id="djTime${side}">00:00 / 00:00</span><span id="djRemain${side}">−00:00</span></div>
    <input type="range" id="djSeek${side}" min="0" max="1000" value="0" data-seek="${side}" aria-label="Позиция деки ${side}">
    <div class="dj-buttons"><button data-play="${side}" id="djPlay${side}" class="btn play">▶ Играть ${side}</button><button class="btn" data-cue="${side}" title="На паузе: поставить точку. При игре: остановить и вернуться к ней.">CUE</button><span id="djCue${side}">00:00</span></div>
    <label class="dj-label">Темп <output id="djRateLabel${side}">0.0%</output><input type="range" min="-8" max="8" step="0.1" value="0" id="djRate${side}" data-rate="${side}" aria-label="Темп деки ${side}"></label>
    <div class="dj-buttons"><button data-reset="${side}" class="btn">Сброс</button><button data-nudge="${side}" data-value="-0.04" class="btn" aria-label="Замедлить ${side} при удержании">− Nudge</button><button data-nudge="${side}" data-value="0.04" class="btn" aria-label="Ускорить ${side} при удержании">+ Nudge</button></div>
    <div class="dj-buttons"><label>BPM <input type="number" min="30" max="300" step="0.1" id="djBPM${side}" data-bpm="${side}" aria-label="Ручной BPM ${side}" placeholder="—"></label><button data-tap="${side}" class="btn">TAP</button></div>
    <div class="dj-eq">${['LOW','MID','HIGH'].map((name, band) => `<label>${name}<input type="range" min="-12" max="12" value="0" data-eq="${side}" data-band="${band}" aria-label="${name} деки ${side}"></label>`).join('')}</div>
    <label class="dj-label">Уровень ${side}<input type="range" min="0" max="100" value="100" data-gain="${side}" aria-label="Уровень деки ${side}"></label>
    <meter id="djMeter${side}" min="0" max="1" value="0" aria-label="Пиковый уровень ${side}"></meter>
  </section>`;
  root.innerHTML = `<div class="bar"><div class="brand">ДЕ<b>КА</b> · DJ</div><span class="spacer"></span><button class="btn" id="djClose">← Плеер</button></div>
    <div class="dj-intro">Два локальных трека · CUE — точка возврата · темп меняет высоту звука</div>
    <div class="dj-console">${deckHTML('A')}<section class="dj-mixer" aria-label="Микшер">
      <b>MASTER</b><meter id="djMeterMaster" min="0" max="1" value="0" aria-label="Пиковый уровень Master"></meter><span id="djPeak">−∞ dBFS</span>
      <label>Выход<input id="djMaster" type="range" min="0" max="100" value="80" aria-label="Master DJ"></label>
      <div class="dj-cross"><b>A ⇄ B</b><input id="djCross" type="range" min="-100" max="100" value="0" aria-label="Кроссфейдер A B"><button id="djCenter" class="btn">Центр</button></div>
      <small>Равномощный переход<br>Запас уровня −12 dB<br>Без отдельного выхода наушников</small>
      <button id="djPauseAll" class="btn">Пауза обеих</button>
    </section>${deckHTML('B')}</div>
    <div id="djMessage" role="status" aria-live="polite">Добавьте файлы и выберите «В A» / «В B». Загрузка не запускает трек.</div>
    <section class="dj-library" aria-label="Локальная библиотека DJ"><div class="dj-tools"><button class="btn open" id="djAdd">＋ Файлы</button><input type="search" id="djSearch" placeholder="Название или исполнитель" aria-label="Поиск локальных треков"><span id="djCount"></span></div><div id="djList"></div><small>Файлы остаются на компьютере. После закрытия приложения выберите их снова.</small></section>`;
  document.querySelector('.wrap').appendChild(root);
  const $ = id => document.getElementById(id);
  const engine = DekaDecks.create({ djMode: true, vk: () => false, change: render, message: text => { $('djMessage').textContent = text; } });
  const status = { empty:'Пусто', loading:'Загрузка…', ready:'Готово', playing:'Играет', paused:'Пауза', ended:'Конец', error:'Ошибка' };
  const fmt = seconds => { const n = Math.floor(Math.max(0, Number(seconds) || 0)); return String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0'); };
  function render() {
    ['A','B'].forEach(side => {
      const s = engine.state[side];
      $('djTitle'+side).textContent = s.track ? s.track.title : 'Загрузите трек из библиотеки';
      $('djArtist'+side).textContent = s.track ? s.track.artist : 'Локальный файл';
      $('djStatus'+side).textContent = status[s.status] || 'Пауза';
      $('djTime'+side).textContent = fmt(s.time) + ' / ' + fmt(s.duration);
      $('djRemain'+side).textContent = '−' + fmt(s.duration-s.time);
      const seek = $('djSeek'+side); if (!seek.matches(':active')) seek.value = s.duration ? s.time / s.duration * 1000 : 0;
      $('djCue'+side).textContent = fmt(s.cue);
      $('djPlay'+side).textContent = s.paused ? '▶ Играть '+side : 'Ⅱ Пауза '+side;
      $('djPlay'+side).disabled = !s.track || s.pending;
      $('djDisc'+side).classList.toggle('playing', !s.paused && s.status === 'playing');
      $('djRateLabel'+side).textContent = ((s.rate-1)*100).toFixed(1)+'%';
      if (document.activeElement !== $('djBPM'+side)) $('djBPM'+side).value = s.bpm || '';
    });
  }
  const renderRow = (row, t) => {
    row.className = 'dj-row'; row.replaceChildren();
    const meta = document.createElement('span'); meta.className = 'dj-row-meta';
    const title = document.createElement('b'); title.textContent = t.title;
    const artist = document.createElement('small'); artist.textContent = t.artist;
    meta.append(title, artist); row.appendChild(meta);
    ['A','B'].forEach(side => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.textContent = 'В '+side;
      b.setAttribute('aria-label', 'В '+side+': '+t.title); b.onclick = () => load(side, t.key); row.appendChild(b); });
  };
  const listElement = $('djList'), canvas = document.createElement('div'); canvas.className = 'dj-list-canvas'; listElement.appendChild(canvas);
  let items = [];
  function renderRows() {
    const first = Math.max(0, Math.floor(listElement.scrollTop / 52) - 3), last = Math.min(items.length, first + 20);
    const existing = new Map(Array.from(canvas.children).map(el => [el.dataset.key, el]));
    const visible = new Set(items.slice(first, last).map(t => t.key));
    existing.forEach((el, key) => { if (!visible.has(key)) el.remove(); });
    for (let i = first; i < last; i++) { const t = items[i]; let row = existing.get(t.key);
      if (!row) { row = document.createElement('div'); row.dataset.key = t.key; renderRow(row, t); canvas.appendChild(row); }
      row.style.top = i*52+'px';
    }
  }
  listElement.addEventListener('scroll', renderRows, { passive: true });
  function library() {
    const q = $('djSearch').value.toLocaleLowerCase();
    const all = player.files(); const filtered = all.filter(t => (t.title+' '+t.artist).toLocaleLowerCase().includes(q));
    items = filtered; canvas.style.height = items.length*52+'px'; renderRows(); $('djCount').textContent = filtered.length+' / '+all.length;
  }
  function load(side, key) {
    const s = engine.state[side];
    if (!s.paused && !window.confirm('Заменить играющий трек в деке '+side+'?')) return;
    const list = player.files(), index = list.findIndex(t => t.key === key); if (index < 0) return;
    engine.load(side, list, index); $('djRate'+side).value = 0;
    $('djMessage').textContent = 'Дека '+side+': загружен «'+list[index].title+'». Нажмите «Играть».';
  }
  $('djToggle').onclick = () => {
    player.pauseForDJ(); document.body.classList.add('dj-open'); root.hidden = false; library(); render(); window.dispatchEvent(new Event('resize'));
  };
  $('djClose').onclick = () => { engine.pause('A'); engine.pause('B'); root.hidden = true; document.body.classList.remove('dj-open'); window.dispatchEvent(new Event('resize')); };
  $('djAdd').onclick = () => player.openFiles(); $('djSearch').oninput = () => { listElement.scrollTop = 0; library(); };
  $('djCross').oninput = e => engine.setCross(e.target.value/100);
  $('djCenter').onclick = () => { $('djCross').value = 0; engine.setCross(0); };
  $('djMaster').oninput = e => engine.setMaster(e.target.value/100);
  $('djPauseAll').onclick = () => { engine.pause('A'); engine.pause('B'); };
  root.addEventListener('input', e => {
    const d = e.target.dataset, v = +e.target.value;
    if (d.rate) engine.setRate(d.rate, 1+v/100);
    if (d.gain) engine.setGain(d.gain, v/100);
    if (d.eq) engine.setEQ(d.eq, +d.band, v);
    if (d.bpm) engine.setBPM(d.bpm, v);
  });
  root.addEventListener('change', e => { const side = e.target.dataset.seek; if (side) engine.seek(side, e.target.value/1000*engine.state[side].duration); });
  root.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return; const d = b.dataset;
    if (d.play) engine.toggle(d.play);
    if (d.cue) engine.cue(d.cue);
    if (d.reset) { engine.setRate(d.reset, 1); $('djRate'+d.reset).value = 0; }
    if (d.tap) engine.tap(d.tap);
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
    disc.addEventListener('wheel', e => { e.preventDefault(); engine.seek(side, engine.state[side].time + Math.sign(e.deltaY)); }, { passive: false });
    disc.addEventListener('keydown', e => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); engine.seek(side, engine.state[side].time + (e.key === 'ArrowLeft' ? -1 : 1)); } });
  });
  window.addEventListener('blur', () => { engine.nudge('A', 0); engine.nudge('B', 0); });
  window.addEventListener('deka:files', library);
  window.addEventListener('deka:remove-file', e => {
    ['A','B'].forEach(side => { if (engine.state[side].track && engine.state[side].track.key === e.detail) engine.clear(side); });
    library();
  });
  window.addEventListener('beforeunload', () => engine.destroy());
  setInterval(() => {
    if (root.hidden) return;
    const levels = engine.meters();
    ['A','B','master'].forEach(side => { const el = $('djMeter'+(side === 'master' ? 'Master' : side)); el.value = levels[side] ? levels[side].peak : 0; });
    const peak = levels.master && levels.master.peak;
    $('djPeak').textContent = peak > 0.00001 ? (20*Math.log10(peak)).toFixed(1)+' dBFS' : '−∞ dBFS';
  }, 70);
  render();
})();
