// Recently viewed cards and the remembered grid/list choice. Storage may throw (private mode): everything degrades to "none".
const KEY = 'wsw-recent-v1', VIEW = 'wsw-view-v1', MAX = 12;
const get = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
const set = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

export function recentNumbers() {
  try { const a = JSON.parse(get(KEY) || '[]'); return Array.isArray(a) ? a.filter((x) => typeof x === 'string') : []; } catch { return []; }
}
export function pushRecent(number) {
  set(KEY, JSON.stringify([number, ...recentNumbers().filter((n) => n !== number)].slice(0, MAX)));
}
export const savedView = () => (get(VIEW) === 'list' ? 'list' : 'grid');
export const saveView = (v) => set(VIEW, v === 'list' ? 'list' : 'grid');
