/* =========================================================
   sam-worker.js
   Worker que ejecuta SAM2 (Hiera Tiny) para segmentar el tejido
   de la cartera y devolver la máscara al hilo principal.
   ========================================================= */

let encoderSession = null;
let decoderSession = null;
let currentEmbedding = null;
let isReady = false;

const ENCODER_URL = 'https://huggingface.co/SharpAI/sam2-hiera-tiny-onnx/resolve/main/encoder.with_runtime_opt.ort';
const DECODER_URL = 'https://huggingface.co/SharpAI/sam2-hiera-tiny-onnx/resolve/main/decoder.onnx';

self.onmessage = async (event) => {
  const { type, payload } = event.data;

  if (type === 'init') {
    await initSAM();
    return;
  }

  if (type === 'segment') {
    if (!isReady) {
      self.postMessage({ type: 'error', message: 'SAM no está listo' });
      return;
    }
    await segmentImage(payload);
    return;
  }
};

async function initSAM() {
  try {
    // Importar ONNX Runtime Web con soporte WebGPU
    importScripts('https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/ort.webgpu.min.js');

    // Configurar rutas WASM
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/';

    self.postMessage({ type: 'progress', stage: 'downloading' });

    // Cargar encoder (optimizado para WebGPU)
    encoderSession = await ort.InferenceSession.create(ENCODER_URL, {
      executionProviders: ['webgpu', 'wasm'],
      graphOptimizationLevel: 'disabled'
    });

    self.postMessage({ type: 'progress', stage: 'loading' });

    // Cargar decoder
    decoderSession = await ort.InferenceSession.create(DECODER_URL, {
      executionProviders: ['webgpu', 'wasm']
    });

    isReady = true;
    self.postMessage({ type: 'ready' });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
}

async function segmentImage({ imageData, point }) {
  try {
    const { data, width, height } = imageData;

    // Preprocesar imagen: redimensionar a 1024x1024 y normalizar
    const preprocessed = preprocessImage(data, width, height);

    // Ejecutar encoder
    const encoderOutputs = await encoderSession.run({
      image: preprocessed
    });

    currentEmbedding = encoderOutputs;

    // Ejecutar decoder con el punto de clic
    const pointCoords = new ort.Tensor('float32', [point.x, point.y, 0, 0], [1, 2, 2]);
    const pointLabels = new ort.Tensor('float32', [1, -1], [1, 2]);
    const maskInput = new ort.Tensor('float32', new Float32Array(256 * 256).fill(0), [1, 1, 256, 256]);
    const hasMaskInput = new ort.Tensor('float32', [0], [1]);

    const decoderOutputs = await decoderSession.run({
      image_embed: encoderOutputs.image_embed,
      high_res_feats_0: encoderOutputs.high_res_feats_0,
      high_res_feats_1: encoderOutputs.high_res_feats_1,
      point_coords: pointCoords,
      point_labels: pointLabels,
      mask_input: maskInput,
      has_mask_input: hasMaskInput
    });

    // Obtener la máscara (shape: [1, num_masks, 256, 256])
    const masks = decoderOutputs.masks;
    const maskData = masks.data;

    // Tomar la primera máscara (la de mayor confianza)
    const maskSize = 256 * 256;
    const mask = new Float32Array(maskSize);
    for (let i = 0; i < maskSize; i++) {
      mask[i] = maskData[i];
    }

    self.postMessage({
      type: 'mask',
      mask: {
        data: mask,
        width: 256,
        height: 256
      }
    });
  } catch (error) {
    self.postMessage({ type: 'error', message: error.message });
  }
}

function preprocessImage(data, width, height) {
  // Redimensionar a 1024x1024
  const targetSize = 1024;
  const canvas = new OffscreenCanvas(targetSize, targetSize);
  const ctx = canvas.getContext('2d');

  // Crear ImageData temporal
  const tempCanvas = new OffscreenCanvas(width, height);
  const tempCtx = tempCanvas.getContext('2d');
  const imageData = new ImageData(new Uint8ClampedArray(data), width, height);
  tempCtx.putImageData(imageData, 0, 0);

  // Redimensionar
  ctx.drawImage(tempCanvas, 0, 0, width, height, 0, 0, targetSize, targetSize);

  // Obtener datos y normalizar
  const resized = ctx.getImageData(0, 0, targetSize, targetSize);
  const pixels = resized.data;

  // Normalizar a rango [-1, 1] (formato esperado por SAM)
  const normalized = new Float32Array(targetSize * targetSize * 3);
  for (let i = 0; i < targetSize * targetSize; i++) {
    normalized[i * 3] = (pixels[i * 4] / 255 - 0.5) / 0.5;
    normalized[i * 3 + 1] = (pixels[i * 4 + 1] / 255 - 0.5) / 0.5;
    normalized[i * 3 + 2] = (pixels[i * 4 + 2] / 255 - 0.5) / 0.5;
  }

  // Crear tensor con shape [1, 3, 1024, 1024]
  return new ort.Tensor('float32', normalized, [1, 3, targetSize, targetSize]);
}
