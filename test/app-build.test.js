import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../tools/build-app.mjs', import.meta.url));

test('app build contains everything the app loads, including import and the PDF engine', () => {
  const out = join(mkdtempSync(join(tmpdir(), 'wsw-app-')), 'www');
  execFileSync('node', [script, '--out', out], { stdio: 'pipe' }); // fails if any module is missing
  for (const f of ['index.html', 'manifest.webmanifest', 'js/pages/import.js', 'js/pages/decks.js', 'js/vendor/pdfjs/pdf.min.mjs', 'data/imports/index.json']) assert.ok(existsSync(join(out, f)), f);
  assert.ok(!existsSync(join(out, 'js/lib/config.js')), 'the admin/user switch is gone');
});

test('capacitor config points at the build folder', () => {
  const c = JSON.parse(readFileSync(new URL('../capacitor.config.json', import.meta.url), 'utf8'));
  assert.equal(c.webDir, 'www'); assert.match(c.appId, /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/i);
});

test('only the Google Play build turns off self-update (Play forbids updating outside the store)', () => {
  const v = readFileSync(new URL('../js/version.js', import.meta.url), 'utf8');
  assert.match(v, /export const STORE = false/);
  const rel = readFileSync(new URL('../.github/workflows/android-release.yml', import.meta.url), 'utf8');
  assert.match(rel, /export const STORE = true/);
  const apk = readFileSync(new URL('../.github/workflows/android.yml', import.meta.url), 'utf8');
  assert.doesNotMatch(apk, /STORE = true/);
});

test('launcher icon files exist and both workflows install them over the template icon', () => {
  for (const f of ['mipmap-xxxhdpi/ic_launcher.png', 'mipmap-xxxhdpi/ic_launcher_foreground.png', 'mipmap-anydpi-v26/ic_launcher.xml', 'values/ic_launcher_background.xml'])
    assert.ok(existsSync(new URL(`../android-icons/res/${f}`, import.meta.url)), f);
  for (const w of ['android.yml', 'android-release.yml']) {
    const y = readFileSync(new URL(`../.github/workflows/${w}`, import.meta.url), 'utf8');
    assert.match(y, /cp -r android-icons\/res/); assert.match(y, /drawable-v24\/ic_launcher_foreground\.xml/);
  }
});
