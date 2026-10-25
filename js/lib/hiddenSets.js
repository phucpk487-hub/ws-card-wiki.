// Sets an admin has deleted from the bundled data (those files cannot be removed from the browser, so they are hidden instead).
const KEY = 'wsw-hidden-sets-v1';
let mem = null;
const read = () => {
  if (mem) return mem;
  try { const v = JSON.parse(localStorage.getItem(KEY) || '[]'); mem = Array.isArray(v) ? v : []; } catch { mem = []; }
  return mem;
};
const write = () => { try { localStorage.setItem(KEY, JSON.stringify(mem)); } catch { /* kept in memory for this session */ } };
export const hiddenSets = () => [...read()];
export function hideSet(code) { const l = read(); if (!l.includes(code)) { l.push(code); write(); } }
export function restoreSet(code) { mem = read().filter((c) => c !== code); write(); }
