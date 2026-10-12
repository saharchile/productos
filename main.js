/* =========================================================
   Sahar - main.js (v5 con SAM2)
   - Segmentación con SAM2 vía WebGPU
   - Recoloreado basado en máscara de IA
   - Fallback a reglas de color si SAM no está listo
   ========================================================= */

(() => {
  'use strict';

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* -------------------- Elementos ----------------------- */
  const canvas         = document.getElementById('bag-canvas');
  if (!canvas) return;

  const ctx            = canvas.getContext('2d', { willReadFrequently: true });
  const overlay        = document.getElementById('sam-overlay');
  const overlayCtx     = overlay.getContext('2d');
  const pointsCanvas   = document.getElementById('sam-points');
  const pointsCtx      = pointsCanvas.getContext('2d');
  const canvasWrapper  = document.getElementById('canvas-wrapper');
  const samStatus      = document.getElementById('sam-status');

  const modelSelect      = document.getElementById('model-select');
  const colorPicker      = document.getElementById('color-picker');
  const colorPicker2     = document.getElementById('color-picker-2');
  const colorHex         = document.getElementById('color-hex');
  const colorHex2        = document.getElementById('color-hex-2');
  const colorLabel1      = document.getElementById('color-label-1');
  const secondColorGroup = document.getElementById('second-color-group');
  const priceDisplay     = document.getElementById('selected-price');
  const btnQuote         = document.getElementById('btn-quote');

  const TELEFONO = "56927572626";

  /* -------------------- Estado -------------------------- */
  let originalImageData = null;
  let samWorker         = null;
  let samReady          = false;
  let currentMask       = null;   // { data: Float32Array, width, height }
  let currentModel      = null;
  let currentPoints     = [];     // puntos de clic (normalizados 0-1)
  let currentImageBitmap= null;

  /* -------------------- Conversión de color ------------- */
  function hexToRgb(hex) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    return [
      parseInt(hex.substr(0, 2), 16),
      parseInt(hex.substr(2, 2), 16),
      parseInt(hex.substr(4, 2), 16)
    ];
  }

  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [h, s, l];
  }

  function hslToRgb(h, s, l) {
    let r, g, b;
    if (s === 0) { r = g = b = l; }
    else {
      const hue2rgb = (p, q, t) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };
      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
  }

  /* -------------------- SAM Worker ---------------------- */
  function initSAM() {
    samWorker = new Worker('sam-worker.js');

    samWorker.onmessage = (event) => {
      const { type, stage, mask, message } = event.data;

      if (type === 'progress') {
        if (stage === 'downloading') {
          showStatus('Cargando modelo de IA...');
        } else if (stage === 'loading') {
          showStatus('Preparando segmentación...');
        }
      }

      if (type === 'ready') {
        samReady = true;
        hideStatus();
        // Si ya hay una imagen cargada, segmentar
        if (currentImageBitmap) {
          requestSegmentation(currentImageBitmap);
        }
      }

      if (type === 'mask') {
        currentMask = mask;
        applyColor(); // Reaplicar color con la máscara
      }

      if (type === 'error') {
        console.error('SAM error:', message);
        showStatus('Error en IA, usando método alternativo');
        setTimeout(hideStatus, 3000);
      }
    };

    samWorker.postMessage({ type: 'init' });
  }

  function requestSegmentation(imageBitmap) {
    if (!samWorker || !samReady) return;

    // Usar el centro de la imagen como punto inicial
    // o el primer punto clicado por el usuario
    const point = currentPoints.length > 0
      ? currentPoints[0]
      : { x: 0.5, y: 0.5 };

    // Convertir ImageBitmap a ImageData para el worker
    const offCanvas = new OffscreenCanvas(imageBitmap.width, imageBitmap.height);
    const offCtx = offCanvas.getContext('2d');
    offCtx.drawImage(imageBitmap, 0, 0);
    const imageData = offCtx.getImageData(0, 0, imageBitmap.width, imageBitmap.height);

    samWorker.postMessage({
      type: 'segment',
      payload: {
        imageData: {
          data: imageData.data.buffer,
          width: imageBitmap.width,
          height: imageBitmap.height
        },
        point
      }
    });
  }

  /* -------------------- Interacción con el canvas ------- */
  function setupCanvasInteraction() {
    overlay.addEventListener('click', (e) => {
      if (!samReady) {
        showStatus('Esperando que la IA esté lista...');
        return;
      }

      const rect = overlay.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;   // normalizado 0-1
      const y = (e.clientY - rect.top) / rect.height;

      currentPoints.push({ x, y });

      // Dibujar punto visual
      drawPoints();

      // Re-segmentar con el nuevo punto
      if (currentImageBitmap) {
        requestSegmentation(currentImageBitmap);
      }
    });
  }

  function drawPoints() {
    pointsCtx.clearRect(0, 0, pointsCanvas.width, pointsCanvas.height);
    currentPoints.forEach((p, i) => {
      const x = p.x * pointsCanvas.width;
      const y = p.y * pointsCanvas.height;
      pointsCtx.beginPath();
      pointsCtx.arc(x, y, 6, 0, Math.PI * 2);
      pointsCtx.fillStyle = i === 0 ? '#FF4444' : '#44FF44';
      pointsCtx.fill();
      pointsCtx.strokeStyle = 'white';
      pointsCtx.lineWidth = 2;
      pointsCtx.stroke();
    });
  }

  function clearPoints() {
    currentPoints = [];
    pointsCtx.clearRect(0, 0, pointsCanvas.width, pointsCanvas.height);
  }

  /* -------------------- Status UI ----------------------- */
  function showStatus(text) {
    samStatus.textContent = text;
    samStatus.classList.add('visible');
  }

  function hideStatus() {
    samStatus.classList.remove('visible');
  }

  /* ---------- Preservación heurística (fallback) -------- */
  function shouldPreservePixel(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 510;
    const s = max === 0 ? 0 : d / max;

    if (l < 0.09) return true;
    if (l > 0.90 && s < 0.10) return true;

    let h = 0;
    if (d !== 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }

    if (h >= 25 && h <= 65 && s > 0.50 && (r - b) > 70 && l > 0.35) return true;
    if (s < 0.06 && l > 0.55 && Math.abs(r - b) < 12) return true;

    return false;
  }

  /* ------------------ Cargar imagen ---------------------- */
  function loadBagImage(src) {
    canvas.classList.add('loading');
    clearPoints();
    currentMask = null;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const MAX = 500;
      const scale = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight, 1);
      canvas.width  = Math.round(img.naturalWidth  * scale);
      canvas.height = Math.round(img.naturalHeight * scale);

      // Sincronizar overlays con el canvas
      overlay.width = canvas.width;
      overlay.height = canvas.height;
      pointsCanvas.width = canvas.width;
      pointsCanvas.height = canvas.height;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      try {
        originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        applyColor();

        // Generar ImageBitmap para SAM
        createImageBitmap(img).then((bitmap) => {
          currentImageBitmap = bitmap;
          if (samReady) {
            requestSegmentation(bitmap);
          } else {
            showStatus('La IA está cargando, espera un momento...');
          }
        });
      } catch (e) {
        console.error('Error leyendo la imagen:', e);
      }
      canvas.classList.remove('loading');
    };
    img.onerror = () => {
      console.error('No se pudo cargar la imagen:', src);
      canvas.classList.remove('loading');
    };
    img.src = src;
  }

  /* ------------------ Recolorear píxeles ----------------- */
  function applyColor() {
    if (!originalImageData) return;

    const isLumina = currentModel === 'Lumina';

    const [Ar, Ag, Ab] = hexToRgb(colorPicker.value);
    const [AH, AS, AL] = rgbToHsl(Ar, Ag, Ab);
    const isAchromatic = AS < 0.06;

    let BH = AH, BS = AS, BL = AL;
    if (isLumina && colorPicker2) {
      const [Br, Bg, Bb] = hexToRgb(colorPicker2.value);
      [BH, BS, BL] = rgbToHsl(Br, Bg, Bb);
    }

    const src = originalImageData.data;
    const out = new Uint8ClampedArray(src.length);
    const w = canvas.width, h = canvas.height;

    // Calcular luminancia promedio para fallback
    let sumL = 0, cntL = 0;
    if (!currentMask) {
      for (let i = 0; i < src.length; i += 4) {
        const l = (Math.max(src[i], src[i+1], src[i+2]) + Math.min(src[i], src[i+1], src[i+2])) / 510;
        sumL += l; cntL++;
      }
    }
    const avgL = cntL > 0 ? sumL / cntL : 0.5;

    for (let i = 0; i < src.length; i += 4) {
      const idx = i / 4;
      const x = idx % w;
      const y = Math.floor(idx / w);
      const r = src[i], g = src[i + 1], b = src[i + 2], a = src[i + 3];

      // Decidir si pintar
      let shouldPaint = false;

      if (currentMask) {
        // Usar máscara de SAM2
        const mx = Math.floor((x / w) * currentMask.width);
        const my = Math.floor((y / h) * currentMask.height);
        const maskValue = currentMask.data[my * currentMask.width + mx];
        shouldPaint = maskValue > 0.5;
      } else {
        // Fallback: reglas heurísticas
        shouldPaint = !shouldPreservePixel(r, g, b);
      }

      if (!shouldPaint) {
        out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
        continue;
      }

      // Color objetivo
      let targetH = AH, targetS = AS, targetL = AL, achrom = isAchromatic;
      if (isLumina) {
        const l0 = (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
        if (l0 < 0.4) { // Zona inferior (borgoña)
          targetH = BH; targetS = BS; targetL = BL;
        }
      }

      // Luminancia y recoloreado
      const [h0, s0, l0] = rgbToHsl(r, g, b);
      const deltaL = (l0 - avgL) * 0.85;
      const newL = Math.max(0.05, Math.min(0.95, targetL + deltaL));

      if (achrom) {
        const v = Math.round(newL * 255);
        out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = a;
      } else {
        const newS = Math.min(1, targetS * 0.85 + s0 * 0.15);
        const [nr, ng, nb] = hslToRgb(targetH, newS, newL);
        out[i] = nr; out[i + 1] = ng; out[i + 2] = nb; out[i + 3] = a;
      }
    }

    ctx.putImageData(new ImageData(out, w, h), 0, 0);
    updateCanvasLabel();
  }

  /* -------- Accesibilidad -------------------------------- */
  function updateCanvasLabel() {
    const opt = modelSelect.options[modelSelect.selectedIndex];
    const color = colorPicker.value.toUpperCase();
    canvas.setAttribute('aria-label', `Vista previa del modelo ${opt.text} en color ${color}`);
  }

  function updateSecondColorVisibility() {
    const isLumina = currentModel === 'Lumina';
    if (secondColorGroup) secondColorGroup.hidden = !isLumina;
    if (colorLabel1) {
      colorLabel1.textContent = isLumina
        ? '2. Color principal (parte superior):'
        : '2. Elige tu color favorito:';
    }
  }

  /* -------------------- Eventos -------------------------- */
  modelSelect.addEventListener('change', () => {
    const opt = modelSelect.options[modelSelect.selectedIndex];
    currentModel = opt.value;
    const price = parseInt(opt.getAttribute('data-price')).toLocaleString('es-CL');
    priceDisplay.textContent = `Precio base: $${price}`;
    updateSecondColorVisibility();
    loadBagImage(opt.getAttribute('data-img'));
  });

  colorPicker.addEventListener('input', () => {
    colorHex.textContent = colorPicker.value.toUpperCase();
    applyColor();
  });

  if (colorPicker2) {
    colorPicker2.addEventListener('input', () => {
      colorHex2.textContent = colorPicker2.value.toUpperCase();
      applyColor();
    });
  }

  document.querySelectorAll('.primary-presets .color-preset').forEach(el => {
    el.addEventListener('click', () => {
      const c = el.getAttribute('data-color');
      colorPicker.value = c;
      colorHex.textContent = c.toUpperCase();
      applyColor();
    });
  });

  document.querySelectorAll('.secondary-presets .color-preset').forEach(el => {
    el.addEventListener('click', () => {
      const c = el.getAttribute('data-color');
      if (colorPicker2) {
        colorPicker2.value = c;
        colorHex2.textContent = c.toUpperCase();
        applyColor();
      }
    });
  });

  btnQuote.addEventListener('click', () => {
    const modelo = modelSelect.value;
    const opt = modelSelect.options[modelSelect.selectedIndex];
    const price = parseInt(opt.getAttribute('data-price')).toLocaleString('es-CL');
    let color = colorHex.textContent;
    if (modelo === 'Lumina' && colorHex2) {
      color += ` + ${colorHex2.textContent}`;
    }
    const mensaje = `Hola Sahar! 👋 Me encantaría cotizar una cartera personalizada.%0A%0A📌 *Modelo:* ${modelo}%0A🎨 *Color elegido:* ${color}%0A💰 *Precio base:* $${price}%0A%0A¿Me pueden ayudar con el valor final y tiempo de confección?`;
    window.open(`https://wa.me/${TELEFONO}?text=${mensaje}`, '_blank', 'noopener,noreferrer');
  });

  /* -------------------- Init ----------------------------- */
  const firstOpt = modelSelect.options[0];
  currentModel = firstOpt.value;
  priceDisplay.textContent = `Precio base: $${parseInt(firstOpt.getAttribute('data-price')).toLocaleString('es-CL')}`;
  updateSecondColorVisibility();

  // Inicializar interacción y SAM
  setupCanvasInteraction();
  initSAM();
  loadBagImage(firstOpt.getAttribute('data-img'));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
