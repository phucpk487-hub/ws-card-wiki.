import { ADMIN } from './lib/config.js';
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

function navigate(hash) { if (location.hash === hash) route(); else location.hash = hash; }

async function route() {
  const id = ++renderId;
  const { path, query } = parseHash();
  const key = path[0] || '';
  const nav = NAV_OF[key] ?? key;
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === 'import' && !ADMIN) { a.remove(); return; }
    const on = a.dataset.nav === nav;
    a.classList.toggle('active', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
  document.getElementById('nav-links').classList.remove('open');
  document.getElementById('menu-btn').setAttribute('aria-expanded', 'false');

  main.innerHTML = skeletonPage();
  try {
    const loader = key === 'import' && !ADMIN ? null : ROUTES[key]; // import is admin-only
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
    window.scrollTo(0, 0);
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
document.getElementById('menu-btn').addEventListener('click', (e) => {
  const open = document.getElementById('nav-links').classList.toggle('open');
  e.currentTarget.setAttribute('aria-expanded', String(open));
});
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
