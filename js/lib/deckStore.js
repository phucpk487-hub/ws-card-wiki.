// Saves decks on this device. localStorage can be missing or throw (private windows, blocked storage),
// so everything falls back to memory for the current session and reports it via `persistent`.
const KEY = 'wsw-decks-v1';
let memory = null;
export let persistent = true;

function read() {
  if (memory) return memory;
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? JSON.parse(raw) : [];
    memory = Array.isArray(list) ? list : [];
  } catch { memory = []; persistent = false; }
  return memory;
}
function write() {
  try { localStorage.setItem(KEY, JSON.stringify(memory)); persistent = true; } catch { persistent = false; }
}

export const listDecks = () => [...read()].sort((a, b) => b.updated - a.updated);
export const getDeck = (id) => read().find((d) => d.id === id) || null;

export function saveDeck(deck) {
  const list = read();
  const now = Date.now();
  const saved = { ...deck, id: deck.id || `d${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, created: deck.created || now, updated: now };
  const i = list.findIndex((d) => d.id === saved.id);
  if (i >= 0) list[i] = saved; else list.push(saved);
  write();
  return saved;
}

export function deleteDeck(id) {
  memory = read().filter((d) => d.id !== id);
  write();
}

/** Test/maintenance hook: forget the in-memory copy so the next read hits storage. */
export function _reset() { memory = null; persistent = true; }
