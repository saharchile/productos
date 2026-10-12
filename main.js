/* =========================================================
   Sahar - main.js (v10)
   - Ajuste de máscaras con scaleX/scaleY
   - MASK_CONFIG y loadBagImage expuestos a window (para debug)
   ========================================================= */

(() => {
  'use strict';

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

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
  const MASK_BASE = 'imagenes/modelos/masks/';

  /* ---------------------------------------------------------
     CONFIGURACIÓN DE AJUSTE POR MODELO
     --------------------------------------------------------- */
  const MASK_CONFIG = {
    Alba:   { scaleX: 1.00, scaleY: 1.00, offsetX: 0, offsetY: 0 },
    Aurora: { scaleX: 1.00, scaleY: 1.00, offsetX: 0, offsetY: 0 },
    Rocio:  { scaleX: 1.15, scaleY: 1.00, offsetX: 0, offsetY: 0 },
    Bruma:  { scaleX: 1.25, scaleY: 1.00, offsetX: 0, offsetY: 0 },
    Lumina: { scaleX: 1.20, scaleY: 1.00, offsetX: 0, offsetY: 0 }
  };

  const DEFAULT_MASK_CFG = { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };

  // ✅ Exponer MASK_CONFIG para poder ajustarlo en vivo desde la consola
  window.MASK_CONFIG = MASK_CONFIG;

  let originalImageData = null;
  let currentMaskData   = null;
  let currentModel      = null;

  /* -------------------- Conversión ---------------------- */
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

  /* ------------------ Cargar imagen y máscara ----------- */
  function loadBagImage(src, maskName) {
    canvas.classList.add('loading');

    currentMaskData = null;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    const maskSrc = `${MASK_BASE}${maskName}.png`;
    const maskImg = new Image();
    maskImg.crossOrigin = 'anonymous';

    let imgLoaded = false, maskLoaded = false;

    const tryReady = () => {
      if (!imgLoaded || !maskLoaded) return;

      const MAX = 500;
      const scale = Math.min(MAX / img.naturalWidth, MAX / img.naturalHeight, 1);
      canvas.width  = Math.round(img.naturalWidth  * scale);
      canvas.height = Math.round(img.naturalHeight * scale);

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      try {
        originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      } catch (e) {
        console.error('Error leyendo imagen:', e);
      }

      const cfg = MASK_CONFIG[maskName] || DEFAULT_MASK_CFG;
      const sx = (typeof cfg.scaleX === 'number') ? cfg.scaleX : 1;
      const sy = (typeof cfg.scaleY === 'number') ? cfg.scaleY : 1;
      const ox = (typeof cfg.offsetX === 'number') ? cfg.offsetX : 0;
      const oy = (typeof cfg.offsetY === 'number') ? cfg.offsetY : 0;

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width  = canvas.width;
      maskCanvas.height = canvas.height;
      const maskCtx = maskCanvas.getContext('2d');

      const mw = canvas.width  * sx;
      const mh = canvas.height * sy;
      const mx = (canvas.width  - mw) / 2 + ox;
      const my = (canvas.height - mh) / 2 + oy;

      maskCtx.drawImage(maskImg, mx, my, mw, mh);

      currentMaskData = maskCtx.getImageData(0, 0, canvas.width, canvas.height);

      applyColor();
      canvas.classList.remove('loading');
    };

    img.onload = () => { imgLoaded = true; tryReady(); };
    maskImg.onload = () => { maskLoaded = true; tryReady(); };

    img.onerror = () => {
      console.error('No se pudo cargar la imagen:', src);
      canvas.classList.remove('loading');
    };
    maskImg.onerror = () => {
      console.error('No se pudo cargar la máscara:', maskSrc);
      imgLoaded = true; maskLoaded = true;
      tryReady();
    };

    img.src = src;
    maskImg.src = maskSrc;
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
    const maskData = currentMaskData ? currentMaskData.data : null;

    let sumL1 = 0, cnt1 = 0, sumL2 = 0, cnt2 = 0;
    if (maskData) {
      for (let i = 0; i < src.length; i += 4) {
        const isOpaqueWhite = maskData[i + 3] > 128 && maskData[i] > 128;
        if (!isOpaqueWhite) continue;
        const r = src[i], g = src[i+1], b = src[i+2];
        const l = (Math.max(r,g,b) + Math.min(r,g,b)) / 510;
        if (isLumina && l < 0.5) { sumL2 += l; cnt2++; }
        else                     { sumL1 += l; cnt1++; }
      }
    }
    const avgL1 = cnt1 > 0 ? sumL1 / cnt1 : 0.7;
    const avgL2 = cnt2 > 0 ? sumL2 / cnt2 : 0.35;

    for (let i = 0; i < src.length; i += 4) {
      const r = src[i], g = src[i+1], b = src[i+2];

      const paint = !maskData || (maskData[i + 3] > 128 && maskData[i] > 128);

      if (!paint) {
        out[i] = r; out[i+1] = g; out[i+2] = b; out[i+3] = 255;
        continue;
      }

      let targetH = AH, targetS = AS, targetL = AL, achrom = isAchromatic;
      let refAvg = avgL1;

      const l0 = (Math.max(r,g,b) + Math.min(r,g,b)) / 510;
      if (isLumina && l0 < 0.5) {
        targetH = BH; targetS = BS; targetL = BL;
        refAvg = avgL2;
      }

      const deltaL = (l0 - refAvg) * 0.85;
      const newL = Math.max(0.05, Math.min(0.95, targetL + deltaL));

      if (achrom) {
        const v = Math.round(newL * 255);
        out[i] = v; out[i+1] = v; out[i+2] = v; out[i+3] = 255;
      } else {
        const [, s0] = rgbToHsl(r, g, b);
        const newS = Math.min(1, targetS * 0.85 + s0 * 0.15);
        const [nr, ng, nb] = hslToRgb(targetH, newS, newL);
        out[i] = nr; out[i+1] = ng; out[i+2] = nb; out[i+3] = 255;
      }
    }

    ctx.putImageData(new ImageData(out, w, h), 0, 0);
    updateCanvasLabel();
  }

  /* -------------------- Accesibilidad ------------------- */
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

  /* -------------------- Eventos ------------------------- */
  modelSelect.addEventListener('change', () => {
    const opt = modelSelect.options[modelSelect.selectedIndex];
    currentModel = opt.value;
    const maskName = opt.getAttribute('data-mask') || opt.value;
    const price = parseInt(opt.getAttribute('data-price')).toLocaleString('es-CL');
    priceDisplay.textContent = `Precio base: $${price}`;
    updateSecondColorVisibility();
    loadBagImage(opt.getAttribute('data-img'), maskName);
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

  // ✅ Exponer loadBagImage para poder recargar la máscara desde la consola
  window.loadBagImage = loadBagImage;

  /* -------------------- Init ---------------------------- */
  const firstOpt = modelSelect.options[0];
  currentModel = firstOpt.value;
  const firstMaskName = firstOpt.getAttribute('data-mask') || firstOpt.value;
  priceDisplay.textContent = `Precio base: $${parseInt(firstOpt.getAttribute('data-price')).toLocaleString('es-CL')}`;
  updateSecondColorVisibility();
  loadBagImage(firstOpt.getAttribute('data-img'), firstMaskName);

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
