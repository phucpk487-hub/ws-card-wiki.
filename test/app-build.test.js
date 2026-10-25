import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../tools/build-app.mjs', import.meta.url));
const build = (edition) => {
  const out = join(mkdtempSync(join(tmpdir(), `wsw-${edition}-`)), 'www');
  execFileSync('node', [script, '--edition', edition, '--out', out], { stdio: 'pipe' });
  return out;
};

test('admin build keeps import, delete-set and the PDF engine', () => {
  const out = build('admin');
  assert.match(readFileSync(join(out, 'js/lib/config.js'), 'utf8'), /ADMIN = true;/);
  for (const f of ['index.html', 'manifest.webmanifest', 'js/pages/import.js', 'js/vendor/pdfjs/pdf.min.mjs', 'data/imports/index.json']) assert.ok(existsSync(join(out, f)), f);
});

test('user build has no import page, PDF engine or import route', () => {
  const out = build('user');
  assert.match(readFileSync(join(out, 'js/lib/config.js'), 'utf8'), /ADMIN = false;/);
  for (const f of ['js/pages/import.js', 'js/vendor', 'js/import/parse.js', 'js/import/images.js']) assert.ok(!existsSync(join(out, f)), `${f} should be left out`);
  assert.ok(!/pages\/import\.js/.test(readFileSync(join(out, 'js/app.js'), 'utf8')));
  for (const f of ['index.html', 'js/pages/decks.js', 'js/pages/sets.js', 'data/imports/index.json']) assert.ok(existsSync(join(out, f)), f);
});

test('capacitor config points at the build folder', () => {
  const c = JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(c.webDir, 'www'); assert.match(c.appId, /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i);
});
