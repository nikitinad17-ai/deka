/* Explorer File/Directory entries and internal library drags share one import path. */
(function () {
  'use strict';
  const audio = file => file.type.startsWith('audio/') || /\.(mp3|flac|ogg|oga|wav|m4a|aac|opus|webm)$/i.test(file.name);
  async function readEntry(entry, result) {
    if (result.length >= 5000) throw new Error('Добавляйте не больше 5000 файлов за один раз.');
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      if (audio(file)) result.push(file);
    } else if (entry.isDirectory) {
      const reader = entry.createReader(); let batch;
      do {
        batch = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
        for (const child of batch) await readEntry(child, result);
      } while (batch.length);
    }
  }
  window.DekaFileDrop = {
    attach(element, onFiles, onError) {
      element.addEventListener('dragover', event => {
        if (!Array.from(event.dataTransfer.types).includes('Files')) return;
        event.preventDefault(); event.stopPropagation(); event.dataTransfer.dropEffect = 'copy'; element.classList.add('file-over');
      });
      element.addEventListener('dragleave', event => { if (!element.contains(event.relatedTarget)) element.classList.remove('file-over'); });
      element.addEventListener('drop', async event => {
        const dt = event.dataTransfer;
        if (!Array.from(dt.types).includes('Files')) return;
        event.preventDefault(); event.stopPropagation(); element.classList.remove('file-over');
        // Capture handles before returning to the event loop: DataTransfer becomes protected.
        const entries = Array.from(dt.items || []).map(item => item.webkitGetAsEntry?.()).filter(Boolean);
        const files = Array.from(dt.files || []);
        try {
          const collected = [];
          if (entries.length) for (const entry of entries) await readEntry(entry, collected);
          else collected.push(...files.filter(audio));
          if (!collected.length) throw new Error('В выбранном нет поддерживаемых аудиофайлов.');
          await onFiles(collected);
        } catch (error) { if (onError) onError(error.message || 'Не удалось прочитать файлы.'); }
      });
    }
  };
  // Never let a dropped file navigate the WebView away from the player.
  ['dragover', 'drop'].forEach(name => window.addEventListener(name, event => {
    if (Array.from(event.dataTransfer?.types || []).includes('Files')) event.preventDefault();
  }));
})();
