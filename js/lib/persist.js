// Ask the browser / WebView not to evict this app's saved data (imported sets, decks) when storage runs low.
// Returns 'persistent', 'best-effort' or 'unsupported'. Safe to call more than once.
export async function requestPersistence() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return 'unsupported';
    if (await navigator.storage.persisted()) return 'persistent';
    return (await navigator.storage.persist()) ? 'persistent' : 'best-effort';
  } catch { return 'unsupported'; }
}
