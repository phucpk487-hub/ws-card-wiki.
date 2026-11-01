// Update checks and "what's new". Pure helpers (no DOM) so they can be tested.
export const REPO = 'phucpk487-hub/ws-card-wiki.';
export const RELEASES_PAGE = `https://github.com/${REPO}/releases/latest`;

/** The build number written in a release's notes ("Build 41 · …"), or 0. */
export function buildFromNotes(text) { const m = /Build\s+(\d+)/i.exec(text || ''); return m ? +m[1] : 0; }

/** Changes newer than `seen` and not newer than `current`; with nothing seen yet, only the newest entry. */
export function whatsNew(log, seen, current) {
  const have = log.filter((e) => e.from <= current);
  return seen ? have.filter((e) => e.from > seen) : have.slice(0, 1);
}

/** Looks for a newer build. Returns { state: 'new', build, url } | { state: 'current', build } | { state: 'failed' }. Never throws (offline is normal). */
export async function checkForUpdate(current, fetchFn = fetch) {
  try {
    const r = await fetchFn(`https://api.github.com/repos/${REPO}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' }, cache: 'no-store' });
    if (!r.ok) return { state: 'failed' };
    const d = await r.json(), build = buildFromNotes(d.body);
    if (!build) return { state: 'failed' };
    if (build <= current) return { state: 'current', build };
    const apk = (d.assets || []).find((a) => /\.apk$/i.test(a.name));
    return { state: 'new', build, url: apk ? apk.browser_download_url : RELEASES_PAGE };
  } catch { return { state: 'failed' }; }
}
