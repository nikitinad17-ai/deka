/* A full logical list, with only the visible rows in DOM. Stable scroll and input focus. */
(function () {
  'use strict';
  window.DekaVirtualList = function (element, onSelect) {
    var data = [], selected = '', rowHeight = 48, frame = null;
    var canvas = document.createElement('div'); canvas.className = 'vlcanvas';
    element.classList.add('vlviewport'); element.setAttribute('role', 'listbox'); element.appendChild(canvas);
    function render() {
      frame = null;
      var first = Math.max(0, Math.floor(element.scrollTop / rowHeight) - 4);
      var last = Math.min(data.length, first + Math.ceil((element.clientHeight || 400) / rowHeight) + 9);
      canvas.style.height = data.length * rowHeight + 'px';
      var existing = new Map(Array.from(canvas.children).map(function (n) { return [n.dataset.index, n]; }));
      existing.forEach(function (n, key) { if (+key < first || +key >= last) n.remove(); });
      for (var i = first; i < last; i++) {
        var t = data[i], button = existing.get(String(i));
        if (!button || button.dataset.key !== t.key) {
          if (button) button.remove();
          button = document.createElement('button'); button.className = 'vlrow'; button.type = 'button';
          button.dataset.index = String(i); button.dataset.key = t.key;
          button.setAttribute('role', 'option');
          var num = document.createElement('span'), meta = document.createElement('span');
          num.className = 'number'; meta.className = 'trackmeta';
          meta.appendChild(document.createElement('b')); meta.appendChild(document.createElement('small'));
          button.appendChild(num); button.appendChild(meta); canvas.appendChild(button);
        }
        button.style.top = i * rowHeight + 'px';
        button.children[0].textContent = String(i + 1);
        button.children[1].children[0].textContent = t.title;
        button.children[1].children[1].textContent = t.artist || (t.kind === 'file' ? 'Файл на устройстве' : 'VK');
        button.classList.toggle('selected', selected === t.key);
        button.setAttribute('aria-selected', selected === t.key ? 'true' : 'false');
        button.setAttribute('aria-setsize', String(data.length)); button.setAttribute('aria-posinset', String(i + 1));
        button.title = (t.artist ? t.artist + ' — ' : '') + t.title;
      }
    }
    function schedule() { if (frame === null) frame = requestAnimationFrame(render); }
    element.addEventListener('scroll', schedule, { passive: true });
    canvas.addEventListener('click', function (e) {
      var button = e.target.closest('button[data-index]');
      if (button && data[+button.dataset.index]) onSelect(data, +button.dataset.index);
    });
    canvas.addEventListener('keydown', function (e) {
      if (!['ArrowDown','ArrowUp','Home','End'].includes(e.key)) return;
      var b = e.target.closest('[data-index]'); if (!b) return;
      var next = e.key === 'Home' ? 0 : e.key === 'End' ? data.length - 1 : +b.dataset.index + (e.key === 'ArrowDown' ? 1 : -1);
      next = Math.max(0, Math.min(data.length - 1, next)); e.preventDefault();
      element.scrollTop = next * rowHeight; render();
      var target = canvas.querySelector('[data-index="' + next + '"]'); if (target) target.focus({ preventScroll: true });
    });
    var observer = new ResizeObserver(schedule); observer.observe(element);
    return {
      set: function (items, reset) {
        var index = Math.floor(element.scrollTop / rowHeight), anchor = data[index] && data[index].key, offset = element.scrollTop % rowHeight;
        data = items.slice(); canvas.style.height = data.length * rowHeight + 'px';
        if (reset) element.scrollTop = 0;
        else if (anchor) { var pos = data.findIndex(function (t) { return t.key === anchor; }); if (pos >= 0) element.scrollTop = pos * rowHeight + offset; }
        render();
      },
      current: function (key) { selected = key || ''; render(); },
      jump: function (key) { var i = data.findIndex(function (t) { return t.key === key; }); if (i < 0) return false; element.scrollTop = Math.max(0, i * rowHeight - element.clientHeight / 2); render(); return true; },
      render: render, count: function () { return data.length; }, destroy: function () { observer.disconnect(); if (frame !== null) cancelAnimationFrame(frame); }
    };
  };
})();
