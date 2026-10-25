// Digits the built-in templates have never seen (e.g. 3) are learned from what the person types on the
// import review screen, and kept in this browser for next time.
import { POWER_TEMPLATES } from './powerTemplates.js';

const KEY = 'wsw-power-templates-v1';
const load = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch { return {}; } };

/** Built-in templates plus anything learned so far. */
export function powerTemplates() {
  const out = { ...POWER_TEMPLATES };
  for (const [d, t] of Object.entries(load())) if (!(d in POWER_TEMPLATES) && Array.isArray(t.v) && t.v.length === 160) out[d] = Float32Array.from(t.v);
  return out;
}

/** Remember glyphs for digits we have no built-in template for. `digits` is what the person typed (must match the glyph count). */
export function learnPower(glyphs, digits) {
  if (!glyphs.length || glyphs.length !== digits.length || !/^\d+$/.test(digits)) return false;
  const store = load(); let changed = false;
  digits.split('').forEach((d, i) => {
    if (d in POWER_TEMPLATES) return;
    const cur = store[d] || { n: 0, v: new Array(160).fill(0) }, n = cur.n + 1;
    store[d] = { n, v: cur.v.map((x, k) => Math.round(((x * cur.n + glyphs[i][k]) / n) * 1000) / 1000) };
    changed = true;
  });
  if (changed) { try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { return false; } }
  return changed;
}
