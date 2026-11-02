import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSheetLink, csvUrls, parseCsv, parseSheetCsv, looksLikeHtml } from '../js/import/sheetLink.js';

const ID = '1SllQBzw6RxMnQIsnhulyGrzjvjojsAKk4yFmqDHpoao';
const q = (s) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
const csv = (rows) => rows.map((r) => r.map(q).join(',')).join('\n');
const block = (name, lv, cost, pw, traits, no, rar, color, soul, trig, effect) => [
  ['', '', '', name], ['', '', '', 'Level', 'Cost', 'Power', 'Trait 1', 'Trait 2', 'Trait 3'], ['', '', '', lv, cost, pw, ...traits],
  ['', '', '', 'Card No.', 'Rarity', 'Color', 'Souls', 'Trigger 1', 'Trigger 2'], ['', '', '', no, rar, color, soul, ...trig],
  ['', '', '', 'Effect'], ['', '', '', effect],
];
const sheet = csv([
  ...block('Protagonist & Janosik / WONDER', '3', '2', '8000', ['Thief', '', ''], 'P5X/SZ10-002', 'RR', 'Yellow', '2', ['Soul', ''], 'CONT - If you have 2 or more other <Thief> characters, this gets +3000 power.\nAUTO - When this is placed on stage from hand, you may Heal 1.'),
  ...block('Retake Your Desire', '2', '1', '', ['', '', ''], 'P5X/SZ10-030', 'U', 'Yellow', '', ['-', ''], 'Choose 1 of your characters, it gets +1000 power, and "draw, then discard" this turn.'),
  ...block('Phantom Thief Alliance', '', '', '', ['', '', ''], 'P5X/SZ10-070', 'CC', 'Yellow', '', ['Soul', 'Soul'], ''),
]);

test('sheet links: id and tab number are found; other text is not a link', () => {
  assert.deepEqual(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=drivesdk`), { id: ID, gid: null });
  assert.deepEqual(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=1829`), { id: ID, gid: '1829' });
  assert.equal(parseSheetLink('https://example.com/x'), null); assert.equal(parseSheetLink(''), null);
});
test('addresses: tab number uses the exact export, a name falls back to the visualization endpoint', () => {
  const a = csvUrls({ id: ID, gid: null }, '1829'); assert.match(a[0].url, /export\?format=csv&gid=1829$/); assert.equal(a[0].exact, true);
  const b = csvUrls({ id: ID, gid: null }, 'Persona 5X'); assert.match(b[0].url, /sheet=Persona%205X$/); assert.equal(b.length, 1);
  assert.match(csvUrls({ id: ID, gid: '7' }, '')[0].url, /gid=7$/);
});
test('csv: quotes, commas and line breaks inside cells', () => {
  assert.deepEqual(parseCsv('a,"b,""c""",d\r\n"x\ny",,z\n'), [['a', 'b,"c"', 'd'], ['x\ny', '', 'z']]);
  assert.ok(looksLikeHtml('<!DOCTYPE html><html>')); assert.ok(!looksLikeHtml('a,b'));
});
test('card tab: characters, events and climaxes are read like the PDF tables', () => {
  const { cards, warnings } = parseSheetCsv(sheet);
  assert.equal(cards.length, 3);
  const [c, e, x] = cards;
  assert.deepEqual([c.number, c.name, c.type, c.level, c.cost, c.power, c.soul, c.color], ['P5X/SZ10-002', 'Protagonist & Janosik / WONDER', 'Character', 3, 2, 8000, 2, 'Yellow']);
  assert.deepEqual(c.traits, ['Thief']); assert.deepEqual(c.triggers, ['Soul']); assert.deepEqual(c.rarities, ['RR']);
  assert.equal(c.effect.length, 2); assert.match(c.effect[0], /^\[CONT\] If you have 2 or more/); assert.match(c.effect[1], /^\[AUTO\] When this is placed/);
  assert.deepEqual([e.type, e.power, e.soul], ['Event', null, null]); assert.match(e.effect[0], /draw, then discard/);
  assert.equal(x.type, 'Climax'); assert.equal(c._img.main, null); assert.deepEqual(warnings, []);
});
test('errors: a sign-in page and a wrong tab are explained', () => {
  assert.throws(() => parseSheetCsv('<!DOCTYPE html><html>'), /Anyone with the link/);
  assert.throws(() => parseSheetCsv('a,b\n1,2'), /does not look like a card sheet/);
});

test('picture import: the PDF address needs a tab number', async () => {
  const { pdfUrl } = await import('../js/import/sheetLink.js');
  assert.equal(pdfUrl({ id: ID, gid: null }, 'Persona 5X'), null);
  assert.match(pdfUrl({ id: ID, gid: null }, '1829'), /export\?format=pdf&gid=1829&/);
  assert.match(pdfUrl({ id: ID, gid: '77' }, ''), /gid=77&/);
});

test('trial deck numbers (-T01) are accepted without a warning and split from the booster', async () => {
  const { isTrialNumber, splitTrial } = await import('../js/import/known.js');
  const t = csv([...block('Booster card', '1', '0', '1000', ['Thief', '', ''], 'P5X/SZ10-001', 'C', 'Yellow', '1', ['-', ''], 'AUTO - Draw.'), ...block('Trial card', '0', '0', '500', ['Thief', '', ''], 'P5X/SZ10-T01', 'TD', 'Yellow', '1', ['-', ''], 'AUTO - Heal.')]);
  const { cards, setCode, warnings } = parseSheetCsv(t);
  assert.equal(cards.length, 2); assert.deepEqual(warnings, []); assert.equal(cards[1].number, 'P5X/SZ10-T01'); assert.equal(setCode, 'P5X/SZ10');
  assert.ok(isTrialNumber('P5X/SZ10-T01') && !isTrialNumber('P5X/SZ10-001') && !isTrialNumber('BD/WE49-T'));
  const parts = splitTrial(cards.map((card) => ({ card })));
  assert.deepEqual([parts.main.length, parts.trial.length], [1, 1]);
});
