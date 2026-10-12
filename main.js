/* =========================================================
   Sahar - main.js
   Lógica original del personalizador (flood fill + reglas
   de preservación de herrajes/logo/perlas). Solo se
   externalizó y se cambió onclick por addEventListener.
   ========================================================= */

(() => {
  'use strict';

  /* -------------------- Año dinámico (opcional) ---------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* -------------------- Personalizador ------------------- */
  const canvas = document.getElementById('bag-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const modelSelect = document.getElementById('model-select');
  const colorPicker = document.getElementById('color-picker');
  const colorHex = document.getElementById('color-hex');
  const priceDisplay = document.getElementById('selected-price');
  const btnQuote = document.getElementById('btn-quote');

  const TELEFONO = "56927572626";

  let originalImageData = null;
  let backgroundMask = null; // 1 = fondo protegido

  /* -------------------- Conversión de color -------------- */
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

  /* -------- Reglas de preservación automática ------------ */
  // Devuelve true si el píxel NO debe pintarse
  // (herrajes dorados, broche, logo SAHAR, perlas, etc.)
  function shouldPreservePixel(r, g, b) {
    const [h, s, l] = rgbToHsl(r, g, b);
    const hueDeg = h * 360;

    // 1. Muy oscuro: herrajes negros, cadenas oscuras, textos negros
    if (l < 0.20) return true;

    // 2. Muy desaturado: blanco puro, gris, plateado, cromados, perlas
    if (s < 0.10) return true;

    // 3. Oscuro y poco saturado: sombras profundas, textos negros
    if (l < 0.35 && s < 0.30) return true;

    // 4. Metálicos cálidos (dorado, bronce, cobre, champagne):
    //    - Hue cálido entre 15° (cobre) y 90° (amarillo dorado)
    //    - Saturación significativa
    //    - Fuerte dominancia de R sobre B → clave para distinguir
    //      del tejido crema (donde R y B son similares)
    //    - Luminosidad amplia (permite brillos y sombras del metal)
    if (hueDeg >= 15 && hueDeg <= 90 && s > 0.30 && (r - b) > 45) return true;

    return false;
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

    const [tr, tg, tb] = hexToRgb(colorPicker.value);
    const [targetH, targetS, targetL] = rgbToHsl(tr, tg, tb);

    const src = originalImageData.data;
    const out = new Uint8ClampedArray(src.length);
    const w = canvas.width;

    for (let i = 0; i < src.length; i += 4) {
      const px = (i / 4) % w;
      const py = Math.floor((i / 4) / w);
      const r = src[i], g = src[i + 1], b = src[i + 2], a = src[i + 3];

      // 1) Protección de fondo detectado
      if (backgroundMask[py * w + px]) {
        out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
        continue;
      }

      // 2) Protección automática (herrajes, logo, perlas)
      if (shouldPreservePixel(r, g, b)) {
        out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
        continue;
      }

      // 3) Recolorear
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

  /* -------------------- Eventos -------------------------- */
  modelSelect.addEventListener('change', () => {
    const opt = modelSelect.options[modelSelect.selectedIndex];
    const price = parseInt(opt.getAttribute('data-price')).toLocaleString('es-CL');
    priceDisplay.textContent = `Precio base: $${price}`;
    loadBagImage(opt.getAttribute('data-img'));
  });

  colorPicker.addEventListener('input', () => {
    colorHex.textContent = colorPicker.value.toUpperCase();
    applyColor();
  });

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
    const color = colorHex.textContent;
    const mensaje = `Hola Sahar! 👋 Me encantaría cotizar una cartera personalizada.%0A%0A📌 *Modelo:* ${modelo}%0A🎨 *Color elegido:* ${color}%0A💰 *Precio base:* $${price}%0A%0A¿Me pueden ayudar con el valor final y tiempo de confección?`;
    window.open(`https://wa.me/${TELEFONO}?text=${mensaje}`, '_blank', 'noopener,noreferrer');
  });

  /* -------------------- Init ----------------------------- */
  const firstOpt = modelSelect.options[0];
  priceDisplay.textContent = `Precio base: $${parseInt(firstOpt.getAttribute('data-price')).toLocaleString('es-CL')}`;
  loadBagImage(firstOpt.getAttribute('data-img'));

  /* -------------------- PWA ------------------------------ */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
