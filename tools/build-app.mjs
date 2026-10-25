// Packages the web app into a folder Capacitor can wrap (default: www/).
//   node tools/build-app.mjs                      admin edition  -> www/
//   node tools/build-app.mjs --edition user       user edition   -> www/ (no import, no delete-set, no PDF engine)
//   node tools/build-app.mjs --out some/dir
// It also checks that every module the app loads exists, so a missing file fails here, not on a phone.
import { cpSync, mkdirSync, rmSync, readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => { const i = process.argv.indexOf(`--${name}`); return i > -1 ? process.argv[i + 1] : def; };
const edition = arg('edition', 'admin');
if (!['admin', 'user'].includes(edition)) { console.error('--edition must be admin or user'); process.exit(1); }
const out = resolve(root, arg('out', 'www'));

const ADMIN_ONLY = ['js/pages/import.js', 'js/import/images.js', 'js/import/parse.js', 'js/import/pdfReader.js', 'js/import/power.js',
  'js/import/powerLearn.js', 'js/import/powerTemplates.js', 'js/vendor'];
const SKIP = ['js/lib/card-image.js', 'js/lib/pdf-reader.js', 'js/lib/sheet-parser.js', 'js/lib/store.js', 'js/data/digit-templates.js']; // old, unused

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['index.html', 'manifest.webmanifest']) cpSync(join(root, f), join(out, f));
for (const d of ['css', 'icons', 'data', 'js']) {
  cpSync(join(root, d), join(out, d), {
    recursive: true,
    filter: (src) => {
      const rel = relative(root, src).split('\\').join('/');
      if (SKIP.includes(rel)) return false;
      if (edition === 'user' && ADMIN_ONLY.some((p) => rel === p || rel.startsWith(`${p}/`))) return false;
      return true;
    },
  });
}

// Build flavour
const cfgPath = join(out, 'js/lib/config.js');
writeFileSync(cfgPath, readFileSync(cfgPath, 'utf8').replace(/export const ADMIN = (true|false);/, `export const ADMIN = ${edition === 'admin'};`));
if (edition === 'user') {
  const appPath = join(out, 'js/app.js');
  const src = readFileSync(appPath, 'utf8');
  const next = src.replace(/^\s*import: \(\) => import\('\.\/pages\/import\.js'\),\n/m, '');
  if (next === src) { console.error('Could not remove the import route from app.js'); process.exit(1); }
  writeFileSync(appPath, next);
}

// Every module reachable from app.js must exist in the output
const seen = new Set(), missing = [];
const walk = (rel) => {
  if (seen.has(rel)) return; seen.add(rel);
  const file = join(out, rel);
  if (!existsSync(file)) { missing.push(rel); return; }
  if (rel.startsWith('js/vendor/')) return;
  const code = readFileSync(file, 'utf8');
  for (const m of code.matchAll(/(?:from\s+|import\()\s*['"](\.[^'"]+)['"]/g)) walk(normalize(join(dirname(rel), m[1])).split('\\').join('/'));
};
walk('js/app.js');
if (missing.length) { console.error(`Build is missing modules:\n  ${missing.join('\n  ')}`); process.exit(1); }

const size = (p) => readdirSync(p).reduce((n, f) => { const s = statSync(join(p, f)); return n + (s.isDirectory() ? size(join(p, f)) : s.size); }, 0);
console.log(`${edition} edition -> ${relative(root, out)}/  (${seen.size} modules checked, ${(size(out) / 1048576).toFixed(1)} MB)`);
