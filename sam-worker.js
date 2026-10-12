// sam-worker.js
import { SAMClient } from 'sam-web';

let sam = null;

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === 'init') {
    // Inicializar SAM con el modelo MobileSAM (45MB, rápido)
    // o 'sam2' (151MB, más preciso)
    sam = new SAMClient({
      model: 'mobilesam',
      onProgress: (stage) => self.postMessage({ type: 'progress', stage })
    });
    await sam.initialize(new URL('sam-web/worker', import.meta.url));
    self.postMessage({ type: 'ready' });
    return;
  }

  if (type === 'segment') {
    const { imageBitmap, point } = payload;
    await sam.setImage(imageBitmap);
    const mask = await sam.segment({
      points: [{ x: point.x, y: point.y, label: 1 }] // 1 = foreground
    });
    self.postMessage({
      type: 'mask',
      mask: {
        bitmap: mask.bitmap,
        data: mask.data,   // Float32Array con valores 0-1
        width: mask.shape[1],
        height: mask.shape[0]
      }
    });
    return;
  }
};
