import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../js/data/cards.js';
import { SETS } from '../js/data/sets.js';
import { searchCards, parseQuery, buildFacets, relatedCards, paramsToQuery, queryToParams, filterText } from '../js/lib/search.js';

const s = (p) => searchCards(CARDS, { pageSize: 100, ...p });
const nums = (r) => r.items.map((c) => c.number);

test('data integrity: unique numbers, valid sets and shapes', () => {
  assert.equal(new Set(CARDS.map((c) => c.number)).size, CARDS.length);
  const codes = new Set(SETS.map((x) => x.code));
  for (const c of CARDS) {
    assert.ok(codes.has(c.set), `${c.number} has unknown set ${c.set}`);
    assert.ok(c.number.startsWith(c.set), `${c.number} should start with ${c.set}`);
    assert.ok(['Character', 'Event', 'Climax'].includes(c.type));
    if (c.type === 'Character') assert.ok(typeof c.power === 'number' && typeof c.soul === 'number');
    if (c.type === 'Climax') assert.ok(c.triggers.length > 0);
  }
});

test('empty query returns everything sorted by number', () => {
  const r = s({});
  assert.equal(r.total, CARDS.length);
  assert.deepEqual(nums(r), [...nums(r)].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
});

test('plain text matches name, effect, number (case-insensitive)', () => {
  assert.deepEqual(nums(s({ q: 'LUNA' })), ['SLA/S01-001']);
  assert.ok(s({ q: 'encore' }).total > 3);
  assert.deepEqual(nums(s({ q: 'sla/w01-002' })), ['SLA/W01-002']);
});

test('multiple terms are ANDed; quotes match phrases; minus excludes', () => {
  const a = s({ q: 'backup level' }).total;
  assert.ok(a > 0 && a <= s({ q: 'backup' }).total);
  assert.ok(s({ q: '"top card"' }).total > 0);
  assert.equal(s({ q: '"card top"' }).total, 0);
  assert.ok(!nums(s({ q: 'encore -discard' })).some((n) => CARDS.find((c) => c.number === n).effect.join(' ').toLowerCase().includes('discard')));
});

test('field queries', () => {
  assert.ok(s({ q: 'trait:magic' }).items.every((c) => c.traits.includes('Magic')));
  assert.ok(s({ q: 'type:climax' }).items.every((c) => c.type === 'Climax'));
  assert.equal(s({ q: 'type:climax' }).total, 4);
  assert.ok(s({ q: 'color:red' }).items.every((c) => c.color === 'Red'));
  assert.ok(s({ q: 'rarity:sr' }).items.every((c) => c.rarity === 'SR'));
  assert.equal(s({ q: 'rarity:c' }).items.some((c) => c.rarity !== 'C'), false);
  assert.ok(s({ q: 'effect:assist' }).total >= 1);
  assert.equal(parseQuery('foo:bar')[0].field, null, 'unknown field falls back to text');
});

test('structured filters combine (AND across groups, OR within)', () => {
  const r = s({ colors: ['Red', 'Blue'], types: ['Character'] });
  assert.ok(r.items.every((c) => ['Red', 'Blue'].includes(c.color) && c.type === 'Character'));
  assert.equal(s({ levels: ['3'] }).items.every((c) => c.level === 3), true);
  assert.ok(s({ levels: ['0'] }).items.every((c) => c.level === 0), 'level 0 must not be treated as "no filter"');
  assert.ok(s({ triggers: ['Soul'] }).items.every((c) => c.triggers.includes('Soul')));
  assert.equal(s({ sets: ['SLA/W01'] }).total, 2);
  assert.equal(s({ series: ['Ember Knights'] }).total, 7);
});

test('no results', () => {
  assert.equal(s({ q: 'zzzzzz' }).total, 0);
  assert.equal(s({ q: 'zzzzzz' }).items.length, 0);
});

test('sorting: level/power high first, name A-Z, rarity rare first', () => {
  const lv = s({ sort: 'level' }).items; assert.equal(lv[0].level, 3);
  const pw = s({ sort: 'power', types: ['Character'] }).items; for (let i = 1; i < pw.length; i++) assert.ok(pw[i - 1].power >= pw[i].power);
  const nm = s({ sort: 'name' }).items; for (let i = 1; i < nm.length; i++) assert.ok(nm[i - 1].name.localeCompare(nm[i].name) <= 0);
  assert.equal(s({ sort: 'rarity' }).items[0].rarity, 'CC');
});

test('pagination clamps and slices', () => {
  const r = searchCards(CARDS, { pageSize: 10, page: 2 });
  assert.equal(r.items.length, 10); assert.equal(r.pages, 3);
  assert.equal(searchCards(CARDS, { pageSize: 10, page: 99 }).page, 3);
  assert.equal(searchCards(CARDS, { pageSize: 10, page: -5 }).page, 1);
});

test('facets and related cards', () => {
  const f = buildFacets(CARDS);
  assert.equal(f.colors.reduce((n, x) => n + x.count, 0), CARDS.length);
  assert.deepEqual(f.types.map((t) => t.value), ['Character', 'Event', 'Climax']);
  const luna = CARDS[0];
  const rel = relatedCards(CARDS, luna);
  assert.ok(rel.length > 0 && rel.every((c) => c.number !== luna.number));
});

test('URL state round-trips', () => {
  const p = { q: 'backup', colors: ['Red'], levels: ['1', '2'], sort: 'power', page: 2, view: 'list' };
  const qs = new URLSearchParams(paramsToQuery(p));
  const back = queryToParams(qs);
  assert.equal(back.q, 'backup'); assert.deepEqual(back.colors, ['Red']); assert.deepEqual(back.levels, ['1', '2']);
  assert.equal(back.sort, 'power'); assert.equal(back.page, 2); assert.equal(back.view, 'list');
  assert.deepEqual(paramsToQuery({ q: '', sort: 'number', page: 1 }), {});
});

test('filterText', () => {
  const items = [{ t: 'Encore rules' }, { t: 'Backup rules' }];
  assert.equal(filterText(items, 'encore', (x) => x.t).length, 1);
  assert.equal(filterText(items, '', (x) => x.t).length, 2);
});

import { displayName } from '../js/lib/ui.js';
test('displayName shows level/cost for Characters and Events, plain name for Climax', () => {
  assert.equal(displayName({ type: 'Character', name: 'Spica', level: 0, cost: 0, soul: 2 }), 'Spica 0/0');
  assert.equal(displayName({ type: 'Event', name: 'Drink', level: 3, cost: 1 }), 'Drink 3/1');
  assert.equal(displayName({ type: 'Climax', name: 'Door CX', level: null, cost: null }), 'Door CX');
  assert.equal(displayName({ type: 'Character', name: 'X', level: null, cost: 1 }), 'X');
});
