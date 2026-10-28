import { cardsInSet } from '../lib/db.js';
import { filterText } from '../lib/search.js';
import { deleteSet } from '../lib/setAdmin.js';
import { esc, cardTile, chip, emptyState, formatDate, setHref, searchHref } from '../lib/ui.js';

const setCard = (s) => `<a class="panel link set" href="${setHref(s.code)}">
  <div class="set-top"><span class="badge">${esc(s.type)}</span>${s.upcoming ? '<span class="badge warn">Upcoming</span>' : ''}</div>
  <h3>${esc(s.name)}</h3>
  <div class="muted small">${esc(s.code)} · ${formatDate(s.releaseDate)}</div>
  <p>${esc(s.description)}</p>
  <div class="progress" aria-label="${s.cardCount} of ${s.total} cards in database"><div style="width:${Math.min(100, Math.round((s.cardCount / s.total) * 100))}%"></div></div>
  <div class="muted small">${s.cardCount} of ${s.total} cards in database</div></a>`;

export async function render({ db, path, query, navigate }) {
  if (path[1]) return renderDetail(db, path[1], navigate);

  const types = [...new Set(db.sets.map((s) => s.type))];
  let type = query.get('type') || '', q = query.get('q') || '', sort = query.get('sort') || 'new';

  const html = `<div class="container">
    <h1>Sets &amp; expansions</h1>
    <div class="toolbar">
      <label class="sr-narrow" for="sq">Filter sets</label>
      <input id="sq" type="search" class="grow" placeholder="Filter by name, code or series…" value="${esc(q)}">
      <label class="sel">Sort <select id="ss"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="name">Name</option></select></label>
    </div>
    <div class="chips" id="stypes"></div>
    <div id="slist"></div></div>`;

  return {
    title: 'Sets',
    html,
    mount(root) {
      const draw = () => {
        root.querySelector('#stypes').innerHTML = chip('All types', 'data-type=""', !type) + types.map((t) => chip(t, `data-type="${esc(t)}"`, type === t)).join('');
        let list = filterText(db.sets, q, (s) => `${s.name} ${s.code} ${s.series} ${s.type}`).filter((s) => !type || s.type === type);
        list = [...list].sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : sort === 'old' ? (a, b) => a.releaseDate.localeCompare(b.releaseDate) : (a, b) => b.releaseDate.localeCompare(a.releaseDate));
        root.querySelector('#slist').innerHTML = list.length
          ? `<div class="cards-3">${list.map(setCard).join('')}</div>`
          : db.sets.length ? emptyState('No sets found', 'No set matches that filter.', '<button class="btn" data-reset>Reset filters</button>')
            : emptyState('No sets yet', 'Import a card list PDF to add your first set.', '<a class="btn primary" href="#/import">Import a set</a>');
        const params = new URLSearchParams(); if (q) params.set('q', q); if (type) params.set('type', type); if (sort !== 'new') params.set('sort', sort);
        history.replaceState(null, '', `#/sets${params.toString() ? `?${params}` : ''}`);
      };
      root.querySelector('#ss').value = sort;
      draw();
      root.querySelector('#sq').addEventListener('input', (e) => { q = e.target.value; draw(); });
      root.querySelector('#ss').addEventListener('change', (e) => { sort = e.target.value; draw(); });
      root.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if ('type' in b.dataset) { type = b.dataset.type; draw(); }
        if ('reset' in b.dataset) { type = ''; q = ''; root.querySelector('#sq').value = ''; draw(); }
      });
    },
  };
}

function renderDetail(db, code, navigate) {
  const set = db.sets.find((s) => s.code === code);
  if (!set) {
    return { title: 'Set not found', html: `<div class="container">${emptyState('Set not found', `No set with code “${code}”.`, '<a class="btn primary" href="#/sets">Back to all sets</a>')}</div>` };
  }
  const cards = cardsInSet(db, code);
  const byRarity = cards.reduce((m, c) => ({ ...m, [c.rarity]: (m[c.rarity] || 0) + 1 }), {});
  return {
    title: set.name,
    html: `<div class="container">
      <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a> / <a href="#/sets">Sets</a> / <span>${esc(set.code)}</span></nav>
      <h1>${esc(set.name)}</h1>
      <p class="lead">${esc(set.description)}</p>
      <div class="facts">
        <div><span class="muted">Code</span><strong>${esc(set.code)}</strong></div>
        <div><span class="muted">Type</span><strong>${esc(set.type)}</strong></div>
        <div><span class="muted">${set.upcoming ? 'Releases' : 'Released'}</span><strong>${formatDate(set.releaseDate)}</strong></div>
        <div><span class="muted">Series</span><strong><a href="${searchHref({ series: set.series })}">${esc(set.series)}</a></strong></div>
        <div><span class="muted">In database</span><strong>${cards.length} / ${set.total}</strong></div>
      </div>
      ${Object.keys(byRarity).length ? `<p class="muted">${Object.entries(byRarity).map(([r, n]) => `${esc(r)} × ${n}`).join(' · ')}</p>` : ''}
      <div class="section-head"><h2>Cards</h2>${cards.length ? `<a href="${searchHref({ sets: set.code })}">Open in card search →</a>` : ''}</div>
      ${cards.length ? `<div class="grid">${cards.map(cardTile).join('')}</div>`
        : emptyState(set.upcoming ? 'Not released yet' : 'No cards added yet', set.upcoming ? 'Card data will appear here once this set is revealed.' : 'This set has no card data in the database yet.')}
      <section class="panel manage-zone" aria-labelledby="adm"><h2 id="adm">Manage this set</h2>
        <div id="del-area"><button class="btn danger" id="del-open">Delete set…</button></div></section>
    </div>`,
    mount(root) {
      const area = root.querySelector('#del-area'); if (!area) return;
      const n = cards.length, how = set.source === 'imported'
        ? 'It is removed from this browser, including its saved card images.'
        : 'It is bundled with the app, so it is hidden rather than erased. You can restore it later from the Import page.';
      area.addEventListener('click', async (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.id === 'del-open') {
          area.innerHTML = `<div class="state error" role="alert"><p><strong>Delete “${esc(set.name)}”?</strong> This removes ${n} card${n === 1 ? '' : 's'} from the database. ${esc(how)} Decks that use these cards will show them as “not in database”.</p>
            <div class="toolbar"><button class="btn danger" id="del-yes">Delete set</button><button class="btn" id="del-no">Cancel</button></div><p id="del-err" class="muted" role="status"></p></div>`;
          area.querySelector('#del-no').focus();
        } else if (b.id === 'del-no') {
          area.innerHTML = '<button class="btn danger" id="del-open">Delete set…</button>';
        } else if (b.id === 'del-yes') {
          b.disabled = true; b.textContent = 'Deleting…';
          try { await deleteSet(set); navigate('#/sets'); }
          catch (err) { b.disabled = false; b.textContent = 'Delete set'; area.querySelector('#del-err').textContent = `Could not delete: ${err.message}`; }
        }
      });
    },
  };
}
