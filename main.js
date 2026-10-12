/* =========================================================
   Sahar - main.js
   Preservación mejorada de metales (oro, rose gold, bronce,
   cobre, plata) y perlas. Detección de zonas para Lumina.
   ========================================================= */

(() => {
  'use strict';

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* -------------------- Elementos ----------------------- */
  const canvas = document.getElementById('bag-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const modelSelect = document.getElementById('model-select');
  const colorPicker = document.getElementById('color-picker');
  const colorPicker2 = document.getElementById('color-picker-2');
  const colorHex = document.getElementById('color-hex');
  const colorHex2 = document.getElementById('color-hex-2');
  const colorLabel1 = document.getElementById('color-label-1');
  const secondColorGroup = document.getElementById('second-color-group');
  const priceDisplay = document.getElementById('selected-price');
  const btnQuote = document.getElementById('btn-quote');

  const TELEFONO = "56927572626";

  let originalImageData = null;
  let backgroundMask = null;

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

  /* -------- Preservación de metales y perlas ------------ */
  function shouldPreservePixel(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    const l = (max + min) / 510;       // 0..1
    const s = max === 0 ? 0 : d / max; // saturación HSV

    // Hue
    let h = 0;
    if (d !== 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }

    // 1) Muy oscuro: herrajes negros, sombras profundas, textos
    if (l < 0.15) return true;

    // 2) Escala de grises: plata, cromo, acero, perlas blancas
    if (s < 0.10 && l > 0.25) return true;

    // 3) Metales cálidos: oro, rose gold, bronce, cobre
    //    - Hue cálido (rojo-anaranjado-amarillo)
    //    - Dominancia R sobre B
    //    - Verde ≥ azul (cálidos puros) con saturación media,
    //      O saturación alta (rose gold)
    const isWarmHue = h >= 330 || h <= 95;
    if (isWarmHue && (r - b) > 30 && ((g >= b && s > 0.20) || s > 0.40)) {
      return true;
    }

    // 4) Perlas y blancos cálidos muy luminosos
    if (l > 0.88 && s < 0.15) return true;

    return false;
  }

  /* -------- Detección de zonas para Lumina --------------- */
  // Devuelve 1 = crema (superior), 2 = borgoña (inferior)
  function detectLuminaZone(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
      if (h < 0) h += 360;
    }
    // Borgoña: rojo oscuro, alta dominancia R-G
    if ((h >= 330 || h <= 20) && d > 30 && (r - g) > 30) return 2;
    // Crema: cálido amarillento
    if (h >= 20 && h <= 75) return 1;
    // Fallback por luminancia
    return (max + min) / 2 > 128 ? 1 : 2;
  }

  /* ---------- Flood fill para detectar el fondo ---------- */
  function floodFillBackground(startX, startY, tolerance) {
    const w = canvas.width, h = canvas.height;
    const data = originalImageData.data;
    const startIdx = (startY * w + startX) * 4;
    const sr = data[startIdx], sg = data[startIdx + 1], sb = data[startIdx + 2];

    const visited = new Uint8Array(w * h);
    const queue = [startY * w + startX];
    visited[startY * w + startX] = 1;

    let head = 0;
    while (head < queue.length) {
      const pos = queue[head++];
      backgroundMask[pos] = 1;

      const x = pos % w;
      const y = (pos - x) / w;
      const neighbors = [
        x > 0     ? pos - 1 : -1,
        x < w - 1 ? pos + 1 : -1,
        y > 0     ? pos - w : -1,
        y < h - 1 ? pos + w : -1
      ];

      for (const np of neighbors) {
        if (np < 0 || visited[np]) continue;
        const idx = np * 4;
        const dr = data[idx] - sr;
        const dg = data[idx + 1] - sg;
        const db = data[idx + 2] - sb;
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (dist < tolerance) {
          visited[np] = 1;
          queue.push(np);
        }
      }
    }
  }

  function detectBackground() {
    const w = canvas.width, h = canvas.height;
    const tol = 32;
    const corners = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
    corners.forEach(([x, y]) => {
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      if (backgroundMask[y * w + x]) return;
      floodFillBackground(x, y, tol);
    });
  }

  /* ------------------ Cargar imagen ---------------------- */
  function loadBagImage(src) {
    canvas.classList.add('loading');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const MAX = 500;
      const scale = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight, 1);
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      try {
        originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        backgroundMask = new Uint8Array(canvas.width * canvas.height);
        detectBackground();
        applyColor();
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
    if (!originalImageData || !backgroundMask) return;

    const isLumina = modelSelect.value === 'Lumina';

    const [Ar, Ag, Ab] = hexToRgb(colorPicker.value);
    const [AH, AS, AL] = rgbToHsl(Ar, Ag, Ab);

    let BH = AH, BS = AS, BL = AL;
    if (isLumina && colorPicker2) {
      const [Br, Bg, Bb] = hexToRgb(colorPicker2.value);
      [BH, BS, BL] = rgbToHsl(Br, Bg, Bb);
    }

    const src = originalImageData.data;
    const out = new Uint8ClampedArray(src.length);
    const w = canvas.width;

    for (let i = 0; i < src.length; i += 4) {
      const px = (i / 4) % w;
      const py = Math.floor((i / 4) / w);
      const r = src[i], g = src[i + 1], b = src[i + 2], a = src[i + 3];

      // Fondo → preservar
      if (backgroundMask[py * w + px]) {
        out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
        continue;
      }

      // Metales, perlas, negros → preservar
      if (shouldPreservePixel(r, g, b)) {
        out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
        continue;
      }

      // Determinar color objetivo según zona
      let targetH = AH, targetS = AS, targetL = AL;
      if (isLumina) {
        const zone = detectLuminaZone(r, g, b);
        if (zone === 2) {
          targetH = BH; targetS = BS; targetL = BL;
        }
      }

      // Recolorear conservando textura
      const [h, s, l] = rgbToHsl(r, g, b);
      const newS = Math.min(1, targetS * 0.85 + s * 0.15);
      const lShift = (targetL - 0.5) * 0.6;
      const newL = Math.max(0.05, Math.min(0.95, l + lShift));
      const [nr, ng, nb] = hslToRgb(targetH, newS, newL);
      out[i] = nr; out[i + 1] = ng; out[i + 2] = nb; out[i + 3] = a;
    }

    ctx.putImageData(new ImageData(out, w, canvas.height), 0, 0);
    updateCanvasLabel();
  }

  /* -------- Accesibilidad: label dinámico del canvas ----- */
  function updateCanvasLabel() {
    const modelo = modelSelect.options[modelSelect.selectedIndex].text;
    const color = colorPicker.value.toUpperCase();
    canvas.setAttribute('aria-label', `Vista previa del modelo ${modelo} en color ${color}`);
  }

  /* --------- Visibilidad del segundo color (Lumina) ------ */
  function updateSecondColorVisibility() {
    const isLumina = modelSelect.value === 'Lumina';
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

  document.querySelectorAll('.color-preset').forEach(el => {
    el.addEventListener('click', () => {
      const c = el.getAttribute('data-color');
      colorPicker.value = c;
      colorHex.textContent = c.toUpperCase();
      applyColor();
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
  priceDisplay.textContent = `Precio base: $${parseInt(firstOpt.getAttribute('data-price')).toLocaleString('es-CL')}`;
  updateSecondColorVisibility();
  loadBagImage(firstOpt.getAttribute('data-img'));

  /* -------------------- PWA ------------------------------ */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
