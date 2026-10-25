// Turns the positioned text and images of a card-sheet PDF into card records.
// Pure logic, no PDF library or DOM: the PDF reader (pdf-reader.js) supplies `pages`:
//   [{ width, height, items: [{ str, x, top, w, h }], images: [{ x, top, w, h }] }]   (units: PDF points, top = distance from page top)
// Layout assumed: one row per card, left to right = card number | main image | text | alternate images | rarities.
// tools/pdf_to_cards.py implements the same parsing for the command line; test/sheet-parser.test.js keeps them in step.

export const RARITY_TOKENS = ['SSP', 'BDR', 'SP', 'SR', 'RR', 'R', 'U', 'C'];
const NUM_RE = /^([A-Z0-9]+\/[A-Z0-9]+-\d+[A-Za-z]*)$/;
const CHAR_HDR = /^\((\w+)\)\s+(\d+)\/(\d+)\s+(.+?)\s+\((.*)\)\s*$/;
const CX_HDR = /^\((\w+)\)\s+(.+?)\s*CX\s*$/;
const ABILITY = /^(AUTO|CONT|ACT)\b\s*-?\s*([\s\S]*)$/;

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** Cluster images by their left edge, left to right. */
function imageColumns(images, tol = 12) {
  const cols = [];
  for (const im of [...images].sort((a, b) => a.x - b.x)) {
    const c = cols.find((k) => Math.abs(k.x - im.x) <= tol);
    if (c) { c.items.push(im); c.right = Math.max(c.right, im.x + im.w); } else cols.push({ x: im.x, right: im.x + im.w, items: [im] });
  }
  return cols;
}

/** Group text items into lines (sorted top to bottom, words left to right). */
function toLines(items) {
  const sorted = [...items].sort((a, b) => a.top - b.top || a.x - b.x);
  const lines = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.top - it.top) <= Math.max(2.5, it.h * 0.4));
    if (line) line.items.push(it); else lines.push({ top: it.top, h: it.h, items: [it] });
  }
  return lines.map((l) => {
    l.items.sort((a, b) => a.x - b.x);
    let text = '';
    l.items.forEach((it, i) => {
      if (i > 0) {
        const prev = l.items[i - 1];
        const gap = it.x - (prev.x + prev.w);
        const spaced = /\s$/.test(prev.str) || /^\s/.test(it.str);
        if (!spaced && gap > Math.max(0.6, it.h * 0.15)) text += ' ';
      }
      text += it.str;
    });
    return { top: l.top, text: text.replace(/\s+/g, ' ').trim() };
  });
}

function toParagraphs(lines, pitch) {
  const paras = [];
  let cur = null, last = null;
  for (const l of lines) {
    if (!l.text) continue;
    if (cur && last !== null && l.top - last <= pitch * 1.5) cur.push(l.text); else { cur = [l.text]; paras.push(cur); }
    last = l.top;
  }
  return paras.map((p) => p.join(' '));
}

function buildCard(number, paragraphs, rarities, warnings) {
  const header = paragraphs[0] || '';
  const card = {
    number, rarities, effect: [], notes: [], triggers: [], traits: [], level: null, cost: null, type: null, name: null, printTag: null,
  };
  let m = CHAR_HDR.exec(header);
  if (m) {
    Object.assign(card, {
      type: 'Character', printTag: m[1], level: Number(m[2]), cost: Number(m[3]), name: m[4],
      traits: m[5].split('/').map((t) => t.trim()).filter(Boolean),
    });
  } else if ((m = CX_HDR.exec(header))) {
    const kind = m[2].trim();
    Object.assign(card, { type: 'Climax', printTag: m[1], name: `${kind} CX`, triggers: [kind] });
  } else {
    warnings.push(`${number}: unrecognised header "${header}"`);
    card.name = header || number;
    card.type = 'Character';
  }
  for (const raw of paragraphs.slice(1)) {
    const p = raw.replace(/\s+/g, ' ').trim();
    if (/^note:/i.test(p)) {
      const note = p.slice(5).trim();
      card.notes.push(note);
      const t = /Has an? (\w+) Trigger/i.exec(note);
      if (t) {
        const name = t[1][0].toUpperCase() + t[1].slice(1).toLowerCase();
        if (!card.triggers.includes(name)) card.triggers.push(name);
      }
      continue;
    }
    const a = ABILITY.exec(p);
    if (a) card.effect.push(`[${a[1]}] ${a[2]}`.trim());
    else if (card.effect.length) card.effect[card.effect.length - 1] += ` ${p}`;
    else card.effect.push(p);
  }
  return card;
}

