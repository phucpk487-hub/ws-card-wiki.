// Canvas helpers for imported card images (color detection, power reading, soul counting, compression).
import { bandRect, readPower } from './power.js';
import { classifyTrigger, classifyClimax } from './trigger.js';
import { hasCounter } from './counter.js';

/** Card color from the hue of the nameplate bar. Returns a color name or null. */
export function detectColor(canvas) {
  const w = canvas.width, h = canvas.height, portrait = h > w;
  const box = portrait ? [.27 * w, .915 * h, .33 * w, .07 * h] : [.05 * w, .935 * h, .55 * w, .05 * h];
  let data;
  try { data = canvas.getContext('2d').getImageData(Math.round(box[0]), Math.round(box[1]), Math.round(box[2]), Math.round(box[3])).data; } catch { return null; }
  const counts = {}; let total = 0;
  const step = Math.max(1, Math.floor(data.length / 4 / 3000));
  for (let i = 0; i < data.length; i += 4 * step) {
    const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    const s = mx === 0 ? 0 : d / mx, v = mx;
    if (s < .45 || v < .35) continue;
    let hue = d === 0 ? 0 : mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    hue = (hue * 60 + 360) % 360;
    const name = hue < 20 || hue >= 335 ? 'Red' : hue < 75 ? 'Yellow' : hue < 175 ? 'Green' : hue < 258 ? 'Blue' : 'Purple';
    counts[name] = (counts[name] || 0) + 1; total++;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= Math.max(20, total * 0.15) ? best[0] : null;
}

/**
 * Count the silver soul icons printed right of the power box (1-4), or null if none are found.
 * Same method as read_soul() in tools/pdf_to_cards.py; all sizes are relative to the card width.
 */
export function soulCount(canvas) {
  const w = canvas.width, h = canvas.height;
  if (w > h) return null;
  const x0 = Math.floor(.27 * w) + Math.floor(.035 * w), y0 = Math.floor(.93 * h) + Math.floor(.009 * h);
  const bw = Math.floor(.131 * w), bh = Math.max(1, Math.floor(.023 * h));
  let data;
  try { data = canvas.getContext('2d').getImageData(x0, y0, bw, bh).data; } catch { return null; }
  const cols = [];
  for (let x = 0; x < bw; x++) {
    let hit = 0;
    for (let y = 0; y < bh; y++) {
      const i = (y * bw + x) * 4, r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      if ((mx === 0 ? 0 : (mx - mn) / mx) < .3 && mx > .25) hit++;
    }
    cols.push(hit / bh > .5);
  }
  const icon = .035 * w, gap = Math.max(2, Math.round(.008 * w)), runs = [];
  cols.forEach((on, x) => { if (!on) return; const last = runs[runs.length - 1]; if (last && x - last[1] <= gap + 1) last[1] = x; else runs.push([x, x]); });
  const n = runs.filter((r) => r[1] - r[0] + 1 >= .6 * icon).reduce((t, r) => t + Math.max(1, Math.round((r[1] - r[0] + 1) / icon)), 0);
  return n >= 1 && n <= 4 ? n : null;
}

/** True when the top-right trigger slot holds the opaque black Soul icon (same test as has_soul_trigger() in the converter). */
export function hasSoulTrigger(canvas) {
  const w = canvas.width, h = canvas.height;
  if (w > h) return false;
  const cx = Math.round(.895 * w), cy = Math.round(.083 * h), r = Math.round(.045 * w);
  let data;
  try { data = canvas.getContext('2d').getImageData(cx - r, cy - r, 2 * r, 2 * r).data; } catch { return false; }
  let dark = 0, n = 0;
  for (let i = 0; i < data.length; i += 4, n++) if (Math.max(data[i], data[i + 1], data[i + 2]) / 255 < .22) dark++;
  return dark / n >= .08;
}

/** Name of the coloured (non-Soul) trigger icon in the top-right slot, e.g. 'Treasure', or null. See trigger.js. */
export function detectTrigger(canvas) {
  if (canvas.width > canvas.height) return null;
  try {
    const { width: w, height: h } = canvas;
    const r = classifyTrigger(canvas.getContext('2d').getImageData(0, 0, w, h).data, w, h);
    return r ? r.type : null;
  } catch { return null; }
}

/** True when the card shows the Counter icon (yellow fist under the cost ring). See counter.js. */
export function detectCounter(canvas) {
  if (canvas.width > canvas.height) return false;
  try { return hasCounter(canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data, canvas.width, canvas.height); } catch { return false; }
}

/** Trigger icons of a climax card, top to bottom (one or two), e.g. ['Standby', 'Soul']; [] when none is recognised. */
export function detectClimaxTriggers(canvas) {
  if (canvas.width <= canvas.height) return [];
  try {
    const { width: w, height: h } = canvas;
    return classifyClimax(canvas.getContext('2d').getImageData(0, 0, w, h).data, w, h);
  } catch { return []; }
}

/** Read the printed power with the template matcher in power.js. Returns { value, glyphs, digits, ok }. */
export function readPowerCanvas(canvas, templates) {
  if (canvas.width > canvas.height) return { value: null, glyphs: [], digits: '', ok: false };
  const r = bandRect(canvas.width, canvas.height);
  let data;
  try { data = canvas.getContext('2d').getImageData(r.x, r.y, r.w, r.h).data; } catch { return { value: null, glyphs: [], digits: '', ok: false }; }
  const gray = new Uint8Array(r.w * r.h);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.round(.299 * data[i * 4] + .587 * data[i * 4 + 1] + .114 * data[i * 4 + 2]);
  return readPower(gray, r.w, r.h, canvas.width, templates);
}

/** Small data-URL of the power box so the user can read the number while typing it in. */
export function powerCrop(canvas) {
  if (canvas.width > canvas.height) return null;
  const w = canvas.width, h = canvas.height;
  const sx = Math.round(.04 * w), sy = Math.round(.905 * h), sw = Math.round(.22 * w), sh = Math.round(.08 * h);
  const out = document.createElement('canvas'); out.width = sw * 2; out.height = sh * 2;
  out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return out.toDataURL('image/png');
}

/** Compress to WebP (JPEG where WebP encoding is unavailable). */
export function toBlob(canvas, maxSide = 640, quality = 0.82) {
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const out = document.createElement('canvas');
  out.width = Math.round(canvas.width * scale); out.height = Math.round(canvas.height * scale);
  out.getContext('2d').drawImage(canvas, 0, 0, out.width, out.height);
  return new Promise((resolve, reject) => out.toBlob((b) => {
    if (b && b.type === 'image/webp') return resolve(b);
    out.toBlob((j) => (j ? resolve(j) : reject(new Error('Could not compress image'))), 'image/jpeg', quality);
  }, 'image/webp', quality));
}
