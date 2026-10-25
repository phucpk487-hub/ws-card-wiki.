// Keeps imported card packs in this browser (IndexedDB) so they survive reloads.
// A pack: { id, savedAt, set: {...}, cards: [...], images: { "<file>": Blob } }.
// Cards reference images by file name in `image` / `altImages`; loadPacks() swaps them for object URLs.
const DB = 'wsw-imports', STORE = 'packs';

function open() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) { reject(new Error('This browser does not allow saving imports.')); return; }
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open browser storage.'));
  });
}
const tx = async (mode, fn) => {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => { db.close(); resolve(r && r.result); };
    t.onerror = t.onabort = () => { db.close(); reject(t.error || new Error('Browser storage failed (it may be full).')); };
  });
};

export const savePack = (pack) => tx('readwrite', (s) => s.put({ ...pack, savedAt: Date.now() }));
export const deletePack = (id) => tx('readwrite', (s) => s.delete(id));
export const getAllPacks = () => tx('readonly', (s) => s.getAll()).then((r) => r || []);

/** Packs ready for db.js: same shape as an imported cards.json, images as object URLs. */
export async function loadStoredPacks() {
  let packs;
  try { packs = await getAllPacks(); } catch { return []; } // storage blocked (private window): no stored imports
  return packs.map((p) => {
    const urls = {};
    const url = (name) => name && (urls[name] ||= (p.images[name] ? URL.createObjectURL(p.images[name]) : null));
    return {
      id: p.id, stored: true,
      set: p.set,
      cards: p.cards.map((c) => ({ ...c, image: url(c.image), altImages: (c.altImages || []).map(url).filter(Boolean) })),
    };
  });
}

export function packSummaries(packs) {
  return packs.map((p) => ({ id: p.id, name: p.set.name, code: p.set.code, count: p.cards.length, savedAt: p.savedAt, bytes: Object.values(p.images || {}).reduce((n, b) => n + (b.size || 0), 0) }));
}
