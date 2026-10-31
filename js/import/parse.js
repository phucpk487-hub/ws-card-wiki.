// Pure parsing of a card-sheet page model (see pdfReader.js) into card records.
// No DOM, no pdf.js: unit-testable in Node. JS port of tools/pdf_to_cards.py (text part).

export const RARITY_TOKENS = ['SSP', 'BDR', 'SP', 'SR', 'RR', 'R', 'U', 'C'];
const NUM_RE = /^([A-Z0-9]+\/[A-Z0-9]+-\d+[A-Za-z]*)$/;
// Some sheets print the power after the trait list: "(U) 1/0 Nemu (Anniversary/Magic) - 3500".
const CHAR_HDR = /^\((\w+)\)\s+(\d+)\/(\d+)\s+(.+?)\s+\((.*)\)(?:\s*-\s*(\d{3,5}))?\s*$/;
// Events print no traits, so the trailing (…) is optional; the tag in front tells the type.
const EVENT_HDR = /^\((EV|EVENT)\)\s+(\d+)\/(\d+)\s+(.+?)(?:\s+\(([^()]*)\))?\s*$/i;
// Any other "(TAG) level/cost name" header (no trait list): Events by their tag, otherwise a trait-less Character.
const GENERIC_HDR = /^\((\w+)\)\s+(\d+)\/(\d+)\s+(.+?)\s*$/;
const CX_HDR = /^\((\w+)\)\s+(.+?)\s*CX\s*$/;
const ABILITY = /^(AUTO|CONT|ACT)\b\s*-?\s*([\s\S]*)$/;

const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/** Join the words of one visual line, adding a space only where there is a real gap. */
function lineText(words) {
  let out = '', prev = null;
  for (const w of words) {
    if (prev && w.x0 - prev.x1 > 0.12 * (w.size || 6)) out += ' ';
    out += w.str; prev = w;
  }
  return out.replace(/\s+/g, ' ').trim();
}

/** Group words into lines (same baseline), top to bottom, left to right. */
function toLines(words) {
  const sorted = [...words].sort((a, b) => a.base - b.base || a.x0 - b.x0);
  const lines = [];
  for (const w of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.base - w.base) < 2.2) { last.words.push(w); last.size = Math.max(last.size, w.size); }
    else lines.push({ base: w.base, size: w.size, words: [w] });
  }
  for (const l of lines) { l.words.sort((a, b) => a.x0 - b.x0); l.text = lineText(l.words); }
  return lines;
}

