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

test('a trait-less "(C) 1/0 Event" header is an Event without a warning', () => {
  const r = parseBlock('STS/W140-029', ['(C) 1/0 Event'], ['[ACT] Do something.'], ['C'], []);
  assert.equal(r.type, 'Event'); assert.equal(r.level, 1); assert.equal(r.cost, 0);
});

test('has:counter finds cards with the counter icon', () => {
  const cards = [{ number: 'A', name: 'a', type: 'Event', counter: true }, { number: 'B', name: 'b', type: 'Character', counter: false }, { number: 'C', name: 'c', type: 'Character' }];
  assert.deepEqual(searchCards(cards, { q: 'has:counter' }).items.map((c) => c.number), ['A']);
  assert.deepEqual(searchCards(cards, { q: 'type:event' }).items.map((c) => c.number), ['A']);
});

import { isTableSheet, parseTableSheet } from '../js/import/tableSheet.js';
test('per-card table sheets (Level/Cost/Power, Card No./Rarity/Color/Souls/Trigger) are read as text', () => {
  const pages = JSON.parse(readFileSync(new URL('./fixtures/table-sheet-pages.json', import.meta.url)));
  assert.equal(isTableSheet(pages), true);
  const { cards, setCode } = parseTableSheet(pages);
  assert.equal(setCode, 'P5X/SZ10');
  assert.deepEqual(cards.map((c) => [c.number, c.type, c.name]), [
    ['P5X/SZ10-001', 'Character', 'Persona Thief'], ['P5X/SZ10-022', 'Event', 'Retake Your Desire'], ['P5X/SZ10-025', 'Climax', 'The Phantom Thief Alliance']]);
  const [a, b, c] = cards;
  assert.deepEqual([a.level, a.cost, a.power, a.soul, a.color, a.rarities, a.traits, a.triggers], [0, 0, 1000, 1, 'Yellow', ['RR'], ['Thief'], []]);
  assert.equal(a.effect.length, 2); assert.match(a.effect[0], /^\[AUTO\] When a CX.*effects\."$/); assert.match(a.effect[1], /^\[ACT\] BRAINSTORM/);
  assert.deepEqual([b.level, b.cost, b.power, b.soul], [1, 0, null, null]);
  assert.deepEqual([c.level, c.cost, c.triggers, c.effect], [null, null, ['Choice'], []]);
  assert.deepEqual(cards.map((x) => [x._img.main, x._img.alts.length]), [[0, 1], [2, 1], [4, 1]]);
});

test('a wrapped trait list stays out of the card name', () => {
  const W = (str, x0, base) => ({ str, x0, x1: x0 + str.length * 3.5, base, size: 7.3 });
  const page = { index: 0, width: 792, height: 612, images: [], words: [
    W('DC/W128-059', 52, 75),
    W('(SR) 1/0 Nemu (Anniversary/Magic/Disciplinary', 192, 75.5), W('Committee/Pen)', 192, 83.8),
    W('AUTO', 192, 92), W('- When this attacks, draw 1 card.', 214, 92),
    W('SR', 610, 75),
  ] };
  const { cards } = parseSheet([page]);
  assert.equal(cards[0].name, 'Nemu');
  assert.deepEqual(cards[0].traits, ['Anniversary', 'Magic', 'Disciplinary Committee', 'Pen']);
  assert.equal(cards[0].effect.length, 1);
});

test('a trait list left glued to the name is split off', () => {
  const warnings = [];
  const c = parseBlock('DC/W128-059', ['(SR) 1/0 Nemu (Anniversary/Magic/Disciplinary'], ['Committee/Pen) not closed in the header'], ['SR'], warnings);
  assert.equal(c.name, 'Nemu'); assert.deepEqual(c.traits.slice(0, 2), ['Anniversary', 'Magic']);
});
