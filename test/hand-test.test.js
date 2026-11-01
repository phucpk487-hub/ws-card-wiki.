import test from 'node:test';
import assert from 'node:assert/strict';
import { startGame, mulligan, draw, shuffle, summarize, HAND } from '../js/lib/handTest.js';

const seeded = (seed = 1) => () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const nums = Array.from({ length: 50 }, (_, i) => `A-${i}`);

test('start: 5 in hand, 45 left, nothing lost', () => {
  const g = startGame(nums, seeded());
  assert.equal(g.hand.length, HAND); assert.equal(g.deck.length, 45);
  assert.deepEqual([...g.hand, ...g.deck].sort(), [...nums].sort());
});
test('shuffle does not change the input and is random-ish', () => {
  const a = [...nums]; shuffle(a, seeded(3)); assert.deepEqual(a, nums);
  assert.notDeepEqual(shuffle(nums, seeded(3)), nums);
});
test('mulligan: picked cards go to the waiting room, same number drawn, only once', () => {
  const g = startGame(nums, seeded());
  const m = mulligan(g, [0, 3]);
  assert.equal(m.hand.length, 5); assert.equal(m.waiting.length, 2); assert.equal(m.deck.length, 43);
  assert.deepEqual(m.waiting, [g.hand[0], g.hand[3]]); assert.equal(m.mulliganed, true);
  assert.equal(mulligan(m, [0]), m);
  assert.equal(mulligan(g, []), g);
});
test('draw takes the top card; an empty deck stays empty', () => {
  const g = startGame(nums, seeded()), d = draw(g);
  assert.equal(d.hand.length, 6); assert.equal(d.hand[5], g.deck[0]); assert.equal(d.deck.length, 44);
  const tiny = startGame(['X'], seeded()); assert.equal(draw(tiny), tiny);
});
test('summary counts kinds', () => {
  const by = new Map([['A', { type: 'Character', level: 0 }], ['B', { type: 'Climax' }], ['C', { type: 'Event' }]]);
  const s = summarize(['A', 'A', 'B', 'C', 'Z'], by);
  assert.deepEqual([s['Level 0'], s.Climax, s.Events, s.Unknown], [2, 1, 1, 1]);
});
