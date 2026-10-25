// Reads the power number printed in the black box at the bottom left of a character card.
// The digits come from one fixed font, so a small template matcher is enough (no OCR engine needed):
//   1. cut the digit band out of the card image,
//   2. find the white digits and slice them into glyph cells (right-aligned, fixed pitch),
//   3. squash each cell to 10x16 and pick the nearest template.
// Pure functions: they take gray values, so they run in Node tests as well as in the browser.

export const GW = 10, GH = 16;

/** Pixel rectangle of the digit band for a card image of size w x h. */
export function bandRect(w, h) {
  const x0 = Math.floor(.07 * w), y0 = Math.floor(.919 * h);
  return { x: x0, y: y0, w: Math.floor(.27 * w) - x0, h: Math.floor(.952 * h) - y0 };
}

/** Squash gray[ox..ox+cw) x all rows of a band into GW x GH by box averaging. Returns Float32Array in 0..1. */
function squash(gray, bw, bh, ox, cw) {
  const out = new Float32Array(GW * GH);
  for (let j = 0; j < GH; j++) {
    const ya = Math.floor((j * bh) / GH), yb = Math.max(ya + 1, Math.ceil(((j + 1) * bh) / GH));
    for (let i = 0; i < GW; i++) {
      const xa = ox + Math.floor((i * cw) / GW), xb = ox + Math.max(Math.floor((i * cw) / GW) + 1, Math.ceil(((i + 1) * cw) / GW));
      let s = 0, n = 0;
      for (let y = ya; y < yb; y++) for (let x = xa; x < xb; x++) if (x >= 0 && x < bw) { s += gray[y * bw + x]; n++; }
      out[j * GW + i] = n ? s / n / 255 : 0;
    }
  }
  return out;
}

/** Slice the band (gray values, bw x bh, for a card image that is cardW wide) into glyph cells, left to right. */
export function extractGlyphs(gray, bw, bh, cardW) {
  const ink = new Array(bw).fill(0);
  for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) if (gray[y * bw + x] > 150) ink[x]++;
  const gap = Math.max(2, Math.round(.0175 * cardW)), runs = [];
  ink.forEach((v, x) => { if (!v) return; const r = runs[runs.length - 1]; if (r && x - r[1] <= gap) r[1] = x; else runs.push([x, x]); });
  if (!runs.length) return [];
  const [L, R] = runs.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
  const pitch = .037 * cardW, out = [];
  let pos = R + 1;
  while (pos - L >= .4 * pitch && out.length < 6) {
    const a = Math.round(pos - pitch), start = Math.max(0, a);
    if (pos - start < 3) break;
    out.push(squash(gray, bw, bh, start, pos - start));
    pos = a;
  }
  return out.reverse();
}

const dist = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; } return s / a.length; };

/** Nearest template for one glyph. Returns { digit, d } (d = mean squared difference). */
export function classify(glyph, templates) {
  let best = { digit: null, d: Infinity };
  for (const [digit, t] of Object.entries(templates)) { const d = dist(glyph, t); if (d < best.d) best = { digit, d }; }
  return best;
}

export const MAX_GLYPH_DIST = 0.06; // above this a glyph is not like any known digit (e.g. a digit we have no template for)

/**
 * Read the power. Returns { value, glyphs, digits, ok } where value is null when anything is doubtful
 * (unknown glyph, impossible number): the caller then asks the person to type it.
 */
export function readPower(gray, bw, bh, cardW, templates) {
  const glyphs = extractGlyphs(gray, bw, bh, cardW);
  if (!glyphs.length) return { value: null, glyphs, digits: '', ok: false };
  const picks = glyphs.map((g) => classify(g, templates));
  const digits = picks.map((p) => p.digit ?? '?').join('');
  const value = Number(digits);
  const ok = picks.every((p) => p.d <= MAX_GLYPH_DIST) && Number.isInteger(value) && value >= 500 && value <= 20000 && value % 500 === 0;
  return { value: ok ? value : null, glyphs, digits, ok };
}
