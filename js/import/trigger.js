// Recognise the trigger icon printed in the top-right slot of a portrait card (everything except the black Soul icon,
// which hasSoulTrigger() in images.js handles). Method: the glyph inside the hexagon is the saturated part of its
// inside; cut it to its bounding box, average it to a 12x12 grid and compare with templates cut from sample cards
// (tools/trigger_templates.py). Pure functions on RGBA arrays so they can be unit-tested.
import { TRIGGER_TEMPLATES } from './triggerTemplates.js';

const GRID = 12;
export const SLOT = { x: .915, y: .068, hex: .108 };           // hexagon centre / width as fractions of the card width (height for y)
const LIMIT = { default: .4, Shot: .45, Standby: .6, Bounce: .8 };
const HUE_GATE = { Shot: 20, Standby: 20, Bounce: 25 };        // degrees; these glyphs are easy to confuse with warm backgrounds

const hueDiff = (a, b) => { const d = Math.abs(a - b) % 360; return Math.min(d, 360 - d); };

/** Glyph descriptor of the hexagon centred at (cx, cy) with width hex; null when it holds no coloured glyph. */
export function describeGlyph(rgba, w, h, cx, cy, hex) {
  const half = Math.round(.31 * hex);
  const x0 = Math.max(0, Math.round(cx) - half), y0 = Math.max(0, Math.round(cy) - half);
  const x1 = Math.min(w, Math.round(cx) + half), y1 = Math.min(h, Math.round(cy) + half);
  if (x1 - x0 < 4 || y1 - y0 < 4) return null;
  const mw = x1 - x0, mh = y1 - y0, mask = new Uint8Array(mw * mh);
  let n = 0, bx1 = mw, by1 = mh, bx2 = -1, by2 = -1, sx = 0, sy = 0;
  for (let y = 0; y < mh; y++) for (let x = 0; x < mw; x++) {
    const i = ((y0 + y) * w + x0 + x) * 4, r = rgba[i] / 255, g = rgba[i + 1] / 255, b = rgba[i + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (mx > .3 && (mx - mn) / mx > .28) {
      mask[y * mw + x] = 1; n++;
      if (x < bx1) bx1 = x; if (x > bx2) bx2 = x; if (y < by1) by1 = y; if (y > by2) by2 = y;
      const d = mx - mn;
      let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      hue = ((hue * 60) + 360) % 360 * Math.PI / 180; sx += Math.sin(hue); sy += Math.cos(hue);
    }
  }
  if (n / (mw * mh) < .06) return null;
  bx2++; by2++;
  const bw = bx2 - bx1, bh = by2 - by1, grid = new Array(GRID * GRID).fill(0);
  // area-average the bounding box down to GRID x GRID (fractional cell coverage, like a box filter)
  for (let gy = 0; gy < GRID; gy++) for (let gx = 0; gx < GRID; gx++) {
    const ya = by1 + gy * bh / GRID, yb = by1 + (gy + 1) * bh / GRID, xa = bx1 + gx * bw / GRID, xb = bx1 + (gx + 1) * bw / GRID;
    let sum = 0, area = 0;
    for (let y = Math.floor(ya); y < Math.ceil(yb); y++) {
      const wy = Math.min(y + 1, yb) - Math.max(y, ya);
      for (let x = Math.floor(xa); x < Math.ceil(xb); x++) {
        const wx = Math.min(x + 1, xb) - Math.max(x, xa), wgt = wx * wy;
        sum += mask[y * mw + x] * wgt; area += wgt;
      }
    }
    grid[gy * GRID + gx] = area ? sum / area : 0;
  }
  return { grid, hue: ((Math.atan2(sx, sy) * 180 / Math.PI) + 360) % 360 };
}

/** Fraction of dark pixels on the ring where the hexagon's black outline sits; separates a printed icon from plain artwork. */
export function ringDark(rgba, w, h, cx, cy, hex) {
  let n = 0, dark = 0;
  const x0 = Math.max(0, Math.floor(cx - hex)), x1 = Math.min(w, Math.ceil(cx + hex)), y0 = Math.max(0, Math.floor(cy - hex)), y1 = Math.min(h, Math.ceil(cy + hex));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const r = Math.hypot(x - cx, y - cy) / hex;
    if (r <= .4 || r >= .52) continue;
    const i = (y * w + x) * 4; n++;
    if (Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) / 255 < .3) dark++;
  }
  return n ? dark / n : 0;
}

function distance(d, t) {
  let s = 0;
  for (let i = 0; i < d.grid.length; i++) s += Math.abs(d.grid[i] - t.grid[i]);
  return (s / d.grid.length) * 2 + hueDiff(d.hue, t.hue) / 180 * .6;
}

/** Classify the trigger icon of the hexagon at (cx, cy) / width hex. Returns { type, distance } or null. */
export function classifyAt(rgba, w, h, cx, cy, hex) {
  const step = Math.max(1, Math.round(hex / 24)), shifts = [-2, -1, 0, 1, 2].map((k) => k * step);
  let best = null, ring = 0;
  for (const dx of shifts) for (const dy of shifts) {
    ring = Math.max(ring, ringDark(rgba, w, h, cx + dx, cy + dy, hex));
    const d = describeGlyph(rgba, w, h, cx + dx, cy + dy, hex);
    if (!d) continue;
    for (const [type, list] of Object.entries(TRIGGER_TEMPLATES)) for (const t of list) {
      const dist = distance(d, t);
      if (dist > (LIMIT[type] ?? LIMIT.default)) continue;
      if (HUE_GATE[type] && hueDiff(d.hue, t.hue) > HUE_GATE[type]) continue;
      if (!best || dist < best.distance) best = { type, distance: dist };
    }
  }
  return best && ring >= .08 ? best : null;
}

/** Classify the trigger icon of a whole portrait card given as RGBA pixels. */
export function classifyTrigger(rgba, w, h) {
  if (w > h) return null;
  return classifyAt(rgba, w, h, SLOT.x * w, SLOT.y * h, SLOT.hex * w);
}
