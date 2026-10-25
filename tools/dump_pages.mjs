// Dev helper: dump a PDF's page model (text + image boxes, no pixels) as JSON for tests.
// usage: node tools/dump_pages.mjs sheet.pdf out.json [path/to/pdfjs-legacy/build/pdf.mjs]
import fs from 'node:fs';
import { readPdf } from '../js/import/pdfReader.js';
const [pdf, out, lib = './node_modules/pdfjs-dist/legacy/build/pdf.mjs'] = process.argv.slice(2);
const pdfjs = await import(lib.startsWith('/') ? lib : new URL(lib, `file://${process.cwd()}/`).href);
const { pages } = await readPdf(new Uint8Array(fs.readFileSync(pdf)), { pdfjs });
const round = (n) => Math.round(n * 100) / 100;
fs.writeFileSync(out, JSON.stringify(pages.map((p) => ({
  index: p.index, width: p.width, height: p.height,
  words: p.words.map((w) => ({ str: w.str, x0: round(w.x0), x1: round(w.x1), base: round(w.base), size: round(w.size) })),
  images: p.images.map((i) => ({ x0: round(i.x0), x1: round(i.x1), top: round(i.top), bottom: round(i.bottom) })),
}))));
console.log('pages', pages.length, 'words', pages.reduce((n, p) => n + p.words.length, 0), 'images', pages.reduce((n, p) => n + p.images.length, 0));
