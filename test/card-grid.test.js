import test from 'node:test';
import assert from 'node:assert/strict';
import { gridToPage, parseCardPage } from '../js/import/cardGrid.js';
import { isTrialNumber, splitTrial } from '../js/import/known.js';

const block = (name, lv, cost, pw, traits, no, rar, color, soul, trig, effect) => [
  ['', '', '', name], ['', '', '', 'Level', 'Cost', 'Power', 'Trait 1', 'Trait 2', 'Trait 3'], ['', '', '', lv, cost, pw, ...traits],
  ['', '', '', 'Card No.', 'Rarity', 'Color', 'Souls', 'Trigger 1', 'Trigger 2'], ['', '', '', no, rar, color, soul, ...trig],
  ['', '', '', 'Effect'], ['', '', '', effect],
];
const rows = [
  ...block('Protagonist & Janosik / WONDER', '3', '2', '8000', ['Thief', '', ''], 'P5X/SZ10-002', 'RR', 'Yellow', '2', ['Soul', ''], 'CONT - If you have 2 or more other <Thief> characters, this gets +3000 power.\nAUTO - When this is placed on stage from hand, you may Heal 1.'),
  ...block('Retake Your Desire', '2', '1', '', ['', '', ''], 'P5X/SZ10-030', 'U', 'Yellow', '', ['-', ''], 'Choose 1 of your characters, it gets +1000 power, and "draw, then discard" this turn.'),
  ...block('Phantom Thief Alliance', '', '', '', ['', '', ''], 'P5X/SZ10-070', 'CC', 'Yellow', '', ['Soul', 'Soul'], ''),
];

test('card tab: characters, events and climaxes are read like the PDF tables', () => {
  const { cards, warnings } = parseCardPage(gridToPage(rows));
  assert.equal(cards.length, 3);
  const [c, e, x] = cards;
  assert.deepEqual([c.number, c.name, c.type, c.level, c.cost, c.power, c.soul, c.color], ['P5X/SZ10-002', 'Protagonist & Janosik / WONDER', 'Character', 3, 2, 8000, 2, 'Yellow']);
  assert.deepEqual(c.traits, ['Thief']); assert.deepEqual(c.triggers, ['Soul']); assert.deepEqual(c.rarities, ['RR']);
  assert.equal(c.effect.length, 2); assert.match(c.effect[0], /^\[CONT\] If you have 2 or more/); assert.match(c.effect[1], /^\[AUTO\] When this is placed/);
  assert.deepEqual([e.type, e.power, e.soul], ['Event', null, null]); assert.match(e.effect[0], /draw, then discard/);
  assert.equal(x.type, 'Climax'); assert.deepEqual(warnings, []);
});
test('a tab without the card labels is explained', () => {
  assert.throws(() => parseCardPage(gridToPage([['a', 'b'], ['1', '2']])), /does not look like a card sheet/);
});
test('trial deck numbers (-T01) are accepted without a warning and split from the booster', () => {
  const t = [...block('Booster card', '1', '0', '1000', ['Thief', '', ''], 'P5X/SZ10-001', 'C', 'Yellow', '1', ['-', ''], 'AUTO - Draw.'), ...block('Trial card', '0', '0', '500', ['Thief', '', ''], 'P5X/SZ10-T01', 'TD', 'Yellow', '1', ['-', ''], 'AUTO - Heal.')];
  const { cards, setCode, warnings } = parseCardPage(gridToPage(t));
  assert.equal(cards.length, 2); assert.deepEqual(warnings, []); assert.equal(cards[1].number, 'P5X/SZ10-T01'); assert.equal(setCode, 'P5X/SZ10');
  assert.ok(isTrialNumber('P5X/SZ10-T01') && !isTrialNumber('P5X/SZ10-001') && !isTrialNumber('BD/WE49-T'));
  const parts = splitTrial(cards.map((card) => ({ card })));
  assert.deepEqual([parts.main.length, parts.trial.length], [1, 1]);
});
