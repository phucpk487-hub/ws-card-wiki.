import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFromNotes, whatsNew, checkForUpdate } from '../js/lib/updates.js';

const log = [{ from: 41, notes: ['a'] }, { from: 40, notes: ['b'] }, { from: 39, notes: ['c'] }];
test('build number is read from release notes', () => { assert.equal(buildFromNotes('Build 41 · Debug build'), 41); assert.equal(buildFromNotes('Debug build'), 0); });
test('what is new: everything since the last seen build, only the newest on a first run', () => {
  assert.deepEqual(whatsNew(log, 39, 41).map((e) => e.from), [41, 40]);
  assert.deepEqual(whatsNew(log, 0, 41).map((e) => e.from), [41]);
  assert.deepEqual(whatsNew(log, 41, 41), []);
  assert.deepEqual(whatsNew(log, 0, 40).map((e) => e.from), [40]);
});
test('update check: newer build found, same build and failures ignored', async () => {
  const ok = (body) => async () => ({ ok: true, json: async () => ({ body, assets: [{ name: 'ws-card-wiki.apk', browser_download_url: 'https://x/a.apk' }] }) });
  assert.deepEqual(await checkForUpdate(40, ok('Build 41 · x')), { build: 41, url: 'https://x/a.apk' });
  assert.equal(await checkForUpdate(41, ok('Build 41 · x')), null);
  assert.equal(await checkForUpdate(41, async () => { throw new Error('offline'); }), null);
  assert.equal(await checkForUpdate(41, async () => ({ ok: false })), null);
});
