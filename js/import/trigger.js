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
export function classifyAt(rgba, w, h, cx, cy, hex, span = 2) {
  const step = Math.max(1, Math.round(hex / 24)), shifts = Array.from({ length: 2 * span + 1 }, (_, k) => (k - span) * step);
  let best = null, ring = 0;
  for (const dx of shifts) for (const dy of shifts) {
    ring = Math.max(ring, ringDark(rgba, w, h, cx + dx, cy + dy, hex));
    const d = describeGlyph(rgba, w, h, cx + dx, cy + dy, hex);
    if (!d) continue;
    for (const [type, list] of Object.entries(TRIGGER_TEMPLATES)) for (const t of list) {
      const dist = distance(d, t);
      if (dist > (LIMIT[type] ?? LIMIT.default)) continue;
      if (HUE_GATE[type] && hueDiff(d.hue, t.hue) > HUE_GATE[type]) continue;
      if (!best || dist < best.distance) best = { type, distance: dist, dx, dy };
    }
  }
  return best && ring >= .08 ? best : null;
}

/** Classify the trigger icon of a whole portrait card given as RGBA pixels. */
export function classifyTrigger(rgba, w, h) {
  if (w > h) return null;
  return classifyAt(rgba, w, h, SLOT.x * w, SLOT.y * h, SLOT.hex * w);
}

// ───────── Climax cards (landscape): one or two trigger icons stacked in the top-left corner ─────────
export const CX_SLOT = { x: .067, y: .08, hex: .085, pitch: .87 };   // first hexagon centre / width as fractions of the card width (y: of the height); pitch = spacing in hexagon widths

/** { dx, dy } (the shift that fits best) when the hexagon at (cx, cy) holds the Soul icon, a black fleur-de-lis on a white hexagon; else null. */
export function soulAt(rgba, w, h, cx, cy, hex, span = 2) {
  const step = Math.max(1, Math.round(hex / 24)), shifts = Array.from({ length: 2 * span + 1 }, (_, k) => (k - span) * step);
  let best = null;
  for (const dx of shifts) for (const dy of shifts) {
    const x = cx + dx, y = cy + dy, rad = .42 * hex;
    let n = 0, dark = 0, white = 0, colour = 0, cN = 0, cDark = 0, aN = 0, aWhite = 0;
    for (let yy = Math.max(0, Math.floor(y - rad)); yy < Math.min(h, Math.ceil(y + rad)); yy++) for (let xx = Math.max(0, Math.floor(x - rad)); xx < Math.min(w, Math.ceil(x + rad)); xx++) {
      if (Math.hypot(xx - x, yy - y) > rad) continue;
      const i = (yy * w + xx) * 4, r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      n++; if (mx < 64) dark++; else if (mx > 204 && (mx - mn) / mx < .2) white++;
      const q = Math.hypot(xx - x, yy - y) / hex;                  // the fleur is a dark blob in the middle of a white hexagon
      if (q < .2) { cN++; if (mx < 64) cDark++; } else if (q >= .22) { aN++; if (mx > 204 && (mx - mn) / mx < .2) aWhite++; }
      if (mx > 77 && (mx - mn) / mx > .28) colour++;
    }
    if (n && colour / n < .08 && dark / n >= .1 && dark / n <= .55 && white / n >= .25 && cN && cDark / cN >= .25 && aN && aWhite / aN >= .4 && ringDark(rgba, w, h, x, y, hex) >= .08) { const score = Math.abs(dx) + Math.abs(dy); if (!best || score < best.score) best = { dx, dy, score }; }
  }
  return best;
}

/** Trigger icons of a climax card, top to bottom, e.g. ['Standby', 'Soul']. Stops at the first empty slot. */
export function classifyClimaxAt(rgba, w, h, cx, cy, hex, pitch = CX_SLOT.pitch) {
  const out = [];
  let x = cx, y = cy;
  for (let i = 0; i < 2; i++) {
    const span = i === 0 ? 4 : 2;                       // the second icon sits right below the first, so it needs less searching
    const c = classifyAt(rgba, w, h, x, y, hex, span);
    const sl = c ? null : soulAt(rgba, w, h, x, y, hex, span);
    const hit = c || sl;
    if (!hit) break;
    out.push(c ? c.type : 'Soul');
    x += hit.dx; y += hit.dy + pitch * hex;
  }
  return out;
}

export function classifyClimax(rgba, w, h) {
  if (w <= h) return [];
  return classifyClimaxAt(rgba, w, h, CX_SLOT.x * w, CX_SLOT.y * h, CX_SLOT.hex * w);
}
