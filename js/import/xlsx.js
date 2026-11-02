// Reads one tab of an Excel (.xlsx) workbook: its cells (as rows of text) and the pictures floating over it (with the cells they sit on).
// Text parsing is plain string matching so it also runs in Node tests; only decoding a picture needs the browser.
import { openZip } from './zip.js';

const unesc = (s) => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16))).replace(/&amp;/g, '&');
const attrs = (tag) => Object.fromEntries([...tag.matchAll(/([\w:.-]+)="([^"]*)"/g)].map((m) => [m[1], unesc(m[2])]));
const colNum = (L) => [...L].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;
const dirOf = (p) => p.slice(0, p.lastIndexOf('/') + 1);
const resolve = (base, target) => {
  if (target.startsWith('/')) return target.slice(1);
  const out = dirOf(base).split('/').filter(Boolean);
  for (const part of target.split('/')) { if (part === '..') out.pop(); else if (part && part !== '.') out.push(part); }
  return out.join('/');
};
const textOf = (xml) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unesc(m[1])).join('');
const relsOf = async (zip, path) => {
  const rp = `${dirOf(path)}_rels/${path.slice(path.lastIndexOf('/') + 1)}.rels`;
  if (!zip.has(rp)) return {};
  return Object.fromEntries([...(await zip.text(rp)).matchAll(/<Relationship\b[^>]*>/g)].map((m) => { const a = attrs(m[0]); return [a.Id, resolve(path, a.Target)]; }));
};

/** Tabs of the workbook: [{ name, path }]. */
export async function sheetList(zip) {
  const rels = await relsOf(zip, 'xl/workbook.xml');
  return [...(await zip.text('xl/workbook.xml')).matchAll(/<sheet\b[^>]*>/g)].map((m) => { const a = attrs(m[0]); return { name: a.name, path: rels[a['r:id']] }; }).filter((s) => s.path);
}

/** Cells of one tab as rows of strings. */
export async function sheetRows(zip, path) {
  const shared = zip.has('xl/sharedStrings.xml') ? [...(await zip.text('xl/sharedStrings.xml')).matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1])) : [];
  const xml = await zip.text(path), rows = [];
  for (const m of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const a = attrs(m[1]), ref = /^([A-Z]+)(\d+)$/.exec(a.r || ''); if (!ref || !m[2]) continue;
    const v = /<v>([\s\S]*?)<\/v>/.exec(m[2]); let val = '';
    if (a.t === 's') val = v ? shared[+v[1]] ?? '' : '';
    else if (a.t === 'inlineStr') val = textOf(m[2]);
    else if (v) val = unesc(v[1]).replace(/^(-?\d+)\.0+$/, '$1');
    if (val === '') continue;
    const r = +ref[2] - 1, c = colNum(ref[1]);
    (rows[r] ||= [])[c] = val;
  }
  for (let i = 0; i < rows.length; i++) rows[i] = rows[i] ? Array.from(rows[i], (x) => x ?? '') : [];
  return rows;
}

/** Pictures floating over a tab: [{ col0, row0, col1, row1, media }] (0-based cells; media is the file inside the zip). */
export async function sheetPictures(zip, path) {
  const xml = await zip.text(path), d = /<drawing\b[^>]*r:id="([^"]+)"/.exec(xml);
  if (!d) return [];
  const drawing = (await relsOf(zip, path))[d[1]]; if (!drawing || !zip.has(drawing)) return [];
  const media = await relsOf(zip, drawing), out = [];
  const num = (s, re) => { const m = re.exec(s); return m ? +m[1] : null; };
  for (const m of (await zip.text(drawing)).matchAll(/<(?:\w+:)?(twoCellAnchor|oneCellAnchor)\b[\s\S]*?<\/(?:\w+:)?\1>/g)) {
    const block = m[0], emb = /<(?:\w+:)?blip\b[^>]*r:embed="([^"]+)"/.exec(block); if (!emb || !media[emb[1]]) continue;
    const from = /<(?:\w+:)?from>([\s\S]*?)<\/(?:\w+:)?from>/.exec(block), to = /<(?:\w+:)?to>([\s\S]*?)<\/(?:\w+:)?to>/.exec(block);
    if (!from) continue;
    const col0 = num(from[1], /<(?:\w+:)?col>(\d+)</), row0 = num(from[1], /<(?:\w+:)?row>(\d+)</);
    let col1, row1;
    if (to) { col1 = num(to[1], /<(?:\w+:)?col>(\d+)</); row1 = num(to[1], /<(?:\w+:)?row>(\d+)</); }
    else { const ext = /<(?:\w+:)?ext\b[^>]*cx="(\d+)"[^>]*cy="(\d+)"/.exec(block); col1 = col0 + (ext ? Math.floor(+ext[1] / 609600) : 0); row1 = row0 + (ext ? Math.floor(+ext[2] / 190500) : 0); }
    out.push({ col0, row0, col1: Math.max(col0, col1), row1: Math.max(row0, row1), media: media[emb[1]] });
  }
  return out;
}

/** A page model for the table reader: cells as words, pictures with their position and a pixels() that decodes them in the browser. */
export function pageFromSheet(zip, rows, pictures, gridToPage) {
  const page = gridToPage(rows);
  page.images = pictures.map((p) => ({
    x0: p.col0 * 100, x1: p.col1 * 100 + 100, top: ((p.row0 + p.row1) / 2) * 100 + 50, bottom: p.row1 * 100 + 100,
    pixels: async () => {
      const bmp = await createImageBitmap(await zip.blob(p.media));
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      c.getContext('2d', { willReadFrequently: true }).drawImage(bmp, 0, 0); bmp.close?.();
      return c;
    },
  }));
  return page;
}

export { openZip };
