// Delete / restore a set.
import { deletePack } from '../import/store.js';
import { hideSet, restoreSet } from './hiddenSets.js';
import { resetDb } from './db.js';

/** Imported sets are removed from browser storage; bundled and sample sets are hidden (and can be restored). */
export async function deleteSet(set) {
  if (set.source === 'imported' && set.packId) await deletePack(set.packId);
  else hideSet(set.code);
  resetDb();
}

export function restoreHiddenSet(code) { restoreSet(code); resetDb(); }
