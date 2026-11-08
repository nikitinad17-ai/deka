/* DEKA_CONSOLE_CONTROLS_021: input values remain the single bridge to the audio engine. */
(function () {
  'use strict';
  const entries = new WeakMap(), roots = new WeakMap();
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function upgrade(input, role) {
    if (entries.has(input)) return entries.get(input);
    const box = document.createElement('div'); box.className = 'dc-control'; box.dataset.role = role;
    const surface = document.createElement('div'); surface.className = 'dc-surface'; surface.tabIndex = 0;
    surface.setAttribute('role', 'slider'); surface.setAttribute('aria-label', input.getAttribute('aria-label') || role);
    surface.innerHTML = '<span class="dc-scale" aria-hidden="true"></span><span class="dc-track" aria-hidden="true"></span><span class="dc-cap" aria-hidden="true"><i></i></span>';
    const value = document.createElement('output'); value.className = 'dc-value'; value.setAttribute('aria-hidden', 'true');
    const less = document.createElement('button'), more = document.createElement('button');
    for (const [button, direction] of [[less, -1], [more, 1]]) {
      button.type = 'button'; button.className = 'dc-step'; button.textContent = direction < 0 ? '−' : '+';
      button.setAttribute('aria-label', (direction < 0 ? 'Уменьшить ' : 'Увеличить ') + surface.getAttribute('aria-label'));
      button.onclick = e => { e.preventDefault(); e.stopPropagation(); set(+input.value + direction * step(), true); };
    }
    input.before(box); box.append(input, less, surface, more, value);
    input.classList.add('dc-source'); input.tabIndex = -1; input.setAttribute('aria-hidden', 'true');
    box.dataset.control = input.id || [role, input.dataset.eq || input.dataset.gain || input.dataset.effectAmount || input.dataset.fxamount, input.dataset.band || input.dataset.name].filter(Boolean).join('-');
    const min = () => +input.min || 0, max = () => +input.max || 100;
    const step = () => Math.max(.0001, +input.step || 1);
    const reset = role === 'master' ? 80 : role === 'gain' ? 100 : role === 'fx' ? 35 : 0;
    let kind = '', pointer = null, origin = null, angle = 0, accumulator = 0;
    function set(v, complete) {
      if (input.disabled || !Number.isFinite(v)) return;
      const next = +clamp(min() + Math.round((v - min()) / step()) * step(), min(), max()).toFixed(4);
      if (+input.value !== next) { input.value = next; input.dispatchEvent(new Event('input', { bubbles: true })); }
      if (complete) input.dispatchEvent(new Event('change', { bubbles: true }));
      sync();
    }
    function sync() {
      const n = +input.value, ratio = (n - min()) / (max() - min());
      box.style.setProperty('--dc-value', ratio); box.style.setProperty('--dc-angle', (-135 + ratio * 270) + 'deg');
      box.style.setProperty('--dc-position', (ratio * 100) + '%');
      box.classList.toggle('dc-disabled', input.disabled);
      surface.setAttribute('aria-disabled', String(input.disabled)); surface.tabIndex = input.disabled ? -1 : 0;
      const unit = role === 'eq' ? ' dB' : role === 'cross' ? '' : '%';
      const text = role === 'cross' ? n === 0 ? 'A · B' : n < 0 ? 'A ' + Math.abs(n).toFixed(0) : 'B ' + n.toFixed(0) : (n > 0 && (role === 'eq' || role === 'tempo') ? '+' : '') + n.toFixed(step() < 1 ? 1 : 0) + unit;
      value.textContent = text;
      surface.setAttribute('aria-valuemin', input.min); surface.setAttribute('aria-valuemax', input.max);
      surface.setAttribute('aria-valuenow', String(n)); surface.setAttribute('aria-valuetext', text);
      less.disabled = more.disabled = input.disabled;
    }
    function point(e) { const r = surface.getBoundingClientRect(); return { r, x: e.clientX - r.left - r.width / 2, y: e.clientY - r.top - r.height / 2 }; }
    function absolute(e) {
      const r = surface.getBoundingClientRect(), vertical = kind === 'vertical';
      const fraction = vertical ? 1 - (e.clientY - r.top - 14) / Math.max(1, r.height - 28) : (e.clientX - r.left - 14) / Math.max(1, r.width - 28);
      set(min() + clamp(fraction, 0, 1) * (max() - min()), false);
    }
    function finish(commit = true) {
      if (pointer === null) return;
      const id = pointer; pointer = null; origin = null; box.classList.remove('dc-dragging');
      if (surface.hasPointerCapture(id)) surface.releasePointerCapture(id);
      if (commit) input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    surface.addEventListener('pointerdown', e => {
      if (input.disabled || pointer !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault(); e.stopPropagation(); surface.focus({ preventScroll: true });
      pointer = e.pointerId; surface.setPointerCapture(pointer); box.classList.add('dc-dragging');
      origin = { x: e.clientX, y: e.clientY, value: +input.value };
      const p = point(e); angle = Math.atan2(p.y, p.x); accumulator = +input.value;
      if (kind === 'vertical' || kind === 'horizontal' || kind === 'strip') absolute(e);
    });
    surface.addEventListener('pointermove', e => {
      if (e.pointerId !== pointer) return;
      e.preventDefault();
      if (kind === 'rotary') {
        const p = point(e); if (Math.hypot(p.x, p.y) < 9) return;
        const next = Math.atan2(p.y, p.x); let delta = next - angle;
        if (delta > Math.PI) delta -= 2 * Math.PI; if (delta < -Math.PI) delta += 2 * Math.PI;
        angle = next; accumulator = clamp(accumulator + delta / (1.5 * Math.PI) * (max() - min()), min(), max()); set(accumulator, false);
      } else if (kind === 'encoder') {
        set(origin.value + (origin.y - e.clientY) / (e.shiftKey ? 900 : 180) * (max() - min()), false);
      } else absolute(e);
    });
    surface.addEventListener('pointerup', e => { if (e.pointerId === pointer) finish(); });
    surface.addEventListener('pointercancel', e => { if (e.pointerId === pointer) finish(); });
    surface.addEventListener('lostpointercapture', e => { if (e.pointerId === pointer) finish(); });
    surface.addEventListener('dblclick', e => { e.preventDefault(); set(reset, true); });
    surface.addEventListener('keydown', e => {
      let next = +input.value;
      if (['ArrowUp', 'ArrowRight', '+', '='].includes(e.key)) next += step();
      else if (['ArrowDown', 'ArrowLeft', '-'].includes(e.key)) next -= step();
      else if (e.key === 'PageUp') next += step() * 10;
      else if (e.key === 'PageDown') next -= step() * 10;
      else if (e.key === 'Home') next = min();
      else if (e.key === 'End') next = max();
      else if (e.key === '0') next = reset;
      else return;
      e.preventDefault(); e.stopPropagation(); set(next, true);
    });
    surface.addEventListener('wheel', e => {
      if (surface.getRootNode().activeElement !== surface || input.disabled) return;
      e.preventDefault(); set(+input.value + (e.deltaY < 0 ? 1 : -1) * step(), true);
    }, { passive: false });
    input.addEventListener('input', sync); input.addEventListener('change', sync);
    const api = { input, box, sync, finish, configure(theme) {
      finish();
      kind = role === 'cross' ? 'horizontal' : role === 'tempo' ? theme === 'aurora' ? 'vertical' : 'horizontal' : role === 'gain' ? 'vertical' : theme === 'aurora' ? 'rotary' : theme === 'acid' ? role === 'fx' ? 'strip' : 'vertical' : role === 'fx' ? 'strip' : 'encoder';
      box.dataset.kind = kind; box.dataset.controlTheme = theme;
      surface.setAttribute('aria-orientation', kind === 'vertical' || kind === 'encoder' ? 'vertical' : 'horizontal');
      surface.title = kind === 'rotary' ? 'Вращайте по кругу · двойной щелчок — сброс' : kind === 'encoder' ? 'Тяните вверх / вниз · Shift — точнее · двойной щелчок — сброс' : 'Перемещайте фейдер · двойной щелчок — сброс';
      sync();
    } };
    entries.set(input, api); return api;
  }
  window.DekaConsoleControls = {
    mount(root, platform) {
      if (roots.has(root)) return;
      const all = [];
      for (const input of root.querySelectorAll('input[type=range]')) {
        const d = input.dataset;
        const role = d.eq ? 'eq' : d.rate ? 'tempo' : d.gain ? 'gain' : d.effectAmount || d.fxamount ? 'fx' : /^(djMaster|master)$/.test(input.id) ? 'master' : /^(djCross|cross)$/.test(input.id) ? 'cross' : null;
        if (role) all.push(upgrade(input, role));
      }
      roots.set(root, all);
      window.addEventListener('blur', () => all.forEach(c => c.finish()));
      window.addEventListener('orientationchange', () => all.forEach(c => c.finish()));
    },
    theme(root, theme) { (roots.get(root) || []).forEach(c => c.configure(theme)); },
    sync(root) { (roots.get(root) || []).forEach(c => c.sync()); },
    cancel(root) { (roots.get(root) || []).forEach(c => c.finish()); }
  };
})();