/** Split lines into paragraphs where the vertical gap is larger than normal line spacing. */
function toParagraphs(lines) {
  const paras = []; let cur = [], prev = null;
  for (const l of lines) {
    if (prev && l.base - prev.base > 1.6 * Math.max(prev.size, 5)) { paras.push(cur.join(' ')); cur = []; }
    cur.push(l.text); prev = l;
  }
  if (cur.length) paras.push(cur.join(' '));
  return paras.map((p) => p.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export function parseBlock(number, headerLines, paras, rarities, warnings) {
  const card = { number, rarities, effect: [], notes: [], triggers: [], traits: [], level: null, cost: null, type: null, name: null, printTag: null };
  let header = headerLines[0] || '';
  let rest = paras;
  const isEv = (h) => EVENT_HDR.test(h) && /^\((EV|EVENT)\)/i.test(h);
  let m = CHAR_HDR.exec(header), ev = isEv(header) ? EVENT_HDR.exec(header) : null;
  if (!m && !ev && !CX_HDR.test(header) && paras.length) { // header wrapped onto a second line
    const joined = `${header} ${paras[0]}`;
    if (CHAR_HDR.test(joined) || isEv(joined)) { header = joined; rest = paras.slice(1); m = CHAR_HDR.exec(header); ev = isEv(header) ? EVENT_HDR.exec(header) : null; }
  }
  if (ev || (m && /^(EV|EVENT)$/i.test(m[1]))) {
    const e = ev || EVENT_HDR.exec(header) || m;
    const [tag, level, cost, name, traits] = ev ? [e[1], e[2], e[3], e[4], e[5]] : [m[1], m[2], m[3], m[4], m[5]];
    Object.assign(card, { type: 'Event', printTag: tag.toUpperCase(), level: +level, cost: +cost, name, traits: (traits || '').split('/').map((t) => t.trim()).filter(Boolean) });
  } else if (m) {
    Object.assign(card, { type: 'Character', printTag: m[1], level: +m[2], cost: +m[3], name: m[4], traits: m[5].split('/').map((t) => t.trim()).filter(Boolean) });
    if (m[6]) card._hp = +m[6];
  } else {
    const cx = CX_HDR.exec(header);
    if (cx) { const kind = cx[2].trim(); Object.assign(card, { type: 'Climax', printTag: cx[1], name: `${kind} CX`, triggers: [kind] }); }
    else if ((m = GENERIC_HDR.exec(header))) {
      const ev = /^(EV|EVENT)$/i.test(m[1]) || /^event$/i.test(m[4].trim());   // "(C) 1/0 Event": the card is literally called Event
      const hp = /^(.*?)\s+-\s*(\d{3,5})$/.exec(m[4]);                       // "Mako Vanilla - 2000": power printed after a trait-less name
      Object.assign(card, { type: ev ? 'Event' : 'Character', printTag: m[1].toUpperCase(), level: +m[2], cost: +m[3], name: hp ? hp[1] : m[4] });
      if (hp && !ev) card._hp = +hp[2];
      if (!ev) warnings.push(`${number}: no trait list in header "${header}"; check the type on the review screen`);
    } else { warnings.push(`${number}: unrecognised header "${header}"; set its type on the review screen`); card.name = header || number; card.type = 'Character'; }
  }
  // Safety net: if a trait list is still glued to the name (header cut oddly), split it off rather than lose the traits.
  if (!card.traits.length && card.name) {
    const g = /^(.+?)\s*\(([^()]*)\)?\s*$/.exec(card.name);
    if (g && g[2].includes('/')) { card.name = g[1].trim(); card.traits = g[2].split('/').map((t) => t.trim()).filter(Boolean); warnings.push(`${number}: the trait list was attached to the name; split it off, please check the traits`); }
  }
  for (const p of rest) {
    if (/^note:/i.test(p)) {
      const note = p.slice(5).trim(); card.notes.push(note);
      const t = /Has an? (\w+) Trigger/i.exec(note);
      if (t) { const name = t[1][0].toUpperCase() + t[1].slice(1).toLowerCase(); if (!card.triggers.includes(name)) card.triggers.push(name); }
      continue;
    }
    const a = ABILITY.exec(p);
    if (a) card.effect.push(`[${a[1]}] ${a[2]}`.trim());
    else if (card.effect.length) card.effect[card.effect.length - 1] += ` ${p}`; // "- AUTO …" sub-abilities, "a) … b) …" choices
    else card.effect.push(p);
  }
  return card;
}

/**
 * @param pages page models from readPdf()
 * @returns {{ cards: object[], setCode: string, warnings: string[] }}
 *   each card carries `_img: { page, main: index|null, alts: index[] }` pointing into pages[page].images
 */
export function parseSheet(pages) {
  const cards = [], warnings = [];
  for (const page of pages) {
    const W = page.width, H = page.height;
    const nums = page.words.filter((w) => NUM_RE.test(w.str) && w.x0 < 0.17 * W).sort((a, b) => a.base - b.base);
    if (!nums.length) continue;
    const imgs = page.images.map((im, i) => ({ ...im, i }));
    const left = imgs.filter((im) => im.x0 < 0.25 * W), right = imgs.filter((im) => im.x0 >= 0.25 * W);
    const textLo = left.length ? Math.max(...left.map((im) => im.x1)) - 1 : 0.24 * W;
    const textHi = right.length ? Math.min(...right.map((im) => im.x0)) - 1 : 0.55 * W;
    const rarityLo = textHi; // images hold no text, so anything right of the text column is the rarity cell

    nums.forEach((n, k) => {
      const top = n.base - n.size - 3;
      const bottom = k + 1 < nums.length ? nums[k + 1].base - nums[k + 1].size - 3 : H + 1;
      const rowWords = page.words.filter((w) => w.base >= top && w.base < bottom);
      const text = rowWords.filter((w) => w.x0 >= textLo && w.x0 < textHi);
      const rarityText = rowWords.filter((w) => w.x0 >= rarityLo).map((w) => w.str).join(' ');
      const rarities = (rarityText.match(new RegExp(`\\b(?:${RARITY_TOKENS.join('|')})\\b`, 'g')) || []);
      const lines = toLines(text);
      // A long trait list wraps onto the next line: keep joining lines while a "(" is still open, so the traits stay out of the name.
      let used = lines.length ? 1 : 0, head = lines.length ? lines[0].text : '';
      const open = (t) => (t.match(/\(/g) || []).length - (t.match(/\)/g) || []).length;
      while (used < lines.length && used < 4 && open(head) > 0) { head += ` ${lines[used].text}`; used++; }
      // The line may also break before the trait list ("(C) 1/0 Mako Vanilla" / "(Anniversary/Cooking) - 5500") or before the printed power.
      const whole = (t) => CHAR_HDR.test(t) || (EVENT_HDR.test(t) && /^\((EV|EVENT)\)/i.test(t)) || CX_HDR.test(t);
      if (lines.length && !whole(head) && used < lines.length && /^\(/.test(lines[used].text) && whole(`${head} ${lines[used].text}`)) { head += ` ${lines[used].text}`; used++; }
      if (used < lines.length && /^-\s*\d{3,5}$/.test(lines[used].text) && !/-\s*\d{3,5}$/.test(head)) { head += ` ${lines[used].text}`; used++; }
      const headerLines = lines.length ? [head] : [];
      const paras = toParagraphs(lines.slice(used));
      const card = parseBlock(n.str, headerLines, paras, rarities, warnings);

      // images whose top edge is closest to this row
      const nearest = (im) => nums.reduce((best, m2, j) => (Math.abs(im.top - (m2.base - m2.size)) < Math.abs(im.top - (nums[best].base - nums[best].size)) ? j : best), 0);
      const mine = imgs.filter((im) => nearest(im) === k);
      const main = mine.find((im) => im.x0 < 0.25 * W);
      card._img = { page: page.index, main: main ? main.i : null, alts: mine.filter((im) => im !== main).map((im) => im.i) };
      cards.push(card);
    });
  }
  const seen = new Set();
  for (const c of cards) { if (seen.has(c.number)) warnings.push(`duplicate card number ${c.number}`); seen.add(c.number); }
  const setCode = cards.length ? cards[0].number.replace(/-\d+[A-Za-z]*$/, '') : '';
  return { cards, setCode, warnings };
}
