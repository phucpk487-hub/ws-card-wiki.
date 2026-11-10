import * as V from '../version.js';
const { VERSION, BUILD, COMMIT } = V;
// Google Play forbids an app from updating itself outside the store, so the store build (STORE = true) never looks for or links to a download.
const STORE = V.STORE === true;
import { CHANGELOG } from '../changelog.js';
import { whatsNew, checkForUpdate, RELEASES_PAGE } from './updates.js';

const KEY = 'wsw-seen-build';
const get = () => { try { return +localStorage.getItem(KEY) || 0; } catch { return 0; } };
const set = (n) => { try { localStorage.setItem(KEY, String(n)); } catch { /* storage may be unavailable */ } };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function bar() {
  let el = document.getElementById('update-bar');
  if (!el) { el = document.createElement('div'); el.id = 'update-bar'; el.setAttribute('role', 'status'); document.getElementById('main').before(el); }
  return el;
}

function showNotes(entries, title) {
  const el = bar();
  el.querySelector('[data-notes-card]')?.remove();
  el.insertAdjacentHTML('beforeend', `<div class="update-card" data-notes-card><strong>${esc(title)}</strong><ul>${entries.flatMap((e) => e.notes).map((n) => `<li>${esc(n)}</li>`).join('')}</ul><button class="btn primary" type="button" data-close>Got it</button></div>`);
  el.querySelector('[data-close]').onclick = (e) => e.target.closest('.update-card').remove();
}

export function initUpdates() {
  const foot = document.getElementById('app-version');
  if (BUILD === 0) { if (foot) foot.textContent = 'Version: development (web)'; return; }
  if (foot) {
    foot.innerHTML = `Version ${esc(VERSION)}${COMMIT ? ` · ${esc(COMMIT)}` : ''} · <button class="linklike" type="button" data-notes>What's new</button> ${STORE ? '' : '· <button class="linklike" type="button" data-check>Check for updates</button>'}<span data-checkmsg></span>`;
    foot.querySelector('[data-notes]').onclick = () => showNotes(CHANGELOG.filter((e) => e.from <= BUILD).slice(0, 4), 'Recent changes');
  }
  const fresh = whatsNew(CHANGELOG, get(), BUILD);
  if (fresh.length) showNotes(fresh, `What's new in ${VERSION}`);
  set(BUILD);

  if (STORE) return; // no update check, no download links in the Play Store build

  const card = (u) => {
    if (document.querySelector('#update-bar [data-update]')) return;
    const el = bar();
    el.insertAdjacentHTML('afterbegin', `<div class="update-card" data-update><strong>A new version is ready (1.${u.build})</strong><p class="muted small">Download it and open the file to install. Your sets and decks stay.</p><a class="btn primary" href="${esc(u.url)}" target="_blank" rel="noopener">Download</a> <button class="btn" type="button" data-later>Later</button></div>`);
    el.querySelector('[data-later]').onclick = (e) => e.target.closest('[data-update]').remove();
  };
  const look = async () => { const u = await checkForUpdate(BUILD); if (u.state === 'new') card(u); return u; };
  look();
  setInterval(() => { if (!document.hidden) look(); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) look(); });
  const btn = foot && foot.querySelector('[data-check]');
  if (btn) btn.onclick = async () => {
    const say = foot.querySelector('[data-checkmsg]'); say.textContent = ' Checking…';
    const u = await look();
    if (u.state === 'private') { say.innerHTML = ` The app can't look up new versions by itself (the download page needs your GitHub login). <a href="${RELEASES_PAGE}" target="_blank" rel="noopener">Open the downloads page</a> and compare its build number with 1.${BUILD}.`; return; }
    say.textContent = u.state === 'new' ? ` Version 1.${u.build} is ready, see the top of the page.` : u.state === 'current' ? ' You have the latest version.' : ` Couldn't check (${u.why || 'are you online?'}).`;
    if (u.state === 'new') window.scrollTo(0, 0);
  };
}
