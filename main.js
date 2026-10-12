/* =========================================================
   Sahar - main.js  (v4 profesional)
   - Preservación estricta de metales y perlas
   - Recoloreado con normalización de luminosidad
   - Salida acromática para negros/blancos/grises
   - Zonas duales para Lumina con suavizado x3
   ========================================================= */

(() => {
  'use strict';

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* -------------------- Elementos ----------------------- */
  const canvas = document.getElementById('bag-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
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
  let backgroundMask    = null;
  let zoneMask          = null;
  let avgL1             = 0.70;
  let avgL2             = 0.35;
  let currentModel      = null;

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

  /* --------- Helpers: hue / saturación / luminancia ------ */
  function getHue(r, g, b) {
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const d = max - min;
    if (d === 0) return 0;
    let h;
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    return h < 0 ? h + 360 : h;
  }

  function getSat(r, g, b) {
    const max = Math.max(r, g, b);
    return max === 0 ? 0 : (max - Math.min(r, g, b)) / max;
  }

  function getLum(r, g, b) {
    return (Math.max(r, g, b) + Math.min(r, g, b)) / 510;
  }

  /* ---------- Preservación estricta ---------------------- */
  // Solo se preserva metal REAL (dorado/plateado) y perlas.
  // El tejido cálido (crema, beige, mostaza) NO se preserva.
  function shouldPreservePixel(r, g, b, isLumina, zone) {
    const l = getLum(r, g, b);
    const s = getSat(r, g, b);
    const h = getHue(r, g, b);

    // 1) Muy oscuro: texto grabado del logo, sombras negras profundas
    if (l < 0.09) return true;

    // 2) Perlas: muy brillante, muy poco saturado y por encima
    //    del promedio del tejido (evita "no pintar" tejidos blancos)
    const refAvg = (isLumina && zone === 2) ? avgL2 : avgL1;
    if (l > 0.90 && s < 0.10 && refAvg < 0.72 && (l - refAvg) > 0.18) return true;

    // 3) Metal dorado brillante (oro, latón, cobre brillante)
    //    - Hue entre 30° y 60° (amarillo-dorado)
    //    - Saturación alta
    //    - R−B fuerte
    if (h >= 25 && h <= 65 && s > 0.50 && (r - b) > 70 && l > 0.35) return true;

    // 4) Metal plateado / cromado / acero
    //    - Saturación prácticamente nula
    //    - Brillo medio-alto
    //    - Sin tinte cálido (R ≈ B)
    if (s < 0.06 && l > 0.55 && Math.abs(r - b) < 12) return true;

    return false;
  }

  /* -------- Detección de zonas para Lumina -------------- */
  function detectLuminaZone(r, g, b) {
    const l = getLum(r, g, b);
    const s = getSat(r, g, b);
    const h = getHue(r, g, b);

    // Borgoña: rojo saturado y oscuro-medio
    if ((h >= 320 || h <= 25) && s > 0.30 && l < 0.65) return 2;

    // Crema: tono cálido amarillento o beige
    if (h >= 25 && h <= 80 && l > 0.55) return 1;
    if (s < 0.18 && l > 0.60) return 1;

    // Fallback por luminancia
    return l > 0.55 ? 1 : 2;
  }

  /* -------- Suavizado del mapa de zonas ----------------- */
  function smoothZones(zones, w, h, iterations) {
    let src = zones;
    for (let it = 0; it < iterations; it++) {
      const out = new Uint8Array(src);
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x;
          const ns = [i - 1, i + 1, i - w, i + w,
                      i - w - 1, i - w + 1, i + w - 1, i + w + 1];
          let c1 = 0, c2 = 0;
          for (const n of ns) {
            if (src[n] === 1) c1++;
            else if (src[n] === 2) c2++;
          }
          if (c1 >= 5 && c1 > c2) out[i] = 1;
          else if (c2 >= 5 && c2 > c1) out[i] = 2;
        }
      }
      src = out;
    }
    return src;
  }

  /* ---------- Flood fill para detectar fondo ------------- */
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

  /* -------- Estadísticas (zonas + luminosidad) ----------- */
  function computeStats() {
    const w = canvas.width, h = canvas.height;
    const data = originalImageData.data;
    const isLumina = currentModel === 'Lumina';

    // 1) Zonas (Lumina) — suavizado x3 para bordes limpios
    if (isLumina) {
      const raw = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const p = i * 4;
        raw[i] = detectLuminaZone(data[p], data[p + 1], data[p + 2]);
      }
      zoneMask = smoothZones(raw, w, h, 3);
    } else {
      zoneMask = null;
    }

    // 2) Promedio de luminosidad por zona (fabric only)
    let sum1 = 0, cnt1 = 0;
    let sum2 = 0, cnt2 = 0;
    for (let i = 0; i < w * h; i++) {
      if (backgroundMask[i]) continue;
      const p = i * 4;
      const r = data[p], g = data[p + 1], b = data[p + 2];
      const l = getLum(r, g, b);
      const zone = zoneMask ? zoneMask[i] : 1;
      if (zone === 2) { sum2 += l; cnt2++; }
      else            { sum1 += l; cnt1++; }
    }
    avgL1 = cnt1 > 0 ? sum1 / cnt1 : 0.70;
    avgL2 = cnt2 > 0 ? sum2 / cnt2 : 0.35;
  }

  /* ------------------ Cargar imagen ---------------------- */
  function loadBagImage(src) {
    canvas.classList.add('loading');
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const MAX = 500;
      const scale = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight, 1);
      canvas.width  = Math.round(img.naturalWidth  * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      try {
        originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        backgroundMask    = new Uint8Array(canvas.width * canvas.height);
        detectBackground();
        computeStats();
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

    const isLumina = currentModel === 'Lumina';

    // Objetivos (H, S, L)
    const [Ar, Ag, Ab] = hexToRgb(colorPicker.value);
    const [AH, AS, AL] = rgbToHsl(Ar, Ag, Ab);
    const isAchromatic = AS < 0.06;

    let BH = AH, BS = AS, BL = AL, isAchrom2 = isAchromatic;
    if (isLumina && colorPicker2) {
      const [Br, Bg, Bb] = hexToRgb(colorPicker2.value);
      [BH, BS, BL] = rgbToHsl(Br, Bg, Bb);
      isAchrom2 = BS < 0.06;
    }

    const src = originalImageData.data;
    const out = new Uint8ClampedArray(src.length);
    const w = canvas.width, h = canvas.height;

    for (let i = 0; i < src.length; i += 4) {
      const idx = i / 4;
      const r = src[i], g = src[i + 1], b = src[i + 2], a = src[i + 3];

      // Fondo → preservar
      if (backgroundMask[idx]) {
        out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
        continue;
      }

      const zone = zoneMask ? zoneMask[idx] : 1;

      // Metal/perla/negro → preservar
      if (shouldPreservePixel(r, g, b, isLumina, zone)) {
        out[i] = r; out[i + 1] = g; out[i + 2] = b; out[i + 3] = a;
        continue;
      }

      // Elegir objetivo según zona
      let targetH = AH, targetS = AS, targetL = AL, achrom = isAchromatic;
      let refAvg  = avgL1;
      if (isLumina && zone === 2) {
        targetH = BH; targetS = BS; targetL = BL; achrom = isAchrom2;
        refAvg  = avgL2;
      }

      // Luminancia original
      const l0 = getLum(r, g, b);

      // Ganancia dinámica: conserva textura sin aplastar extremos
      const headroom = Math.min(targetL, 1 - targetL) * 2;   // 0..1
      const gain     = 0.15 + 0.65 * headroom;

      const newL = Math.max(0.03, Math.min(0.97,
        targetL + (l0 - refAvg) * gain
      ));

      // Salida acromática → escala de grises pura (sin tinte de hue)
      if (achrom) {
        const v = Math.round(newL * 255);
        out[i] = v; out[i + 1] = v; out[i + 2] = v; out[i + 3] = a;
        continue;
      }

      // Salida cromática → reemplazo de hue/sat, luminancia remapeada
      const [nr, ng, nb] = hslToRgb(targetH, targetS, newL);
      out[i] = nr; out[i + 1] = ng; out[i + 2] = nb; out[i + 3] = a;
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
  loadBagImage(firstOpt.getAttribute('data-img'));

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
