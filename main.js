/* =========================================================
   Sahar - main.js
   Mejoras: modularidad, rendimiento con Web Worker,
   accesibilidad del canvas, PWA, menú móvil.
   ========================================================= */

(() => {
  'use strict';

  /* -------------------- Año dinámico -------------------- */
  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* -------------------- Menú móvil ---------------------- */
  const navToggle = document.querySelector('.nav-toggle');
  const mainNav = document.getElementById('main-nav');
  if (navToggle && mainNav) {
    navToggle.addEventListener('click', () => {
      const isOpen = mainNav.dataset.open === 'true';
      mainNav.dataset.open = String(!isOpen);
      navToggle.setAttribute('aria-expanded', String(!isOpen));
    });
    // Cierra al hacer click en un enlace
    mainNav.addEventListener('click', (e) => {
      if (e.target.tagName === 'A') {
        mainNav.dataset.open = 'false';
        navToggle.setAttribute('aria-expanded', 'false');
      }
    });
  }

  /* -------------------- Personalizador ------------------ */
  const canvas = document.getElementById('canvas-preview');
  if (!canvas) return;

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const selectModelo = document.getElementById('modelo');
  const inputColor = document.getElementById('color');
  const priceDisplay = document.getElementById('price-display');
  const btnWhatsapp = document.getElementById('btn-whatsapp');

  const IMG_BASE = 'imagenes/modelos/creatusahar/';
  const WHATSAPP_NUMBER = '56900000000';

  let originalImageData = null;
  let backgroundMask = null;
  let currentImageLoaded = false;
  let recolorTimeout = null;

  /* -------------------- Web Worker ---------------------- */
  const worker = createRecolorWorker();

  function createRecolorWorker() {
    const code = `
      self.onmessage = function (e) {
        const { imageData, backgroundMask, targetHex } = e.data;
        const data = new Uint8ClampedArray(imageData.data);
        const [tr, tg, tb] = hexToRgb(targetHex);
        const [th, ts, tl] = rgbToHsl(tr, tg, tb);

        const len = data.length;
        for (let i = 0; i < len; i += 4) {
          const px = i / 4;
          if (!backgroundMask[px]) continue;

          const r = data[i], g = data[i + 1], b = data[i + 2];
          const [h, s, l] = rgbToHsl(r, g, b);

          // Conserva textura: mezcla saturación/luminosidad originales con el tono nuevo
          const newS = Math.min(1, s * 0.7 + ts * 0.4);
          const newL = Math.max(0.05, Math.min(0.95, l * 0.75 + tl * 0.3));
          const [nr, ng, nb] = hslToRgb(th, newS, newL);

          data[i] = nr;
          data[i + 1] = ng;
          data[i + 2] = nb;
        }

        self.postMessage({ data }, [data.buffer]);
      };

      function hexToRgb(hex) {
        const h = hex.replace('#','');
        return [
          parseInt(h.substring(0,2),16),
          parseInt(h.substring(2,4),16),
          parseInt(h.substring(4,6),16)
        ];
      }
      function rgbToHsl(r, g, b) {
        r/=255; g/=255; b/=255;
        const max = Math.max(r,g,b), min = Math.min(r,g,b);
        let h, s, l = (max+min)/2;
        if (max === min) { h = s = 0; }
        else {
          const d = max - min;
          s = l > 0.5 ? d/(2-max-min) : d/(max+min);
          switch (max) {
            case r: h = (g-b)/d + (g<b?6:0); break;
            case g: h = (b-r)/d + 2; break;
            default: h = (r-g)/d + 4;
          }
          h /= 6;
        }
        return [h, s, l];
      }
      function hslToRgb(h, s, l) {
        let r, g, b;
        if (s === 0) { r = g = b = l; }
        else {
          const hue2rgb = (p,q,t) => {
            if (t<0) t+=1; if (t>1) t-=1;
            if (t<1/6) return p+(q-p)*6*t;
            if (t<1/2) return q;
            if (t<2/3) return p+(q-p)*(2/3-t)*6;
            return p;
          };
          const q = l < 0.5 ? l*(1+s) : l+s-l*s;
          const p = 2*l - q;
          r = hue2rgb(p,q,h+1/3);
          g = hue2rgb(p,q,h);
          b = hue2rgb(p,q,h-1/3);
        }
        return [Math.round(r*255), Math.round(g*255), Math.round(b*255)];
      }
    `;
    const blob = new Blob([code], { type: 'application/javascript' });
    return new Worker(URL.createObjectURL(blob));
  }

  worker.onmessage = (e) => {
    ctx.putImageData(new ImageData(new Uint8ClampedArray(e.data.data), canvas.width, canvas.height), 0, 0);
  };

  /* -------------------- Carga de imagen ----------------- */
  function loadModel(modelName) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const MAX = 500;
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      originalImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      backgroundMask = buildBackgroundMask(originalImageData);
      currentImageLoaded = true;

      applyColor(inputColor.value);
      updateCanvasLabel();
    };
    img.onerror = () => {
      console.warn('No se pudo cargar la imagen:', modelName);
    };
    img.src = `${IMG_BASE}${modelName}.webp`;
  }

  /* -------------------- Flood fill optimizado ----------- */
  function buildBackgroundMask(imageData) {
    const { width, height, data } = imageData;
    const mask = new Uint8Array(width * height);
    const tolerance = 30;

    const seed = (x, y) => [data[(y * width + x) * 4], data[(y * width + x) * 4 + 1], data[(y * width + x) * 4 + 2]];
    const seeds = [[0,0],[width-1,0],[0,height-1],[width-1,height-1]];

    for (const [sx, sy] of seeds) {
      const [sr, sg, sb] = seed(sx, sy);
      const stack = [sy * width + sx];
      while (stack.length) {
        const idx = stack.pop();
        if (mask[idx]) continue;
        const x = idx % width;
        const y = (idx - x) / width;
        const p = idx * 4;
        const dr = data[p] - sr, dg = data[p+1] - sg, db = data[p+2] - sb;
        if (Math.sqrt(dr*dr + dg*dg + db*db) > tolerance) continue;

        mask[idx] = 1;
        if (x > 0) stack.push(idx - 1);
        if (x < width - 1) stack.push(idx + 1);
        if (y > 0) stack.push(idx - width);
        if (y < height - 1) stack.push(idx + width);
      }
    }
    return mask;
  }

  /* -------------------- Aplicar color ------------------- */
  function applyColor(hex) {
    if (!currentImageLoaded || !originalImageData || !backgroundMask) return;
    // Debounce para no saturar el worker
    clearTimeout(recolorTimeout);
    recolorTimeout = setTimeout(() => {
      worker.postMessage({
        imageData: { width: canvas.width, height: canvas.height, data: originalImageData.data },
        backgroundMask,
        targetHex: hex
      });
    }, 60);
    updateCanvasLabel();
  }

  /* -------------------- Accesibilidad canvas ------------ */
  function updateCanvasLabel() {
    const modelo = selectModelo.options[selectModelo.selectedIndex].text;
    const color = inputColor.value;
    canvas.setAttribute(
      'aria-label',
      `Vista previa del modelo ${modelo} en color ${color}`
    );
  }

  /* -------------------- Precio ------------------------- */
  function updatePrice() {
    const opt = selectModelo.options[selectModelo.selectedIndex];
    const price = Number(opt.dataset.price || 0);
    priceDisplay.textContent = '$' + price.toLocaleString('es-CL');
    return price;
  }

  /* -------------------- Eventos ------------------------ */
  selectModelo.addEventListener('change', () => {
    loadModel(selectModelo.value);
    updatePrice();
  });

  inputColor.addEventListener('input', (e) => applyColor(e.target.value));

  btnWhatsapp.addEventListener('click', () => {
    const modelo = selectModelo.options[selectModelo.selectedIndex].text;
    const color = inputColor.value;
    const price = Number(selectModelo.options[selectModelo.selectedIndex].dataset.price || 0);
    const msg = `¡Hola Sahar! Quiero pedir una cartera:\n\n• Modelo: ${modelo}\n• Color: ${color}\n• Precio: $${price.toLocaleString('es-CL')}\n\n¿Me confirman disponibilidad?`;
    const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  /* -------------------- Init --------------------------- */
  updatePrice();
  loadModel(selectModelo.value);

  /* -------------------- PWA ---------------------------- */
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    });
  }
})();
