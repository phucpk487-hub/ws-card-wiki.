// Delete / restore a set. Admin build only (see config.js).
import { deletePack } from '../import/store.js';
import { hideSet, restoreSet } from './hiddenSets.js';
import { resetDb } from './db.js';
import { ADMIN } from './config.js';

/** Imported sets are removed from browser storage; bundled and sample sets are hidden (and can be restored). */
export async function deleteSet(set) {
  if (!ADMIN) throw new Error('Deleting sets is only available in the admin version.');
  if (set.source === 'imported' && set.packId) await deletePack(set.packId);
  else hideSet(set.code);
  resetDb();
}

export function restoreHiddenSet(code) { if (!ADMIN) return; restoreSet(code); resetDb(); }
