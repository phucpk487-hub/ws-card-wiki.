import test from 'node:test';
import assert from 'node:assert/strict';
import { applyCardEdit, applySetEdit } from '../js/lib/editor.js';

const card = { number: 'X/Y-001', name: 'Old', type: 'Character', color: 'Blue', level: 1, cost: 1, power: 3000, soul: 1, counter: false, triggers: [], traits: ['A'], rarities: ['C'], rarity: 'C', effect: ['[AUTO] hi'], image: 'idb:x/y.jpg', altImages: ['idb:x/y-alt1.jpg'], set: 'X/Y', series: 'S' };

test('card edit changes fields and keeps pictures, number and set', () => {
  const o = applyCardEdit(card, { name: ' New ', type: 'Character', color: 'Red', level: '2', cost: '0', power: '3500', soul: '2', counter: true, triggers: 'soul, Draw', traits: 'Music, Band', rarity: 'RR', illustrator: ' Foo ', effect: 'one\n\n two ' });
  assert.deepEqual([o.name, o.color, o.level, o.cost, o.power, o.soul, o.counter], ['New', 'Red', 2, 0, 3500, 2, true]);
  assert.deepEqual(o.traits, ['Music', 'Band']); assert.deepEqual(o.effect, ['one', 'two']); assert.deepEqual(o.rarities, ['RR']);
  assert.equal(o.triggers.length, 2); assert.equal(o.illustrator, 'Foo');
  assert.equal(o.number, card.number); assert.equal(o.image, card.image); assert.deepEqual(o.altImages, card.altImages); assert.equal(o.set, 'X/Y');
});
test('a Climax has no level, cost, power, soul or counter; a bad colour clears it', () => {
  const o = applyCardEdit(card, { name: 'N', type: 'Climax', color: 'Pink', level: '3', power: '500', counter: true });
  assert.deepEqual([o.type, o.level, o.cost, o.power, o.soul, o.counter, o.color], ['Climax', null, null, null, null, false, null]);
});
test('Event keeps level and cost but no power', () => {
  const o = applyCardEdit(card, { name: 'N', type: 'Event', color: 'Red', level: '1', cost: '2', power: '500' });
  assert.deepEqual([o.level, o.cost, o.power, o.soul], [1, 2, null, null]);
});
test('set edit keeps old values for blank required fields', () => {
  const set = { code: 'X/Y', name: 'A', type: 'Booster', series: 'S', releaseDate: '2024-01-01', total: 10, description: 'd' };
  const o = applySetEdit(set, { name: ' ', type: 'Trial Deck', series: 'T', releaseDate: '', total: '12', description: ' hi ' });
  assert.deepEqual([o.name, o.type, o.series, o.releaseDate, o.total, o.description, o.code], ['A', 'Trial Deck', 'T', '2024-01-01', 12, 'hi', 'X/Y']);
});
