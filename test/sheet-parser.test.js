import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { parseSheetPages, guessSetCode, toAppCard } from '../js/lib/sheet-parser.js';

const pages = JSON.parse(readFileSync(new URL('./fixtures/sheet-pages.json', import.meta.url), 'utf8')).pages;
const pyPath = new URL('../data/imports/bd-we49/cards.json', import.meta.url);

test('parses all 60 cards in order with their images', () => {
  const { cards, imageRefs, warnings } = parseSheetPages(pages);
  assert.equal(cards.length, 60);
  assert.deepEqual(warnings, []);
  assert.equal(cards[0].number, 'BD/WE49-01');
  assert.equal(cards[59].number, 'BD/WE49-60');
  assert.equal(guessSetCode(cards), 'BD/WE49');
  assert.equal(cards.filter((c) => c.type === 'Climax').length, 10);
  const noMain = cards.filter((c) => !imageRefs[c.number].main).map((c) => c.number);
  assert.deepEqual(noMain, ['BD/WE49-21'], 'only card 21 lacks an image in this PDF');
  assert.equal(imageRefs['BD/WE49-01'].alts.length, 2);
  assert.equal(imageRefs['BD/WE49-11'].alts.length, 1);
  const total = Object.values(imageRefs).reduce((n, r) => n + (r.main ? 1 : 0) + r.alts.length, 0);
  assert.equal(total, 165, 'every image in the PDF is assigned to a card');
});

test('header, effects, notes and rarities are read correctly', () => {
  const { cards } = parseSheetPages(pages);
  const hagumi = cards[0];
  assert.equal(hagumi.name, 'Hagumi');
  assert.equal(hagumi.level, 0); assert.equal(hagumi.cost, 0);
  assert.deepEqual(hagumi.traits, ['Anniversary', 'Music', 'Hello Happy World']);
  assert.deepEqual(hagumi.rarities, ['BDR', 'SP']);
  assert.deepEqual(hagumi.triggers, ['Soul']);
  assert.equal(hagumi.effect.length, 2);
  assert.match(hagumi.effect[0], /^\[AUTO\] When this is placed on stage from hand, look at up to 2 cards/);
  const kokoro = cards[8];
  assert.deepEqual(kokoro.rarities, ['BDR', 'SP', 'SSP']);
  const choice = cards[10];
  assert.equal(choice.name, 'Choice CX'); assert.equal(choice.type, 'Climax'); assert.deepEqual(choice.triggers, ['Choice']);
  assert.deepEqual(choice.effect, []);
});

test('continuation paragraphs are merged into the previous ability', () => {
  const { cards } = parseSheetPages(pages);
  const c31 = cards.find((c) => c.number === 'BD/WE49-31');
  assert.equal(c31.effect.length, 2);
  assert.match(c31.effect[0], /following 2 abilities, - "AUTO/);
});

test('matches the command-line converter field by field', { skip: !existsSync(pyPath) }, () => {
  const py = JSON.parse(readFileSync(pyPath, 'utf8')).cards;
  const { cards } = parseSheetPages(pages);
  assert.equal(cards.length, py.length);
  const norm = (s) => s.replace(/\s+/g, ' ').trim();
  for (const [i, c] of cards.entries()) {
    const p = py[i];
    for (const k of ['number', 'name', 'type', 'level', 'cost', 'printTag']) assert.equal(c[k], p[k], `${c.number} ${k}`);
    for (const k of ['traits', 'rarities', 'notes']) assert.deepEqual(c[k], p[k], `${c.number} ${k}`);
    // image-derived Soul trigger is not in the PDF text
    const tt = (x) => (x.type === 'Climax' ? x.triggers : x.triggers.filter((t) => t !== 'Soul'));
    assert.deepEqual(tt(c), tt(p), `${c.number} triggers`);
    assert.deepEqual(c.effect.map(norm), p.effect.map(norm), `${c.number} effect`);
  }
});

test('toAppCard fills the app shape', () => {
  const { cards } = parseSheetPages(pages);
  const a = toAppCard(cards[0], { series: 'X', setCode: 'BD/WE49', color: 'Yellow', power: 500 });
  assert.equal(a.set, 'BD/WE49'); assert.equal(a.rarity, 'BDR'); assert.equal(a.power, 500); assert.deepEqual(a.altImages, []);
});

test('pages without cards give no cards and no crash', () => {
  const r = parseSheetPages([{ width: 792, height: 612, items: [{ str: 'hello', x: 100, top: 100, w: 20, h: 8 }], images: [] }]);
  assert.equal(r.cards.length, 0);
});
