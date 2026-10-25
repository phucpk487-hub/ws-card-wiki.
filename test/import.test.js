import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { searchCards } from '../js/lib/search.js';

// The converter's output for a real sheet (card text only, no images) is kept as a test fixture.
const fx = new URL('./fixtures/bd-we49/cards.json', import.meta.url);
const packs = existsSync(fx) ? [JSON.parse(readFileSync(fx, 'utf8'))] : [];

test('imported packs have the shape the app expects', { skip: packs.length === 0 }, () => {
  const seen = new Set();
  for (const { set, cards } of packs) {
    assert.ok(set.code && set.name && set.series);
    for (const c of cards) {
      assert.ok(!seen.has(c.number), `duplicate ${c.number}`); seen.add(c.number);
      assert.ok(c.number.startsWith(set.code), `${c.number} not in set ${set.code}`);
      assert.ok(['Character', 'Event', 'Climax'].includes(c.type), `${c.number} type`);
      assert.ok(Array.isArray(c.effect) && Array.isArray(c.triggers) && Array.isArray(c.traits));
      for (const e of c.effect) assert.match(e, /^\[(AUTO|ACT|CONT)\] \S/, `${c.number} effect tag: ${e}`);
      if (c.type === 'Character') {
        assert.ok(Number.isInteger(c.level) && Number.isInteger(c.cost), `${c.number} level/cost`);
        assert.ok(c.power === null || (c.power > 0 && c.power % 500 === 0), `${c.number} power ${c.power}`);
        assert.ok(c.traits.length > 0, `${c.number} traits`);
      }
      if (c.type === 'Climax') assert.ok(c.triggers.length === 1, `${c.number} climax trigger`);
    }
  }
});

test('imported cards are searchable', { skip: packs.length === 0 }, () => {
  const cards = packs.flatMap((p) => p.cards);
  assert.equal(searchCards(cards, { q: 'type:climax', pageSize: 100 }).total, cards.filter((c) => c.type === 'Climax').length);
  assert.ok(searchCards(cards, { q: 'heal', pageSize: 100 }).total > 0);
  assert.ok(searchCards(cards, { traits: ['Afterglow'], pageSize: 100 }).total > 0);
});
