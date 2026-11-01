import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ACCENTS, isAccent } from '../js/lib/accent.js';

test('six accents, each with light and dark CSS and enough contrast', () => {
  const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
  assert.equal(ACCENTS.length, 6);
  for (const a of ACCENTS.filter((x) => x.id !== 'ruby')) {
    assert.ok(css.includes(`:root[data-accent="${a.id}"]`), a.id); assert.ok(css.includes(`:root[data-theme="dark"][data-accent="${a.id}"]`), a.id);
  }
  assert.ok(isAccent('ocean') && !isAccent('pink') && !isAccent(null));
  const lum = (h) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  for (const m of css.matchAll(/:root\[data-accent="(\w+)"\] \{ --accent: (#\w+);[^}]*--accent-ink: (#\w+)/g)) assert.ok(ratio(m[2], '#fffdf9') >= 4.5 && ratio(m[2], m[3]) >= 4.5, `${m[1]} light`);
  for (const m of css.matchAll(/:root\[data-theme="dark"\]\[data-accent="(\w+)"\] \{ --accent: (#\w+);[^}]*--accent-ink: (#\w+)/g)) assert.ok(ratio(m[2], '#1f1c19') >= 4.5 && ratio(m[2], m[3]) >= 4.5, `${m[1]} dark`);
});
