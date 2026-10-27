import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyAt } from '../js/import/trigger.js';

const crops = JSON.parse(readFileSync(new URL('./fixtures/trigger-crops.json', import.meta.url)));

test('trigger icons are recognised on varied artwork, and empty slots stay empty', () => {
  for (const c of crops) {
    const rgba = new Uint8ClampedArray(Buffer.from(c.rgba, 'base64'));
    const r = classifyAt(rgba, c.w, c.h, c.w / 2, c.h / 2, c.hex);
    assert.equal(r ? r.type : null, c.expect, `expected ${c.expect}, got ${r && r.type}`);
  }
});

import { classifyClimaxAt } from '../js/import/trigger.js';
import { canonicalTrigger } from '../js/lib/triggers.js';

test('climax cards: one or two trigger icons are read top to bottom', () => {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/climax-crops.json', import.meta.url)));
  for (const c of cases) {
    const got = classifyClimaxAt(new Uint8ClampedArray(Buffer.from(c.rgba, 'base64')), c.w, c.h, c.cx, c.cy, c.hex);
    assert.deepEqual(got, c.expect);
  }
});

test('PDF nicknames map onto one name per icon', () => {
  assert.equal(canonicalTrigger('Door'), 'Come Back');
  assert.equal(canonicalTrigger('Pants'), 'Gate');
  assert.equal(canonicalTrigger('Bar'), 'Treasure');
  assert.equal(canonicalTrigger('soul'), 'Soul');
  assert.equal(canonicalTrigger('come back'), 'Come Back');
});

import { hasCounterAt } from '../js/import/counter.js';

test('counter icon: found on the counter card at several sizes, absent on other cards (including the yellow ALARM diamond)', () => {
  const cases = JSON.parse(readFileSync(new URL('./fixtures/counter-crops.json', import.meta.url)));
  for (const c of cases) {
    const px = new Uint8ClampedArray(Buffer.from(c.rgba, 'base64'));
    assert.equal(hasCounterAt(px, c.w, c.h, c.cx, c.cy, c.size * 5 / 9), c.expect, c.name);
  }
});
