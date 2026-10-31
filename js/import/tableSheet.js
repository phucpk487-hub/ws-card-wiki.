// Reader for card sheets laid out as one table per card (an HTML page printed to PDF):
//
//        |            Card name           |
//        | Level | Cost | Power | Trait 1 | Trait 2 | Trait 3 |
//        |  0    |  0   | 1000  | Thief   |         |         |
//        | Card No. | Rarity | Color | Souls | Trigger 1 | Trigger 2 |
//        | P5X/SZ10-001 | RR | Yellow | 1 | - |  |
//        |                  Effect                              |
//        | effect text ...                                      |
//
// with the card picture(s) to the left and right of the table. Unlike the other sheet type, every value is printed as text,
// so power, soul, colour, traits and triggers come straight from the PDF. Pure functions on the page model (see pdfReader.js).
import { canonicalTrigger } from '../lib/triggers.js';

const NUM_RE = /^[A-Z0-9]+\/[A-Z0-9]+-\d+[A-Za-z]*$/;
const COLORS = ['Yellow', 'Green', 'Red', 'Blue', 'Purple', 'White', 'Colorless'];
const ROW1 = ['Level', 'Cost', 'Power', 'Trait', 'Trait', 'Trait'];
const ROW2 = ['Card', 'Rarity', 'Color', 'Souls', 'Trigger', 'Trigger'];

/** True when the pages look like per-card tables (labels Level/Cost/Power … Rarity/Color/Souls and a card number). */
export function isTableSheet(pages) {
  for (const p of pages) {
    const s = new Set(p.words.map((w) => w.str.trim()));
    if (['Level', 'Cost', 'Rarity', 'Color', 'Souls', 'Effect'].every((k) => s.has(k) || [...s].some((x) => x.startsWith(`${k} `)))
      && p.words.some((w) => NUM_RE.test(w.str.trim()))) return true;
  }
  return false;
}

/** Group words that share a baseline into lines, top to bottom. */
function linesOf(words) {
  const sorted = [...words].sort((a, b) => a.base - b.base || a.x0 - b.x0), lines = [];
  for (const w of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.base - w.base) < 2.5) last.words.push(w); else lines.push({ base: w.base, words: [w] });
  }
  for (const l of lines) { l.words.sort((a, b) => a.x0 - b.x0); l.text = l.words.map((w) => w.str).join(' ').replace(/\s+/g, ' ').trim(); }
  return lines;
}

/** Left edge of each label cell on a header line: the first word of each label, in order. */
function columnStarts(line, labels) {
  const starts = []; let k = 0;
  for (const w of line.words) {
    const t = w.str.trim();
    if (k < labels.length && (t === labels[k] || t.startsWith(`${labels[k]} `))) { starts.push(w.x0); k++; }
  }
  return starts.length === labels.length ? starts : null;
}

const cellsOf = (words, starts) => {
  const out = starts.map(() => []);
  for (const w of words) {
    const c = (w.x0 + w.x1) / 2;
    let col = 0; for (let i = 0; i < starts.length; i++) if (c >= starts[i] - 6) col = i;
    out[col].push(w);
  }
  return out.map((ws) => ws.sort((a, b) => a.x0 - b.x0).map((w) => w.str).join(' ').replace(/\s+/g, ' ').trim());
};

/** Split effect lines into abilities: a new one starts at AUTO / CONT / ACT or after a line that ends a sentence. */
function effectParagraphs(lines) {
  const out = [];
  for (const t of lines) {
    const startsNew = /^(AUTO|CONT|ACT)\b/.test(t) || !out.length || /[.!?"”)」]$/.test(out[out.length - 1]);
    if (startsNew) out.push(t); else out[out.length - 1] += ` ${t}`;
  }
  return out.map((p) => p.replace(/^(AUTO|CONT|ACT)\b\s*-?\s*/, (m, a) => `[${a}] `).trim());
}

export function parseTableSheet(pages) {
  const cards = [], warnings = [];
  for (const page of pages) {
    const lines = linesOf(page.words);
    const heads = lines.map((l, i) => ({ l, i, starts: columnStarts(l, ROW1) })).filter((h) => h.starts);
    heads.forEach((h, k) => {
      const nameLine = lines[h.i - 1];
      const nextHead = heads[k + 1];
      const blockEnd = nextHead ? lines[nextHead.i - 1].base - 2 : Infinity;
      const row2 = lines.slice(h.i + 1).find((l) => l.base < blockEnd && columnStarts(l, ROW2));
      if (!row2) { warnings.push(`table ${k + 1} on page ${page.index + 1}: could not find the Card No. row`); return; }
      const starts2 = columnStarts(row2, ROW2);
      const effHead = lines.find((l) => l.base > row2.base && l.base < blockEnd && l.text === 'Effect');
      const within = (a, b) => page.words.filter((w) => w.base > a + 1 && w.base < b - 1);
      const v1 = cellsOf(within(h.l.base, row2.base), h.starts);
      const v2 = cellsOf(within(row2.base, effHead ? effHead.base : blockEnd), starts2);
      const effLines = effHead ? lines.filter((l) => l.base > effHead.base + 1 && l.base < blockEnd && l.text).map((l) => l.text) : [];

      const number = v2[0].split(' ').find((t) => NUM_RE.test(t)) || v2[0];
      const [level, cost, power] = [v1[0], v1[1], v1[2]].map((x) => (/^\d+$/.test(x) ? +x : null));
      const traits = v1.slice(3).filter((t) => t && t !== '-');
      const soul = /^\d+$/.test(v2[3]) ? +v2[3] : null;
      const triggers = v2.slice(4).map((t) => t.trim()).filter((t) => t && t !== '-').map((t) => canonicalTrigger(t));
      const color = COLORS.find((c) => c.toLowerCase() === (v2[2] || '').toLowerCase()) || null;
      let type = 'Character';
      if (level === null && cost === null) type = 'Climax';
      else if (power === null) type = 'Event';
      const rarity = v2[1] || '';
      const card = {
        number, rarities: rarity ? [rarity] : [], effect: effectParagraphs(effLines), notes: [], triggers, traits,
        level: type === 'Climax' ? null : level, cost: type === 'Climax' ? null : cost, type, name: nameLine ? nameLine.text : number,
        printTag: null, color, power: type === 'Character' ? power : null, soul: type === 'Character' ? soul : null,
        _table: true,
      };
      if (!NUM_RE.test(number)) warnings.push(`table ${k + 1} on page ${page.index + 1}: no card number found (read "${number}")`);
      if (type === 'Character' && power === null) warnings.push(`${number}: no power in the table`);

      // pictures: those whose top edge falls inside this table's rows; the left-most is the card, the others are alternate art
      const top = nameLine ? nameLine.base - 14 : h.l.base - 28;
      const bottom = nextHead ? lines[nextHead.i - 1].base - 14 : Infinity;
      const mine = page.images.map((im, i) => ({ ...im, i })).filter((im) => im.top >= top - 6 && im.top < bottom && im.x1 - im.x0 > 40).sort((a, b) => a.x0 - b.x0);
      card._img = { page: page.index, main: mine.length ? mine[0].i : null, alts: mine.slice(1).map((im) => im.i) };
      cards.push(card);
    });
  }
  const seen = new Set();
  for (const c of cards) { if (seen.has(c.number)) warnings.push(`duplicate card number ${c.number}`); seen.add(c.number); }
  const setCode = cards.length ? cards[0].number.replace(/-\d+[A-Za-z]*$/, '') : '';
  return { cards, setCode, warnings };
}
