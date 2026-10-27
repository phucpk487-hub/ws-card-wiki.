import { searchCards, buildFacets, SORTS, PAGE_SIZE, paramsToQuery, queryToParams, parseQuery, describeClause } from '../lib/search.js';
import { esc, cardTile, cardRow, chip, colorDot, emptyState } from '../lib/ui.js';
import { replaceQuery } from '../lib/router.js';

const GROUPS = [
  ['colors', 'Color'], ['types', 'Type'], ['levels', 'Level'], ['souls', 'Soul'], ['rarities', 'Rarity'],
  ['series', 'Series'], ['sets', 'Set'], ['triggers', 'Trigger'], ['traits', 'Trait'],
];

export async function render({ db, query }) {
  const facets = buildFacets(db.cards);
  const state = queryToParams(query);
  let filtersOpen = false;

  const RANGES = [['cost', 'Cost', 'costMin', 'costMax'], ['power', 'Power', 'powerMin', 'powerMax']];
  const rangeOn = ([, , lo, hi]) => state[lo] !== '' || state[hi] !== '';
  const total = (k) => state[k].length;
  const activeCount = () => GROUPS.reduce((n, [k]) => n + total(k), 0) + RANGES.filter(rangeOn).length;
  const EXAMPLES = [
    ['color:yellow level:3', 'Yellow Level 3 cards'], ['soul:2', 'Cards with 2 soul'], ['type:cx', 'Climax cards'],
    ['power>=9000', 'Power 9000 or more'], ['cost:0-1 -type:event', 'Cost 0 to 1, no Events'], ['trigger:soul color:red,blue', 'Soul trigger, red or blue'],
    ['level:1-2 power<=5k', 'Level 1 or 2, power up to 5000'], ['has:trigger', 'Has any trigger icon'],
  ];

  function filtersHtml() {
    return GROUPS.map(([key, label]) => {
      const items = facets[key];
      if (!items.length) return '';
      const open = total(key) > 0 || ['colors', 'types', 'levels'].includes(key);
      return `<details class="fgroup" ${open ? 'open' : ''} data-group="${key}"><summary>${label}${total(key) ? ` <span class="count">${total(key)}</span>` : ''}</summary>
        <div class="chips">${items.map((i) => chip(key === 'levels' ? `Level ${i.value}` : String(i.value), `data-f="${key}" data-v="${esc(i.value)}"`,
          state[key].map(String).includes(String(i.value)), key === 'colors' ? colorDot(i.value) : '')).join('')}</div></details>`;
    }).join('') + RANGES.map((r) => {
      const [key, label, lo, hi] = r, span = facets.ranges[key];
      if (!span) return '';
      const step = key === 'power' ? 500 : 1;
      return `<details class="fgroup" ${rangeOn(r) ? 'open' : ''} data-group="${key}"><summary>${label}${rangeOn(r) ? ' <span class="count">1</span>' : ''}</summary>
        <div class="range"><label>From <input type="number" inputmode="numeric" data-range="${lo}" min="${span.min}" max="${span.max}" step="${step}" placeholder="${span.min}" value="${esc(state[lo])}" aria-label="${label} from"></label>
        <label>To <input type="number" inputmode="numeric" data-range="${hi}" min="${span.min}" max="${span.max}" step="${step}" placeholder="${span.max}" value="${esc(state[hi])}" aria-label="${label} to"></label></div></details>`;
    }).join('');
  }

  function activeChipsHtml() {
    const chips = [];
    for (const [k, label] of GROUPS) for (const v of state[k]) chips.push(`<button class="chip on removable" data-f="${k}" data-v="${esc(v)}" aria-label="Remove filter ${esc(label)}: ${esc(v)}">${esc(label)}: ${esc(k === 'levels' ? `Level ${v}` : v)} ✕</button>`);
    for (const r of RANGES) if (rangeOn(r)) {
      const [, label, lo, hi] = r, a = state[lo], b = state[hi];
      chips.push(`<button class="chip on removable" data-clear-range="${r[0]}" aria-label="Remove ${label} filter">${label}: ${a !== '' && b !== '' ? `${esc(a)} to ${esc(b)}` : a !== '' ? `${esc(a)} or more` : `${esc(b)} or less`} ✕</button>`);
    }
    if (state.q) chips.push(`<button class="chip on removable" data-clear-q aria-label="Clear search text">“${esc(state.q)}” ✕</button>`);
    return chips.length ? `${chips.join('')}<button class="btn link" data-clear-all>Clear all</button>` : '';
  }

  function resultsHtml() {
    const r = searchCards(db.cards, { ...state, pageSize: PAGE_SIZE });
    state.page = r.page;
    const from = r.total ? (r.page - 1) * r.pageSize + 1 : 0, to = Math.min(r.total, r.page * r.pageSize);
    const head = `<div class="result-head" role="status" aria-live="polite">${r.total ? `Showing ${from}–${to} of <strong>${r.total}</strong> card${r.total === 1 ? '' : 's'}` : 'No cards found'}</div>`;
    if (!r.total && !db.cards.length) {
      return head + emptyState('No cards yet', 'Import a card list PDF to add your first set.', '<a class="btn primary" href="#/import">Import a set</a>');
    }
    if (!r.total) {
      return head + emptyState('No cards match your search', 'Try removing a filter, checking your spelling, or searching for a shorter phrase.',
        '<button class="btn" data-clear-all>Reset search and filters</button>');
    }
    const body = state.view === 'list'
      ? `<div class="table-wrap"><table class="data"><thead><tr><th>No.</th><th>Name</th><th>Color</th><th>Type</th><th class="num">Lv</th><th class="num">Cost</th><th class="num">Power</th><th class="num">Soul</th><th>Rarity</th></tr></thead><tbody>${r.items.map(cardRow).join('')}</tbody></table></div>`
      : `<div class="grid">${r.items.map(cardTile).join('')}</div>`;
    const pager = r.pages > 1 ? `<nav class="pager" aria-label="Pagination">
      <button class="btn" data-page="${r.page - 1}" ${r.page <= 1 ? 'disabled' : ''}>← Previous</button>
      <span>Page ${r.page} of ${r.pages}</span>
      <button class="btn" data-page="${r.page + 1}" ${r.page >= r.pages ? 'disabled' : ''}>Next →</button></nav>` : '';
    return head + body + pager;
  }

  const html = `
  <div class="container">
    <h1>Card database</h1>
    <form class="searchbar" id="card-search" role="search" autocomplete="off">
      <label class="sr-only" for="q">Search cards</label>
      <input id="q" name="q" type="search" value="${esc(state.q)}" placeholder='Search name, effect, trait… e.g. backup trait:magic -event'>
      <button class="btn primary" type="submit">Search</button>
    </form>
    <p class="hint" id="q-hint"></p>
    <details class="syntax"><summary>Search tips</summary>
      <p class="muted small">Combine words and fields; every part must match. Click an example to try it.</p>
      <ul class="examples">${EXAMPLES.map(([e, d]) => `<li><button class="btn link" data-example="${esc(e)}"><code>${esc(e)}</code></button> <span class="muted small">${esc(d)}</span></li>`).join('')}</ul>
      <dl class="fields small">
        <div><dt><code>color:</code></dt><dd>yellow, green, red, blue (or y, g, r, b); comma means “or”</dd></div>
        <div><dt><code>type:</code></dt><dd>character, event, climax (or char, ev, cx)</dd></div>
        <div><dt><code>level:</code> <code>cost:</code> <code>power:</code> <code>soul:</code></dt><dd><code>3</code>, <code>1-2</code>, <code>0,3</code>, <code>&gt;=2</code>, <code>&lt;5000</code>; power also takes <code>5k</code></dd></div>
        <div><dt><code>trigger:</code></dt><dd>soul, choice, … (the icon on the card)</dd></div>
        <div><dt><code>trait:</code> <code>rarity:</code> <code>set:</code> <code>series:</code> <code>effect:</code> <code>name:</code></dt><dd>text or code to look for</dd></div>
        <div><dt><code>has:</code></dt><dd>image, trigger, soul, power, counter</dd></div>
        <div><dt><code>-</code> or <code>"…"</code></dt><dd><code>-type:event</code> excludes; <code>"top card"</code> matches a phrase</dd></div>
      </dl></details>
    <div class="toolbar">
      <button class="btn only-mobile" id="toggle-filters" aria-expanded="false" aria-controls="filters">Filters <span class="count" id="fcount"></span></button>
      <label class="sel">Sort <select id="sort">${Object.entries(SORTS).map(([k, v]) => `<option value="${k}" ${state.sort === k ? 'selected' : ''}>${esc(v)}</option>`).join('')}</select></label>
      <div class="seg" role="group" aria-label="View">
        <button class="seg-btn" data-view="grid" aria-pressed="${state.view === 'grid'}">Grid</button>
        <button class="seg-btn" data-view="list" aria-pressed="${state.view === 'list'}">List</button>
      </div>
    </div>
    <div class="layout">
      <aside id="filters" class="filters" aria-label="Filters"></aside>
      <section>
        <div class="active" id="active"></div>
        <div id="results"></div>
      </section>
    </div>
  </div>`;

  return {
    title: 'Cards',
    html,
    mount(root) {
      const $ = (s) => root.querySelector(s);
      const filtersEl = $('#filters'), resultsEl = $('#results'), activeEl = $('#active'), hintEl = $('#q-hint');

      function draw({ filters = true } = {}) {
        if (filters) filtersEl.innerHTML = filtersHtml();
        resultsEl.innerHTML = resultsHtml();
        activeEl.innerHTML = activeChipsHtml();
        $('#fcount').textContent = activeCount() ? String(activeCount()) : '';
        const parsed = parseQuery(state.q).filter((c) => c.field || c.negate);
        hintEl.textContent = parsed.length ? `Interpreted as: ${parseQuery(state.q).map(describeClause).join(' AND ')}` : '';
        replaceQuery('/cards', paramsToQuery(state));
      }
      const reset = (changed = true) => { if (changed) state.page = 1; draw(); };

      draw();

      let timer;
      $('#q').addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => { state.q = e.target.value; state.page = 1; draw({ filters: false }); }, 160);
      });
      $('#card-search').addEventListener('submit', (e) => { e.preventDefault(); clearTimeout(timer); state.q = $('#q').value; state.page = 1; draw({ filters: false }); });
      $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; reset(); });
      $('#toggle-filters').addEventListener('click', (e) => {
        filtersOpen = !filtersOpen; filtersEl.classList.toggle('open', filtersOpen); e.currentTarget.setAttribute('aria-expanded', String(filtersOpen));
      });

      filtersEl.addEventListener('change', (e) => {
        const k = e.target.dataset.range; if (!k) return;
        const v = e.target.value.trim(); state[k] = v === '' || Number.isNaN(Number(v)) ? '' : String(Math.max(0, Math.round(Number(v))));
        reset(); // redraws filters so the active chip appears
      });
      root.addEventListener('click', (e) => {
        const t = e.target.closest('button');
        if (!t) return;
        if (t.dataset.example) { state.q = t.dataset.example; $('#q').value = state.q; reset(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else if (t.dataset.clearRange) { const r = RANGES.find((x) => x[0] === t.dataset.clearRange); state[r[2]] = ''; state[r[3]] = ''; reset(); }
        else if (t.dataset.f) {
          const k = t.dataset.f, v = t.dataset.v, has = state[k].map(String).includes(v);
          state[k] = has ? state[k].filter((x) => String(x) !== v) : [...state[k], v];
          reset();
        } else if (t.dataset.view) { state.view = t.dataset.view; root.querySelectorAll('[data-view]').forEach((b) => b.setAttribute('aria-pressed', String(b === t))); draw({ filters: false }); }
        else if (t.dataset.page) { state.page = Number(t.dataset.page); draw({ filters: false }); window.scrollTo({ top: 0, behavior: 'smooth' }); }
        else if ('clearQ' in t.dataset) { state.q = ''; $('#q').value = ''; reset(); }
        else if ('clearAll' in t.dataset) {
          for (const [k] of GROUPS) state[k] = [];
          for (const [, , lo, hi] of RANGES) { state[lo] = ''; state[hi] = ''; }
          state.q = ''; $('#q').value = ''; reset();
        }
      });
    },
  };
}
