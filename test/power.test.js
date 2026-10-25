import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readPower, extractGlyphs, classify } from '../js/import/power.js';
import { POWER_TEMPLATES } from '../js/import/powerTemplates.js';

const bands = JSON.parse(readFileSync(new URL('./fixtures/power-bands.json', import.meta.url)));
const read = (c, t = POWER_TEMPLATES) => readPower(Uint8Array.from(c.gray), c.bw, c.bh, c.w, t);

test('reads the power of every character card in the BD/WE49 set', () => {
  const miss = [];
  for (const c of bands) { const r = read(c); if (r.value !== c.power) miss.push(`${c.number}: read ${r.value} (${r.digits}), expected ${c.power}`); }
  assert.deepEqual(miss, []);
});

test('finds one glyph per digit, including a narrow leading 1', () => {
  for (const c of bands) assert.equal(extractGlyphs(Uint8Array.from(c.gray), c.bw, c.bh, c.w).length, String(c.power).length, c.number);
});

test('a digit without a template is refused instead of guessed', () => {
  const { 7: _seven, ...without7 } = POWER_TEMPLATES;
  const card = bands.find((c) => String(c.power).startsWith('7'));
  assert.ok(card, 'fixture has a 7000');
  assert.equal(read(card, without7).value, null);
});

test('blank band gives no value', () => {
  assert.equal(readPower(new Uint8Array(90 * 15), 90, 15, 458, POWER_TEMPLATES).value, null);
});

test('classify returns the closest digit', () => {
  const c = bands[0], g = extractGlyphs(Uint8Array.from(c.gray), c.bw, c.bh, c.w);
  assert.equal(classify(g[0], POWER_TEMPLATES).digit, '5');
});
