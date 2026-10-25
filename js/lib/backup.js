// Backups: decks and imported sets as one JSON file each. Pure parts are exported for tests.
import { listDecks, saveDeck } from './deckStore.js';

export const BACKUP_VERSION = 1;

/** Decks -> JSON text. */
export function decksToJson(decks = listDecks()) {
  return JSON.stringify({ app: 'ws-wiki', kind: 'decks', version: BACKUP_VERSION, savedAt: Date.now(), decks }, null, 1);
}

/** JSON text -> clean deck list. Throws a readable error for anything that is not a deck backup. */
export function decksFromJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That file is not a backup (it is not valid JSON).'); }
  if (!data || data.app !== 'ws-wiki' || data.kind !== 'decks' || !Array.isArray(data.decks)) throw new Error('That file is not a deck backup from this app.');
  return data.decks.filter((d) => d && typeof d === 'object' && d.cards && typeof d.cards === 'object').map((d) => ({
    id: String(d.id || ''), name: String(d.name || 'Imported deck').slice(0, 80), notes: String(d.notes || ''),
    cards: Object.fromEntries(Object.entries(d.cards).map(([k, v]) => [k, Math.max(0, Math.min(50, Math.round(Number(v) || 0)))]).filter(([, v]) => v > 0)),
    created: Number(d.created) || 0,
  }));
}

/** Add backed-up decks. A deck whose id already exists is replaced; others are added. Returns how many were restored. */
export function restoreDecks(decks) { decks.forEach((d) => saveDeck(d)); return decks.length; }

/* ---- imported sets (IndexedDB, with images) ---- */
const blobToDataUrl = (b) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(b); });
const dataUrlToBlob = async (u) => (await fetch(u)).blob();

/** Every set imported in this browser, with its card images, as JSON text. */
export async function setsToJson() {
  const { exportRawPacks } = await import('../import/store.js');
  const packs = await exportRawPacks();
  const out = [];
  for (const p of packs) {
    const images = {};
    for (const [k, blob] of p.images) images[k] = await blobToDataUrl(blob);
    out.push({ pack: p.pack, images });
  }
  return JSON.stringify({ app: 'ws-wiki', kind: 'sets', version: BACKUP_VERSION, savedAt: Date.now(), sets: out });
}

/** Restore sets from a backup file's text. Returns the number of sets restored. */
export async function setsFromJson(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('That file is not a backup (it is not valid JSON).'); }
  if (!data || data.app !== 'ws-wiki' || data.kind !== 'sets' || !Array.isArray(data.sets)) throw new Error('That file is not a set backup from this app.');
  const { savePack } = await import('../import/store.js');
  for (const s of data.sets) {
    if (!s.pack || !s.pack.id || !s.pack.set || !Array.isArray(s.pack.cards)) throw new Error('The backup contains a set that is damaged.');
    const images = new Map();
    for (const [k, u] of Object.entries(s.images || {})) images.set(k, await dataUrlToBlob(u));
    await savePack(s.pack, images);
  }
  return data.sets.length;
}
