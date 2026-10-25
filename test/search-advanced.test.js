import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { searchCards, parseQuery, describeClause, buildFacets, paramsToQuery, queryToParams } from '../js/lib/search.js';

// Real imported pack: has Characters with power/soul, Events/Climax and icon triggers.
const pack = JSON.parse(readFileSync(new URL('../data/imports/bd-we49/cards.json', import.meta.url), 'utf8'));
const CARDS = pack.cards || pack;
const q = (query, extra = {}) => searchCards(CARDS, { q: query, pageSize: 500, ...extra });
const all = (query) => q(query).items;

test('numeric fields: exact, range, list, comparators', () => {
  assert.ok(all('level:3').length > 0 && all('level:3').every((c) => c.level === 3));
  assert.ok(all('lv:1-2').every((c) => c.level === 1 || c.level === 2));
  assert.ok(all('level:0,3').every((c) => c.level === 0 || c.level === 3));
  assert.ok(all('cost>=2').every((c) => c.cost >= 2));
  assert.ok(all('cost<1').every((c) => c.cost < 1));
  assert.ok(all('soul:2').length > 0 && all('soul:2').every((c) => c.soul === 2));
  assert.ok(all('power>=9000').length > 0 && all('power>=9000').every((c) => c.power >= 9000));
  assert.deepEqual(all('power:5k').map((c) => c.power), all('power:5000').map((c) => c.power));
  assert.ok(all('power:4k-5k').every((c) => c.power >= 4000 && c.power <= 5000));
});

test('cards without a value never match a numeric clause, but negation still works', () => {
  const climax = CARDS.find((c) => c.type === 'Climax');
  assert.ok(!all('soul:1').some((c) => c.number === climax.number));
  assert.ok(all('-soul:1').some((c) => c.number === climax.number));
});

test('color and type accept words, abbreviations and lists', () => {
  assert.equal(q('color:yellow').total, q('color:y').total);
  assert.equal(q('color:yellow,green').total, q('color:yellow').total + q('color:green').total);
  assert.equal(q('type:cx').total, q('type:climax').total);
  assert.equal(q('type:char').total, q('type:character').total);
  assert.equal(q('type:ev').total, q('type:event').total);
});

test('trigger: and has:', () => {
  const soulTrig = all('trigger:soul');
  assert.ok(soulTrig.length > 0 && soulTrig.every((c) => c.triggers.includes('Soul')));
  assert.ok(all('has:trigger').every((c) => c.triggers.length > 0));
  assert.ok(all('has:image').every((c) => c.image));
  assert.equal(q('has:trigger').total + q('-has:trigger').total, CARDS.length);
});

test('clauses combine with AND, and with text', () => {
  const r = all('color:yellow level>=2 soul:2 trigger:soul');
  assert.ok(r.every((c) => c.color === 'Yellow' && c.level >= 2 && c.soul === 2 && c.triggers.includes('Soul')));
  const withText = all('hagumi power>0');
  assert.ok(withText.every((c) => /hagumi/i.test(c.name)));
});

test('structured filters: souls, cost range, power range', () => {
  assert.ok(searchCards(CARDS, { souls: [2], pageSize: 500 }).items.every((c) => c.soul === 2));
  const r = searchCards(CARDS, { costMin: '1', costMax: '2', pageSize: 500 }).items;
  assert.ok(r.length > 0 && r.every((c) => c.cost >= 1 && c.cost <= 2));
  const p = searchCards(CARDS, { powerMin: '5000', pageSize: 500 }).items;
  assert.ok(p.length > 0 && p.every((c) => c.power >= 5000));
});

test('facets expose souls and ranges', () => {
  const f = buildFacets(CARDS);
  assert.deepEqual(f.souls.map((x) => x.value), [1, 2]);
  assert.ok(f.ranges.power.min >= 500 && f.ranges.power.max >= f.ranges.power.min);
});

test('params round-trip keeps the new filters', () => {
  const sp = new URLSearchParams(paramsToQuery({ q: 'x', souls: [2], costMin: '1', powerMax: '9000', sort: 'number', page: 1 }));
  const back = queryToParams(sp);
  assert.deepEqual(back.souls, ['2']); assert.equal(back.costMin, '1'); assert.equal(back.powerMax, '9000');
});

test('describeClause reads naturally; unknown fields stay plain text', () => {
  assert.equal(describeClause(parseQuery('cost>=2')[0]), 'cost is at least 2');
  assert.equal(describeClause(parseQuery('-color:red,blue')[0]), 'NOT color is red or blue');
  assert.equal(describeClause(parseQuery('level:1-2')[0]), 'level is 1 to 2');
  assert.equal(parseQuery('foo>3')[0].field, null);
  assert.equal(parseQuery('BD/WE49-01')[0].field, null);
});
