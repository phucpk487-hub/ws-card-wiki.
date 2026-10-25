import test from 'node:test';
import assert from 'node:assert/strict';
import { decksToJson, decksFromJson } from '../js/lib/backup.js';

const decks = [{ id: 'a1', name: 'Test', notes: '', cards: { 'X-01': 4, 'X-02': 1 }, created: 5, updated: 9 }];

test('deck backup round-trips', () => {
  const back = decksFromJson(decksToJson(decks));
  assert.equal(back.length, 1); assert.equal(back[0].id, 'a1'); assert.equal(back[0].name, 'Test'); assert.deepEqual(back[0].cards, { 'X-01': 4, 'X-02': 1 });
});

test('deck backup rejects files that are not backups', () => {
  assert.throws(() => decksFromJson('not json'), /not valid JSON/);
  assert.throws(() => decksFromJson('{"hello":1}'), /not a deck backup/);
  assert.throws(() => decksFromJson(JSON.stringify({ app: 'ws-wiki', kind: 'sets', sets: [] })), /not a deck backup/);
});

test('deck backup cleans odd values instead of trusting them', () => {
  const text = JSON.stringify({ app: 'ws-wiki', kind: 'decks', decks: [{ name: 'x'.repeat(200), cards: { A: 99, B: -3, C: 'two', D: 2.4 } }, null, 5] });
  const [d] = decksFromJson(text);
  assert.equal(d.name.length, 80); assert.deepEqual(d.cards, { A: 50, D: 2 });
});
