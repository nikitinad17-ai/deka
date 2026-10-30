/* Decode only a selected platter's local file, on first touch. Two bounded caches. */
(function () {
  'use strict';
  const modules = new WeakMap();
  const MAX_PCM = 256 * 1024 * 1024;
  window.DekaVinyl = {
    async prepare(context, track, destination, signal) {
      if (!context.audioWorklet) throw new Error('Скретч недоступен: обновите WebView2.');
      if (track.duration * context.sampleRate * 2 * 4 > MAX_PCM || track.size > 100 * 1024 * 1024)
        throw new Error('Для скретча выберите более короткий файл (до 256 МБ PCM на деку).');
      if (!modules.has(context)) modules.set(context, context.audioWorklet.addModule(new URL('vinyl-processor.js', document.baseURI).href));
      await modules.get(context);
      const response = await fetch(track.url, {signal});
      if (!response.ok) throw new Error('Файл для скретча недоступен.');
      const encoded = await response.arrayBuffer();
      if (encoded.byteLength > 100 * 1024 * 1024) throw new Error('Файл слишком большой для скретча.');
      const buffer = await context.decodeAudioData(encoded);
      if (signal.aborted) throw new DOMException('Cancelled', 'AbortError');
      if (buffer.length * buffer.numberOfChannels * 4 > MAX_PCM) throw new Error('Файл слишком большой для скретча.');
      const channels = Array.from({length:Math.min(2, buffer.numberOfChannels)}, (_, i) => buffer.getChannelData(i).slice());
      const node = new AudioWorkletNode(context, 'deka-vinyl', {numberOfInputs:0, numberOfOutputs:1, outputChannelCount:[channels.length]});
      node.port.postMessage({type:'buffer', channels}, channels.map(c => c.buffer));
      node.connect(destination);
      const send = (type, time) => node.port.postMessage({type, position:time * context.sampleRate});
      return { grab: time => send('grab', time), move: time => send('move', time), release: () => send('release'),
        dispose() { send('dispose'); node.disconnect(); node.port.close(); } };
    }
  };
})();
