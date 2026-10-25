import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { powerFromGray, colorFromRgba, resizeBox, MAX_DIGIT_DISTANCE } from '../js/lib/card-image.js';

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/power-crops.json', import.meta.url), 'utf8'));

test('power box is read correctly for every fixture card', () => {
  let n = 0;
  for (const [number, { power, gray }] of Object.entries(fixtures)) {
    const g = Float32Array.from(Buffer.from(gray, 'base64'));
    const r = powerFromGray(g);
    assert.equal(r.value, power, `${number}: expected ${power}, got ${r.value} (${JSON.stringify(r.digits)})`);
    n++;
  }
  assert.ok(n >= 10);
});

test('a blank or damaged crop is not guessed', () => {
  assert.equal(powerFromGray(new Float32Array(140 * 80).fill(30)).value, null);
  assert.equal(powerFromGray(new Float32Array(140 * 80).fill(255)).value, null);
  const noise = Float32Array.from({ length: 140 * 80 }, (_, i) => (i * 7919) % 256);
  assert.equal(powerFromGray(noise).value, null);
});

test('digit distances stay close to the templates', () => {
  for (const { gray } of Object.values(fixtures)) {
    const r = powerFromGray(Float32Array.from(Buffer.from(gray, 'base64')));
    for (const d of r.digits) assert.ok(d.distance < 5, `distance ${d.distance}`);
  }
});

test('color from hue buckets', () => {
  const px = (r, g, b, n = 400) => Uint8ClampedArray.from({ length: n * 4 }, (_, i) => [r, g, b, 255][i % 4]);
  assert.equal(colorFromRgba(px(230, 190, 20)), 'Yellow');
  assert.equal(colorFromRgba(px(40, 160, 70)), 'Green');
  assert.equal(colorFromRgba(px(210, 40, 40)), 'Red');
  assert.equal(colorFromRgba(px(40, 110, 210)), 'Blue');
  assert.equal(colorFromRgba(px(130, 130, 130)), null, 'grey has no color');
  assert.equal(colorFromRgba(px(230, 190, 20, 20)), null, 'too few colored pixels');
});

test('resizeBox averages areas', () => {
  const src = Float32Array.from([0, 10, 20, 30]);
  assert.deepEqual([...resizeBox(src, 2, 2, 1, 1)], [15]);
  assert.deepEqual([...resizeBox(src, 2, 2, 2, 2)], [0, 10, 20, 30]);
});
