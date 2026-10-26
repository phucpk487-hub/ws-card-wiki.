import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyAt } from '../js/import/trigger.js';

const crops = JSON.parse(readFileSync(new URL('./fixtures/trigger-crops.json', import.meta.url)));

test('trigger icons are recognised on varied artwork, and empty slots stay empty', () => {
  for (const c of crops) {
    const rgba = new Uint8ClampedArray(Buffer.from(c.rgba, 'base64'));
    const r = classifyAt(rgba, c.w, c.h, c.w / 2, c.h / 2, c.hex);
    assert.equal(r ? r.type : null, c.expect, `expected ${c.expect}, got ${r && r.type}`);
  }
});
