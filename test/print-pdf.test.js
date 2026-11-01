import test from 'node:test';
import assert from 'node:assert/strict';
import { buildPdf, printList, PER_PAGE } from '../js/lib/printPdf.js';

const fake = (n) => Array.from({ length: n }, () => ({ jpeg: new Uint8Array([255, 216, 255, 217]), width: 2, height: 3 }));
test('9 cards per A4 page', () => {
  assert.equal(PER_PAGE, 9);
  const s = Buffer.from(buildPdf(fake(10))).toString('latin1');
  assert.match(s, /\/Count 2 /); assert.match(s, /MediaBox \[0 0 595\.28 841\.89\]/); assert.ok(s.endsWith('%%EOF\n'));
  assert.equal(Buffer.from(buildPdf(fake(9))).toString('latin1').match(/\/Count (\d+)/)[1], '1');
});
test('print list repeats copies, or one of each', () => {
  const by = new Map([['A-1', { type: 'Character', level: 1 }], ['A-2', { type: 'Climax' }]]);
  const deck = { cards: { 'A-2': 2, 'A-1': 3 } };
  assert.deepEqual(printList(deck, by), ['A-1', 'A-1', 'A-1', 'A-2', 'A-2']);
  assert.deepEqual(printList(deck, by, { copies: false }), ['A-1', 'A-2']);
});
