import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openZip } from '../js/import/zip.js';
import { sheetList, sheetRows, sheetPictures, pageFromSheet } from '../js/import/xlsx.js';
import { gridToPage, parseCardPage } from '../js/import/cardGrid.js';

const file = () => new Blob([readFileSync(new URL('./fixtures/cards.xlsx', import.meta.url))]);

test('zip: lists entries and reads stored/deflated ones from a Blob', async () => {
  const z = await openZip(file());
  assert.ok(z.has('xl/workbook.xml') && z.has('xl/media/image1.png'));
  assert.match(await z.text('xl/workbook.xml'), /Persona 5X/);
  assert.deepEqual([...(await z.bytes('xl/media/image1.png')).slice(0, 4)], [0x89, 0x50, 0x4e, 0x47]);
  await assert.rejects(openZip(new Blob(['not a zip at all'])), /not a zip/);
});

test('workbook: tab names, cells and floating pictures', async () => {
  const z = await openZip(file()), tabs = await sheetList(z);
  assert.deepEqual(tabs.map((t) => t.name), ['Other', 'Persona 5X']);
  const rows = await sheetRows(z, tabs[1].path);
  assert.equal(rows[1][3], 'Protagonist & Janosik / WONDER'); assert.equal(rows[5][3], 'P5X/SZ10-002'); assert.equal(rows[3][5], '8000');
  const pics = await sheetPictures(z, tabs[1].path);
  assert.equal(pics.length, 6); assert.deepEqual([pics[0].col0, pics[0].row0], [0, 1]); assert.match(pics[0].media, /^xl\/media\/image\d+\.png$/);
});

test('cards from a workbook come with the pictures that sit beside them (card art first, alternates after)', async () => {
  const z = await openZip(file()), tab = (await sheetList(z))[1];
  const page = pageFromSheet(z, await sheetRows(z, tab.path), await sheetPictures(z, tab.path), gridToPage);
  const { cards, warnings } = parseCardPage(page);
  assert.equal(cards.length, 3); assert.deepEqual(warnings, []);
  cards.forEach((c, i) => {
    assert.notEqual(c._img.main, null, c.number); assert.equal(c._img.alts.length, 1, c.number);
    assert.ok(page.images[c._img.main].x0 < page.images[c._img.alts[0]].x0, 'card art is the left-most picture');
    // block i holds pictures 2i (card art) and 2i+1 (alternate)
    assert.equal(c._img.main, 2 * i); assert.equal(c._img.alts[0], 2 * i + 1);
  });
  assert.deepEqual([cards[0].type, cards[1].type, cards[2].type], ['Character', 'Event', 'Climax']);
  assert.equal(cards[0].power, 8000); assert.equal(cards[0].effect.length, 2);
});
