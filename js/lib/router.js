// Tiny hash router: "#/card/SLA%2FS01-001?x=1" -> { path: ['card','SLA/S01-001'], query: URLSearchParams }
export function parseHash(hash = location.hash) {
  const raw = hash.replace(/^#/, '') || '/';
  const [p, q = ''] = raw.split('?');
  const path = p.split('/').filter(Boolean).map((s) => { try { return decodeURIComponent(s); } catch { return s; } });
  return { path, query: new URLSearchParams(q), raw };
}

/** Replace the current URL query without adding history entries or re-rendering the page. */
export function replaceQuery(path, params) {
  const qs = new URLSearchParams(params).toString();
  history.replaceState(history.state, '', `#${path}${qs ? `?${qs}` : ''}`);
}
