import { esc, cardTile, colorDot, COLOR_HEX, searchHref, setHref, formatDate } from '../lib/ui.js';
import { buildFacets } from '../lib/search.js';
import { recentNumbers } from '../lib/recent.js';
import { listDecks } from '../lib/deckStore.js';

export async function render({ db }) {
  if (!db.cards.length) {
    return {
      title: 'Welcome',
      html: `<div class="container narrow home">
        <h1 class="page-title">No cards yet</h1>
        <p class="lead">Import a card list PDF. The app reads it on this device and keeps the cards for offline use.</p>
        <p><a class="btn primary" href="#/import">Import your first set</a></p>
      </div>`,
    };
  }
  const f = buildFacets(db.cards);
  const byNumber = new Map(db.cards.map((c) => [c.number, c]));
  const recent = recentNumbers().map((n) => byNumber.get(n)).filter(Boolean).slice(0, 8);
  const decks = listDecks().slice(0, 3);
  const sets = [...db.sets].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)).slice(0, 4);
  const trait = db.cards.flatMap((c) => c.traits)[0];
  const examples = ['has:counter', trait ? `trait:${trait}` : null, 'type:climax', 'power>=9000'].filter(Boolean);

  const html = `
  <div class="container home">
    <h1 class="page-title">Find a card</h1>
    <form class="searchbar" id="home-search" role="search" autocomplete="off">
      <label class="sr-narrow" for="home-q">Search cards</label>
      <input id="home-q" name="q" type="search" placeholder="Search cards">
      <button class="btn primary" type="submit">Search</button>
    </form>
    <p class="hint">Try ${examples.map((e) => `<a href="${searchHref({ q: e })}"><code>${esc(e)}</code></a>`).join(' ')}</p>
    <div class="chips" aria-label="Browse by color">
      ${f.colors.map((c) => `<a class="chip" href="${searchHref({ colors: c.value })}">${colorDot(c.value)}${esc(c.value)} <span class="muted">${c.count}</span></a>`).join('')}
    </div>

    ${recent.length ? `<section class="block"><div class="section-head"><h2>Recently viewed</h2></div>
      <div class="strip">${recent.map(cardTile).join('')}</div></section>` : ''}

    <div class="two-col">
      <section class="block">
        <div class="section-head"><h2>Your decks</h2><a href="#/decks">All decks</a></div>
        ${decks.length ? `<ul class="list">${decks.map((d) => `<li><a href="#/deck/${encodeURIComponent(d.id)}"><strong>${esc(d.name || 'Untitled deck')}</strong></a>
            <div class="muted small">${Object.values(d.cards || {}).reduce((a, b) => a + b, 0)} / 50 cards</div></li>`).join('')}</ul>`
          : '<p class="muted">No decks yet.</p>'}
        <a class="btn" href="#/decks">${decks.length ? 'New deck' : 'Build your first deck'}</a>
      </section>
      <section class="block">
        <div class="section-head"><h2>Sets</h2><a href="#/sets">All sets</a></div>
        <ul class="list">
          ${sets.map((s) => `<li><a href="${setHref(s.code)}"><strong>${esc(s.name)}</strong></a>
            <div class="muted small">${esc(s.code)}${s.releaseDate ? ` · ${formatDate(s.releaseDate)}` : ''}</div></li>`).join('')}
        </ul>
        <a class="btn" href="#/import">Import a set</a>
      </section>
    </div>

    ${f.series.length > 1 ? `<section class="block"><div class="section-head"><h2>Series</h2></div>
      <div class="chips">${f.series.map((s) => `<a class="chip" href="${searchHref({ series: s.value })}">${esc(s.value)} <span class="muted">${s.count}</span></a>`).join('')}</div></section>` : ''}
    <p class="muted small">${db.cards.length} cards in ${db.sets.length} set${db.sets.length === 1 ? '' : 's'}, stored on this device.</p>
  </div>`;

  return {
    title: 'Home',
    html,
    mount(root, { navigate }) {
      root.querySelector('#home-search').addEventListener('submit', (e) => {
        e.preventDefault();
        const q = new FormData(e.target).get('q').toString().trim();
        navigate(q ? searchHref({ q }) : '#/cards');
      });
    },
  };
}
