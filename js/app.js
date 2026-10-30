import { loadDb } from './lib/db.js';
import { requestPersistence } from './lib/persist.js';
import { parseHash } from './lib/router.js';
import { initTheme } from './lib/theme.js';
import { skeletonPage, errorState, emptyState } from './lib/ui.js';
import { searchHref } from './lib/ui.js';

const ROUTES = {
  '': () => import('./pages/home.js'),
  cards: () => import('./pages/cards.js'),
  card: () => import('./pages/card.js'),
  sets: () => import('./pages/sets.js'),
  set: () => import('./pages/sets.js'),
  import: () => import('./pages/import.js'),
  decks: () => import('./pages/decks.js'),
  deck: () => import('./pages/decks.js'),
};
const NAV_OF = { '': 'home', card: 'cards', set: 'sets', deck: 'decks' };

const main = document.getElementById('main');
let renderId = 0;
// Back/forward should land where you were: remember the scroll position of each page, restore it when a history step brings you back.
const scrollAt = new Map();
let fromHistory = false;
window.addEventListener('popstate', () => { fromHistory = true; });
window.addEventListener('hashchange', (e) => {
  try { scrollAt.set(new URL(e.oldURL).hash || '#/', window.scrollY); } catch { /* ignore */ }
}, true);

function navigate(hash) { if (location.hash === hash) route(); else location.hash = hash; }

async function route() {
  const id = ++renderId;
  const { path, query } = parseHash();
  const key = path[0] || '';
  const nav = NAV_OF[key] ?? key;
  document.body.dataset.page = key || 'home';
  document.querySelectorAll('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === nav;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });

  main.innerHTML = skeletonPage();
  try {
    const loader = ROUTES[key];
    if (!loader) {
      main.innerHTML = `<div class="container">${emptyState('Page not found', 'That page does not exist.', '<a class="btn primary" href="#/">Go home</a>')}</div>`;
      document.title = 'Not found · Weiss Schwarz Card Wiki';
      return;
    }
    const [mod, db] = await Promise.all([loader(), loadDb()]);
    if (id !== renderId) return; // a newer navigation superseded this one
    const page = await mod.render({ db, path, query, navigate });
    if (id !== renderId) return;
    const root = document.createElement('div'); // fresh element => no stale listeners
    root.innerHTML = page.html;
    main.replaceChildren(root);
    document.title = `${page.title} · Weiss Schwarz Card Wiki`;
    page.mount?.(root, { navigate, db });
    const back = fromHistory; fromHistory = false;
    const y = back ? scrollAt.get(location.hash || '#/') || 0 : 0;
    window.scrollTo(0, y);
    if (y) { requestAnimationFrame(() => window.scrollTo(0, y)); setTimeout(() => window.scrollTo(0, y), 250); } // images settle after first paint
    main.focus({ preventScroll: true });
  } catch (err) {
    if (id !== renderId) return;
    console.error(err);
    main.innerHTML = `<div class="container">${errorState(err.message || 'Unknown error')}</div>`;
    main.querySelector('[data-retry]')?.addEventListener('click', route);
    document.title = 'Error · Weiss Schwarz Card Wiki';
  }
}

initTheme(document.getElementById('theme-btn'));
document.getElementById('header-search').addEventListener('submit', (e) => {
  e.preventDefault();
  const q = new FormData(e.target).get('q').toString().trim();
  e.target.reset();
  navigate(q ? searchHref({ q }) : '#/cards');
});
window.addEventListener('hashchange', route);
route();

// The skip link must not change the hash, or the router would treat "#main" as a route.
document.querySelector('.skip')?.addEventListener('click', (e) => { e.preventDefault(); main.focus(); });

requestPersistence(); // ask the device to keep saved decks and imported sets