/**
 * Parse every page. Returns { cards, imageRefs, warnings } where
 * imageRefs[number] = { page, main: bbox|null, alts: [bbox, ...] } (bbox = { x, top, w, h } in points).
 */
export function parseSheetPages(pages) {
  const warnings = [];
  const cards = [], imageRefs = {};
  const raw = [];
  pages.forEach((page, pageIndex) => {
    const cols = imageColumns(page.images || []);
    const mainCol = cols.length && cols[0].x < page.width * 0.4 ? cols[0] : null;
    const mainRight = mainCol ? mainCol.right : page.width * 0.2;
    const altLeft = cols.length > 1 ? cols[1].x : page.width * 0.6;
    const numberMax = mainCol ? mainCol.x - 1 : mainRight;

    const numbers = page.items.filter((it) => it.x < numberMax && NUM_RE.test(it.str)).sort((a, b) => a.top - b.top);
    const rows = numbers.map((n, i) => ({
      number: n.str, top: n.top, from: n.top - 4, to: i + 1 < numbers.length ? numbers[i + 1].top - 4 : Infinity,
      text: [], rar: [], page: pageIndex, main: null, alts: [],
    }));
    const rowOf = (top) => rows.find((r) => top >= r.from && top < r.to);
    for (const it of page.items) {
      const r = rowOf(it.top);
      if (!r) continue;
      if (it.x >= mainRight - 1 && it.x < altLeft - 1) r.text.push(it);
      else if (it.x >= altLeft - 1) r.rar.push(it); // alternate-art slots hold images only, so any text out here is the rarity cell
    }
    for (const im of page.images || []) {
      if (!rows.length) break;
      const r = rows.reduce((best, x) => (Math.abs(x.top - im.top) < Math.abs(best.top - im.top) ? x : best));
      if (mainCol && mainCol.items.includes(im) && !r.main) r.main = im; else r.alts.push(im);
    }
    for (const r of rows) raw.push({ r, lines: toLines(r.text) });
  });

  // paragraph pitch: the usual distance between wrapped lines, measured across all pages
  const dys = [];
  for (const { lines } of raw) for (let i = 1; i < lines.length; i++) dys.push(lines[i].top - lines[i - 1].top);
  const pitch = median(dys.filter((d) => d > 0 && d < 12)) || 8.4;

  const seen = new Set();
  for (const { r, lines } of raw) {
    const rarities = toLines(r.rar).map((l) => l.text).join(' ').split(/\s*(?:,|&)\s*|\s+/).filter((t) => RARITY_TOKENS.includes(t));
    const card = buildCard(r.number, toParagraphs(lines, pitch), rarities, warnings);
    if (seen.has(card.number)) { warnings.push(`duplicate card number ${card.number}`); continue; }
    seen.add(card.number);
    cards.push(card);
    imageRefs[card.number] = { page: r.page, main: r.main, alts: r.alts.sort((a, b) => a.x - b.x) };
  }
  return { cards, imageRefs, warnings };
}

/** Fill the fields a PDF cannot provide so the record matches the app's card shape. */
export function toAppCard(parsed, { series, setCode, color = null, power = null }) {
  return {
    ...parsed,
    rarity: parsed.rarities[0] || '',
    series, set: setCode, nameJp: null, color, power, soul: null, flavor: '', illustrator: '', image: null, altImages: [],
  };
}

export function guessSetCode(cards) {
  return cards.length ? cards[0].number.replace(/-\d+[A-Za-z]*$/, '') : '';
}
