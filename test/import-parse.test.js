import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { parseSheet } from '../js/import/parse.js';

const fx = new URL('./fixtures/bd-we49-pages.json', import.meta.url);
const expectedUrl = new URL('./fixtures/bd-we49/cards.json', import.meta.url);
const ready = existsSync(fx) && existsSync(expectedUrl);

test('browser parser matches the Python converter on the BD/WE49 sheet', { skip: !ready }, () => {
  const pages = JSON.parse(readFileSync(fx, 'utf8'));
  const expected = JSON.parse(readFileSync(expectedUrl, 'utf8')).cards;
  const { cards, setCode, warnings } = parseSheet(pages);
  assert.equal(setCode, 'BD/WE49');
  assert.equal(cards.length, expected.length);
  const diffs = [];
  for (const e of expected) {
    const c = cards.find((x) => x.number === e.number);
    if (!c) { diffs.push(`${e.number}: missing`); continue; }
    for (const k of ['name', 'type', 'level', 'cost', 'printTag']) if (c[k] !== e[k]) diffs.push(`${e.number}.${k}: ${c[k]} != ${e[k]}`);
    // 'Soul' on non-Climax cards comes from the card image (not the PDF text), so it is not part of the text comparison.
    const textTriggers = (x) => (x.type === 'Climax' ? x.triggers : x.triggers.filter((t) => t !== 'Soul'));
    if (JSON.stringify(textTriggers(c)) !== JSON.stringify(textTriggers(e))) diffs.push(`${e.number}.triggers: ${JSON.stringify(c.triggers)} != ${JSON.stringify(e.triggers)}`);
    for (const k of ['traits', 'rarities', 'notes', 'effect']) if (JSON.stringify(c[k]) !== JSON.stringify(e[k])) diffs.push(`${e.number}.${k}: ${JSON.stringify(c[k])} != ${JSON.stringify(e[k])}`);
    const hasImg = !!e.image;
    if (hasImg !== (c._img.main !== null)) diffs.push(`${e.number}: main image mismatch`);
    if (c._img.alts.length !== e.altImages.length) diffs.push(`${e.number}: alt images ${c._img.alts.length} != ${e.altImages.length}`);
  }
  assert.deepEqual(diffs.slice(0, 15), [], `${diffs.length} differences`);
  assert.deepEqual(warnings, []);
});

test('empty or non-sheet input yields no cards', () => {
  assert.equal(parseSheet([{ index: 0, width: 600, height: 800, words: [{ str: 'Hello', x0: 10, x1: 40, base: 20, size: 10 }], images: [] }]).cards.length, 0);
});

import { parseBlock } from '../js/import/parse.js';
import { searchCards } from '../js/lib/search.js';

test('Event headers are read (with or without a trailing trait list)', () => {
  for (const header of ['(EV) 3/0 Non-Stop Drinking', '(EV) 3/0 Non-Stop Drinking ()', '(EV) 3/0 Non-Stop Drinking (Music)']) {
    const c = parseBlock('BTR/W107-E063', [header], ['[ACT] Choose 1 of your characters.'], ['C'], []);
    assert.equal(c.type, 'Event', header);
    assert.equal(c.level, 3); assert.equal(c.cost, 0); assert.equal(c.name, 'Non-Stop Drinking'); assert.equal(c.printTag, 'EV');
  }
  const ch = parseBlock('X/Y-01', ['(CH) 1/0 Someone (Music)'], [], ['C'], []);
  assert.equal(ch.type, 'Character');
});

test('has:counter finds cards with the counter icon', () => {
  const cards = [{ number: 'A', name: 'a', type: 'Event', counter: true }, { number: 'B', name: 'b', type: 'Character', counter: false }, { number: 'C', name: 'c', type: 'Character' }];
  assert.deepEqual(searchCards(cards, { q: 'has:counter' }).items.map((c) => c.number), ['A']);
  assert.deepEqual(searchCards(cards, { q: 'type:event' }).items.map((c) => c.number), ['A']);
});
