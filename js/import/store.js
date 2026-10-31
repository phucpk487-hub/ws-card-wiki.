// Persistence for cards the user imports in the browser (IndexedDB).
// Data stays on this device. If IndexedDB is unavailable (some private windows) saves fail
// with a clear error and the caller can keep the import for the current session only.
const DB_NAME = 'ws-wiki-imports', VERSION = 1;

function open() {
  return new Promise((resolve, reject) => {
    let req;
    try { req = indexedDB.open(DB_NAME, VERSION); } catch (e) { return reject(new Error('Browser storage is unavailable here.')); }
    req.onupgradeneeded = () => {
      const db = req.result;
      db.createObjectStore('packs', { keyPath: 'id' });
      db.createObjectStore('images'); // key: "<packId>/<name>" -> Blob
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Could not open browser storage.'));
    req.onblocked = () => reject(new Error('Browser storage is blocked by another tab.'));
  });
}

const done = (tx) => new Promise((resolve, reject) => { tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Save was cancelled (storage may be full).')); });
const wrap = (req) => new Promise((resolve, reject) => { req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });

/** pack: { id, set, cards, savedAt }, images: Map<"<id>/<name>", Blob>. Replaces an existing pack with the same id. */
export async function savePack(pack, images) {
  const db = await open();
  try {
    await removeInside(db, pack.id);
    const tx = db.transaction(['packs', 'images'], 'readwrite');
    tx.objectStore('packs').put(pack);
    for (const [k, blob] of images) tx.objectStore('images').put(blob, k);
    await done(tx);
  } finally { db.close(); }
}

async function removeInside(db, id) {
  const tx = db.transaction(['packs', 'images'], 'readwrite');
  tx.objectStore('packs').delete(id);
  tx.objectStore('images').delete(IDBKeyRange.bound(`${id}/`, `${id}/￿`));
  await done(tx);
}

export async function deletePack(id) {
  const db = await open();
  try { await removeInside(db, id); } finally { db.close(); }
}

/** All saved packs with image references resolved to object URLs. */
export async function loadUserPacks() {
  let db;
  try { db = await open(); } catch { return []; }
  try {
    const packs = await wrap(db.transaction('packs').objectStore('packs').getAll());
    const store = db.transaction('images').objectStore('images');
    const keys = await wrap(store.getAllKeys());
    const blobs = await wrap(store.getAll());
    const urls = new Map(keys.map((k, i) => [k, URL.createObjectURL(blobs[i])]));
    const resolve = (ref) => (ref && ref.startsWith('idb:') ? urls.get(ref.slice(4)) || null : ref || null);
    return packs.map((p) => ({
      ...p,
      cards: p.cards.map((c) => ({ ...c, image: resolve(c.image), altImages: (c.altImages || []).map(resolve).filter(Boolean) })),
    }));
  } finally { db.close(); }
}

export async function listPacks() {
  let db;
  try { db = await open(); } catch { return []; }
  try { return (await wrap(db.transaction('packs').objectStore('packs').getAll())).map((p) => ({ id: p.id, set: p.set, count: p.cards.length, savedAt: p.savedAt })); }
  finally { db.close(); }
}

/** Raw packs plus their image blobs, for backups: [{ pack, images: Map<key, Blob> }]. */
export async function exportRawPacks() {
  const db = await open();
  try {
    const packs = await wrap(db.transaction('packs').objectStore('packs').getAll());
    const store = db.transaction('images').objectStore('images');
    const keys = await wrap(store.getAllKeys());
    const blobs = await wrap(store.getAll());
    return packs.map((pack) => ({
      pack,
      images: keys.map((k, i) => [k, blobs[i]]).filter(([k]) => String(k).startsWith(`${pack.id}/`)),
    }));
  } finally { db.close(); }
}

/** Cards of every saved set without images (used to copy missing traits from a reprint). */
export async function listKnownCards() {
  let db;
  try { db = await open(); } catch { return []; }
  try { return (await wrap(db.transaction('packs').objectStore('packs').getAll())).flatMap((p) => p.cards || []); }
  catch { return []; } finally { db.close(); }
}
