import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDeck, canAdd, withCard, totalCards, groupDeck, analyze, parseDeckText, exportDeckText, DECK_SIZE } from '../js/lib/deck.js';

const cards = [
  { number: 'T-01', name: 'A', type: 'Character', level: 0, cost: 0, color: 'Red', triggers: ['Soul'] },
  { number: 'T-02', name: 'B', type: 'Character', level: 3, cost: 2, color: 'Blue' },
  { number: 'T-03', name: 'E', type: 'Event', level: 1, cost: 1, color: 'Red' },
  { number: 'T-04', name: 'C', type: 'Climax', color: 'Red' },
  { number: 'T-05', name: 'C2', type: 'Climax', color: 'Blue' },
  { number: 'T-06', name: 'Promo', type: 'Character', level: 0, cost: 0, maxCopies: 50 },
];
const by = new Map(cards.map((c) => [c.number, c]));

test('withCard is immutable and removes at zero', () => {
  const d = emptyDeck(); const d2 = withCard(d, 'T-01', 2);
  assert.deepEqual(d.cards, {}); assert.equal(d2.cards['T-01'], 2);
  assert.deepEqual(withCard(d2, 'T-01', -2).cards, {});
});
test('max 4 copies, with override', () => {
  let d = emptyDeck();
  for (let i = 0; i < 4; i++) d = withCard(d, 'T-01', 1);
  assert.equal(canAdd(d, by.get('T-01'), by).ok, false);
  assert.equal(canAdd(d, by.get('T-06'), by).ok, true);
});
test('max 8 climax and 50 total', () => {
  let d = emptyDeck();
  d = withCard(withCard(d, 'T-04', 4), 'T-05', 4);
  assert.match(canAdd(d, by.get('T-04'), by).reason, /Climax|copies/);
  d = { ...emptyDeck(), cards: { 'T-06': 50 } };
  assert.match(canAdd(d, by.get('T-01'), by).reason, /full/);
});
test('analyze validity and stats', () => {
  const d = { ...emptyDeck(), cards: { 'T-06': 50 } };
  assert.equal(analyze(d, by).valid, true);
  const s = analyze({ ...emptyDeck(), cards: { 'T-01': 4, 'T-03': 2, 'T-04': 3, 'X-99': 1 } }, by);
  assert.equal(s.valid, false);
  assert.equal(s.stats.climax, 3); assert.equal(s.stats.events, 2); assert.equal(s.stats.unknown, 1);
  assert.equal(s.stats.triggers.Soul, 4);
  assert.ok(s.issues.some((i) => /more card/.test(i.text)));
});
test('groupDeck orders groups', () => {
  const g = groupDeck({ ...emptyDeck(), cards: { 'T-04': 1, 'T-02': 2, 'T-01': 1, 'T-03': 1 } }, by);
  assert.deepEqual(g.map((x) => x.label), ['Level 0', 'Level 3', 'Events', 'Climax']);
  assert.equal(g[1].total, 2);
});
test('parse and export round-trip', () => {
  const p = parseDeckText('# my deck\n4 t-01\nT-02 x2\nT-03 // note\n3 ZZ-1\nthis is bad line', by);
  assert.deepEqual(p.cards, { 'T-01': 4, 'T-02': 2, 'T-03': 1, 'ZZ-1': 3 });
  assert.deepEqual(p.unknown, ['ZZ-1']); assert.equal(p.bad.length, 1);
  const d = { ...emptyDeck('X'), cards: { 'T-01': 4, 'T-04': 2 } };
  const back = parseDeckText(exportDeckText(d, by), by);
  assert.deepEqual(back.cards, d.cards); assert.equal(totalCards(d), 6); assert.equal(DECK_SIZE, 50);
});
