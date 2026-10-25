// Reads color and power from a card image. The pure functions take plain arrays so they
// run in Node tests; the canvas helpers at the bottom are the only browser-specific part.
// Geometry matches tools/build_digit_templates.py (standard Weiss Schwarz portrait frame).
import { DIGIT_TEMPLATES } from '../data/digit-templates.js';

export const CROP_W = 140, CROP_H = 80, PITCH = 17.2, CELL_W = 10, CELL_H = 16;

/** Area-average resample of a gray array (like PIL's BOX filter). */
export function resizeBox(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh);
  const xr = sw / dw, yr = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = y * yr, y1 = (y + 1) * yr;
    for (let x = 0; x < dw; x++) {
      const x0 = x * xr, x1 = (x + 1) * xr;
      let sum = 0, wsum = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0);
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const w = wy * (Math.min(xx + 1, x1) - Math.max(xx, x0));
          sum += src[yy * sw + xx] * w; wsum += w;
        }
      }
      out[y * dw + x] = sum / wsum;
    }
  }
  return out;
}

let samples = null;
function templates() {
  if (!samples) {
    samples = [];
    for (const [digit, list] of Object.entries(DIGIT_TEMPLATES)) {
      for (const s of list) samples.push({ digit, v: Float32Array.from(s, (c) => Number(c) / 9) });
    }
  }
  return samples;
}

const dist2 = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s; };

/** Distance above which a digit is treated as "not recognised" (unseen glyph, damaged crop). */
export const MAX_DIGIT_DISTANCE = 10; // held-out correct digits score <7, unseen glyphs score >15

/**
 * Read the power box from the bottom-left corner of a card, pre-scaled to 140x80 gray.
 * Returns { value: number|null, digits: [{ digit, distance }] }. value is null when any digit is unsure.
 */
export function powerFromGray(gray) {
  let xs = Infinity, xe = -Infinity;
  for (let x = 36; x < 124; x++) {
    let n = 0;
    for (let y = 24; y < 48; y++) if (gray[y * CROP_W + x] > 170) n++;
    if (n >= 6) { xs = Math.min(xs, x); xe = Math.max(xe, x); }
  }
  if (xe < xs) return { value: null, digits: [] };
  const n = Math.max(1, Math.round((xe - xs + 1) / PITCH));
  const cx = (xs + xe) / 2;
  const tpl = templates();
  const digits = [];
  for (let i = 0; i < n; i++) {
    const c = cx + (i - (n - 1) / 2) * PITCH;
    const a = Math.max(0, Math.round(c - PITCH / 2)), b = Math.min(CROP_W, Math.round(c + PITCH / 2));
    const w = b - a, h = 28; // rows 22..50
    const patch = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) patch[y * w + x] = gray[(22 + y) * CROP_W + a + x] / 255;
    const cell = resizeBox(patch, w, h, CELL_W, CELL_H);
    let best = null;
    for (const t of tpl) { const d = dist2(cell, t.v); if (!best || d < best.distance) best = { digit: t.digit, distance: d }; }
    digits.push(best);
  }
  const ok = digits.length > 0 && digits.every((d) => d.distance <= MAX_DIGIT_DISTANCE);
  const value = ok ? Number(digits.map((d) => d.digit).join('')) : null;
  return { value: value !== null && value % 500 === 0 && value > 0 && value <= 30000 ? value : null, digits };
}

/** Hue buckets used by the card frame bar. `rgba` is a small RGBA array (e.g. 120x24). */
export function colorFromRgba(rgba) {
  const count = {};
  for (let i = 0; i < rgba.length; i += 4) {
    const r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    const v = max, s = max === 0 ? 0 : d / max;
    if (s < 0.45 || v < 0.35) continue;
    let h;
    if (d === 0) h = 0;
    else if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
    else if (max === g) h = ((b - r) / d + 2) * 60;
    else h = ((r - g) / d + 4) * 60;
    const name = h < 20 || h >= 335 ? 'Red' : h < 75 ? 'Yellow' : h < 175 ? 'Green' : h < 258 ? 'Blue' : 'Purple';
    count[name] = (count[name] || 0) + 1;
  }
  const best = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 100 ? best[0] : null;
}

// ───────────── browser helpers (need a canvas) ─────────────
function small(canvas, sx, sy, sw, sh, dw, dh) {
  const c = document.createElement('canvas'); c.width = dw; c.height = dh;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, sx, sy, sw, sh, 0, 0, dw, dh);
  return ctx.getImageData(0, 0, dw, dh).data;
}

/** Detect color (and power for portrait cards) from a canvas holding the card image. */
export function analyzeCardCanvas(canvas) {
  const w = canvas.width, h = canvas.height, portrait = h > w;
  const box = portrait ? [0.27 * w, 0.915 * h, 0.33 * w, 0.07 * h] : [0.05 * w, 0.935 * h, 0.55 * w, 0.05 * h];
  const color = colorFromRgba(small(canvas, ...box, 120, 24));
  let power = null, powerDigits = [];
  if (portrait) {
    const rgba = small(canvas, 0, 0.88 * h, 0.3 * w, 0.12 * h, CROP_W, CROP_H);
    const gray = new Float32Array(CROP_W * CROP_H);
    for (let i = 0; i < gray.length; i++) gray[i] = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    const r = powerFromGray(gray);
    power = r.value; powerDigits = r.digits;
  }
  return { color, power, powerDigits };
}
