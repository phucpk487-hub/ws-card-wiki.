import test from 'node:test';
import assert from 'node:assert/strict';
import { applySetEdit, swapMainArt } from '../js/lib/editor.js';

test('set edit keeps old values for blank required fields', () => {
  const set = { code: 'X/Y', name: 'A', type: 'Booster', series: 'S', releaseDate: '2024-01-01', total: 10, description: 'd' };
  const o = applySetEdit(set, { name: ' ', type: 'Trial Deck', series: 'T', releaseDate: '', total: '12', description: ' hi ' });
  assert.deepEqual([o.name, o.type, o.series, o.releaseDate, o.total, o.description, o.code], ['A', 'Trial Deck', 'T', '2024-01-01', 12, 'hi', 'X/Y']);
});
test('using an alternate picture swaps it with the main one', () => {
  const c = { image: 'idb:a', altImages: ['idb:b', 'idb:c'] };
  assert.deepEqual(swapMainArt(c, 1), { image: 'idb:c', altImages: ['idb:b', 'idb:a'] });
  assert.deepEqual(swapMainArt({ image: null, altImages: ['idb:b'] }, 0), { image: 'idb:b', altImages: [] });
  assert.equal(swapMainArt(c, 5), c);
});
