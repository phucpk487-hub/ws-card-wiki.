// Data access layer. Everything the UI needs from "the database" goes through here.
// Today it reads bundled modules after a short simulated latency. To use a real backend
// (REST, SQLite in Capacitor, etc.) only this file needs to change.
import { CARDS } from '../data/cards.js';
import { SETS } from '../data/sets.js';

const TODAY = new Date().toISOString().slice(0, 10);
import { loadUserPacks } from '../import/store.js';
import { hiddenSets } from './hiddenSets.js';

const IMPORT_INDEX = 'data/imports/index.json';
let cache = null;

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function validate(cards) {
  const seen = new Set();
  for (const c of cards) {
    if (!c.number || !c.name) throw new Error('Invalid card record: missing number or name');
    if (seen.has(c.number)) throw new Error(`Duplicate card number: ${c.number}`);
    seen.add(c.number);
  }
}

/** Imported packs (made by tools/pdf_to_cards.py). No index file simply means "no imports". */
async function loadImports() {
  let res;
  try { res = await fetch(IMPORT_INDEX, { cache: 'no-cache' }); } catch { return null; }
  if (!res.ok) return null;
  const index = await res.json();
  const packs = [];
  for (const url of index.packs || []) {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) throw new Error(`Could not load imported card pack ${url} (HTTP ${r.status}).`);
    packs.push(await r.json());
  }
  return { includeSample: !!index.includeSample, packs };
}

/** Load the whole dataset once. Rejects on failure; the next call retries. */
export function loadDb() {
  if (cache) return cache;
  cache = (async () => {
    await wait(350);
    // Test hook: add ?fail=1 to the page URL to see the error state.
    if (new URLSearchParams(location.search).has('fail')) throw new Error('Could not load the card database (simulated failure).');
    const imported = await loadImports();
    const mine = await loadUserPacks().catch(() => []); // cards imported in this browser
    const packs = [...(imported ? imported.packs : []), ...mine.map((p) => ({ ...p, _mine: true }))];
    const useSample = !!(imported && imported.includeSample);
    const byNumber = new Map(), setMap = new Map();
    if (useSample) {
      for (const c of CARDS) byNumber.set(c.number, { ...c });
      for (const s of SETS) setMap.set(s.code, { ...s, source: 'sample' });
    }
    for (const pack of packs) { // later packs win, so your own imports override bundled ones
      for (const c of pack.cards) byNumber.set(c.number, { ...c });
      setMap.set(pack.set.code, { ...pack.set, source: pack._mine ? 'imported' : 'bundled', packId: pack._mine ? pack.id : null });
    }
    const hidden = new Set(hiddenSets()); // sets the person deleted
    const cards = [...byNumber.values()].filter((c) => !hidden.has(c.set));
    const setList = [...setMap.values()].filter((s) => !hidden.has(s.code));
    validate(cards);
    const sets = setList.map((s) => ({
      ...s,
      upcoming: !!s.releaseDate && s.releaseDate > TODAY,
      cardCount: cards.filter((c) => c.set === s.code).length,
    }));
    return { cards, sets };
  })();
  cache.catch(() => { cache = null; });
  return cache;
}

/** Forget the cached dataset so the next loadDb() re-reads imports (call after saving or deleting an import). */
export function resetDb() { cache = null; }

/** Import additional/real cards at runtime (same shape as data/cards.js). */
export async function importCards(records) {
  const db = await loadDb();
  validate([...db.cards, ...records].filter((c, i, a) => a.findIndex((x) => x.number === c.number) === i));
  for (const r of records) {
    const i = db.cards.findIndex((c) => c.number === r.number);
    if (i >= 0) db.cards[i] = r; else db.cards.push(r);
  }
  for (const s of db.sets) s.cardCount = db.cards.filter((c) => c.set === s.code).length;
  return db;
}

export const findCard = (db, number) => db.cards.find((c) => c.number === number) || null;
export const findSet = (db, code) => db.sets.find((s) => s.code === code) || null;
export const cardsInSet = (db, code) => db.cards.filter((c) => c.set === code).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
