import { esc, cardTile, colorDot, COLOR_HEX, searchHref, setHref, formatDate } from '../lib/ui.js';
import { buildFacets } from '../lib/search.js';

export async function render({ db }) {
  if (!db.cards.length) {
    return {
      title: 'Welcome',
      html: `<section class="hero"><div class="container narrow">
        <h1>Weiss Schwarz <span class="accent">Card Wiki</span></h1>
        <p class="lead">Your card database is empty. Import a card list PDF to get started: the app reads it on this device and keeps the cards for offline use.</p>
        <p><a class="btn primary" href="#/import">Import your first set</a></p>
        <p class="muted small">Once you have cards, you can search them, browse sets and build decks.</p>
      </div></section>`,
    };
  }
  const f = buildFacets(db.cards);
  const pick = db.cards[Math.floor(Math.random() * db.cards.length)];
  const sets = [...db.sets].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)).slice(0, 4);
  const trait = db.cards.flatMap((c) => c.traits)[0];
  const examples = ['heal', trait ? `trait:${trait}` : null, '"top card"', 'type:climax'].filter(Boolean);

  const html = `
  <section class="hero">
    <div class="container narrow">
      <h1>Weiss Schwarz <span class="accent">Card Wiki</span></h1>
      <p class="lead">Search cards, read full effects, browse sets, and build decks.</p>
      <form class="searchbar" id="home-search" role="search" autocomplete="off">
        <label class="sr-only" for="home-q">Search cards</label>
        <input id="home-q" name="q" type="search" placeholder="Search by name, effect text, trait, or number…" autofocus>
        <button class="btn primary" type="submit">Search</button>
      </form>
      <p class="hint">Try: ${examples.map((e) => `<a href="${searchHref({ q: e })}"><code>${esc(e)}</code></a>`).join(' ')}</p>
      <div class="chips center" aria-label="Browse by color">
        ${f.colors.map((c) => `<a class="chip" href="${searchHref({ colors: c.value })}">${colorDot(c.value)}${esc(c.value)} <span class="muted">${c.count}</span></a>`).join('')}
      </div>
    </div>
  </section>

  <div class="container">
    <section class="stats" aria-label="Database summary">
      <div class="stat"><strong>${db.cards.length}</strong><span>Cards</span></div>
      <div class="stat"><strong>${db.sets.length}</strong><span>Sets</span></div>
      <div class="stat"><strong>${f.series.length}</strong><span>Series</span></div>
    </section>

    <div class="two-col">
      <section>
        <div class="section-head"><h2>Card of the moment</h2><a href="#/cards">Browse all cards →</a></div>
        <div class="grid single">${cardTile(pick)}</div>
        <p class="muted small">Reload to see another random card.</p>
      </section>
      <section>
        <div class="section-head"><h2>Latest sets</h2><a href="#/sets">All sets →</a></div>
        <ul class="list">
          ${sets.map((s) => `<li><a href="${setHref(s.code)}"><strong>${esc(s.name)}</strong></a>
            <div class="muted small">${esc(s.code)} · ${esc(s.type)} · ${s.upcoming ? 'Upcoming ' : ''}${formatDate(s.releaseDate)}</div></li>`).join('')}
        </ul>
        <div class="section-head"><h2>Browse by series</h2></div>
        <div class="chips">${f.series.map((s) => `<a class="chip" href="${searchHref({ series: s.value })}">${esc(s.value)} <span class="muted">${s.count}</span></a>`).join('')}</div>
      </section>
    </div>

    <section>
      <div class="section-head"><h2>Explore</h2></div>
      <div class="cards-3">
        <a class="panel link" href="#/cards"><h3>Cards</h3><p>Search by name, effect text, trait or number, and filter by color, level and rarity.</p></a>
        <a class="panel link" href="#/decks"><h3>Decks</h3><p>Build 50-card decks and check them against the deck rules.</p></a>
        <a class="panel link" href="#/sets"><h3>Sets</h3><p>Browse boosters and trial decks and see what each contains.</p></a>
      </div>
    </section>
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
