import { searchCards, buildFacets } from '../lib/search.js';
import { listDecks, getDeck, saveDeck, deleteDeck, persistent } from '../lib/deckStore.js';
import { DECK_SIZE, MAX_COPIES, MAX_CLIMAX, emptyDeck, countOf, totalCards, canAdd, withCard, groupDeck, analyze, parseDeckText, exportDeckText } from '../lib/deck.js';
import { decksToJson, decksFromJson, restoreDecks } from '../lib/backup.js';
import { saveFile } from '../lib/files.js';
import { esc, displayName, cardArt, cardHref, colorDot, colorBadge, chip, emptyState, triggerBadge, COLOR_HEX } from '../lib/ui.js';

export async function render(ctx) {
  const byNumber = new Map(ctx.db.cards.map((c) => [c.number, c]));
  return ctx.path[0] === 'deck' && ctx.path[1] ? editor(ctx, byNumber) : list(ctx, byNumber);
}

const when = (t) => { try { return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); } catch { return ''; } };
const deckHref = (id) => `#/deck/${encodeURIComponent(id)}`;
const storageNote = () => (persistent ? '' : '<div class="notice" role="note">Browser storage is unavailable, so decks are kept only until you close this tab. Use Export to keep a copy.</div>');

/* ───────────────────────── deck list ───────────────────────── */
function list({ navigate }, byNumber) {
  const render = () => {
    const decks = listDecks();
    return decks.length ? `<div class="cards-3">${decks.map((d) => {
      const a = analyze(d, byNumber);
      const colors = Object.keys(a.stats.byColor);
      return `<div class="panel deck-card">
        <h3><a href="${deckHref(d.id)}">${esc(d.name || 'Untitled deck')}</a></h3>
        <div class="muted small">${a.total}/${DECK_SIZE} cards · ${a.stats.climax}/${MAX_CLIMAX} Climax · ${when(d.updated)}</div>
        <div class="deck-colors">${colors.map(colorDot).join('')}</div>
        <span class="badge ${a.valid ? 'ok' : 'warn'}">${a.valid ? 'Legal' : esc(a.issues.find((i) => i.level === 'error')?.text || 'Incomplete')}</span>
        <div class="deck-actions">
          <a class="btn" href="${deckHref(d.id)}">Open</a>
          <button class="btn" data-dup="${esc(d.id)}">Duplicate</button>
          <button class="btn" data-del="${esc(d.id)}">Delete</button>
        </div></div>`;
    }).join('')}</div>` : emptyState('No decks yet', 'Create a deck to start adding cards, or paste a deck list you already have.', '<button class="btn primary" data-new>New deck</button>');
  };
  return {
    title: 'Decks',
    html: `<div class="container">
      <h1>Decks</h1>
      <p class="lead">Build 50-card decks, check them against the deck rules, and keep as many as you like.</p>
      ${storageNote()}
      <div class="toolbar"><button class="btn primary" data-new>New deck</button><button class="btn" data-toggle-import>Import deck list</button>
        <span class="grow"></span><button class="btn" id="bk-save">Back up all decks</button><label class="btn" for="bk-file">Restore backup</label><input id="bk-file" type="file" accept="application/json,.json" hidden></div>
      <p id="bk-msg" class="muted small" role="status"></p>
      <form id="imp" class="panel" hidden>
        <label>Deck name <input id="imp-name" type="text" placeholder="Imported deck"></label>
        <label>One card per line, like <code>4 BD/WE49-01</code> <textarea id="imp-text" rows="8" placeholder="4 BD/WE49-01&#10;3 BD/WE49-14&#10;8 BD/WE49-11"></textarea></label>
        <div class="toolbar"><button class="btn primary" type="submit">Create deck</button><span id="imp-msg" class="muted" role="status"></span></div>
      </form>
      <div id="decks">${render()}</div></div>`,
    mount(root) {
      const $ = (s) => root.querySelector(s), box = $('#decks');
      const redraw = () => { box.innerHTML = render(); };
      const create = (deck) => { const d = saveDeck(deck); navigate(deckHref(d.id)); };
      root.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if ('new' in b.dataset) create(emptyDeck(`Deck ${listDecks().length + 1}`));
        else if ('toggleImport' in b.dataset) { const f = $('#imp'); f.hidden = !f.hidden; if (!f.hidden) $('#imp-text').focus(); }
        else if (b.dataset.dup) { const d = getDeck(b.dataset.dup); if (d) { saveDeck({ ...d, id: '', created: 0, name: `${d.name} (copy)` }); redraw(); } }
        else if (b.dataset.del) {
          if (b.dataset.armed !== '1') { const nm = (b.closest('.deck-card')?.querySelector('h3')?.textContent || 'this deck').trim(); b.dataset.armed = '1'; b.textContent = `Delete “${nm}”? Click again`; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Delete'; }, 3000); return; }
          deleteDeck(b.dataset.del); redraw();
        }
      });
      const say = (t) => { $('#bk-msg').textContent = t; };
      $('#bk-save').addEventListener('click', async () => {
        if (!listDecks().length) return say('There are no decks to back up yet.');
        try { say(await saveFile(`ws-decks-${new Date().toISOString().slice(0, 10)}.json`, new Blob([decksToJson()], { type: 'application/json' }))); }
        catch (err) { say(`Could not save the backup: ${err.message}`); }
      });
      $('#bk-file').addEventListener('change', async (e) => {
        const f = e.target.files[0]; e.target.value = ''; if (!f) return;
        try { const n = restoreDecks(decksFromJson(await f.text())); say(`Restored ${n} deck${n === 1 ? '' : 's'}.`); redraw(); }
        catch (err) { say(err.message); }
      });
      $('#imp').addEventListener('submit', (e) => {
        e.preventDefault();
        const { cards, unknown, bad } = parseDeckText($('#imp-text').value, byNumber);
        if (!Object.keys(cards).length) { $('#imp-msg').textContent = 'No cards found. Use one card per line, like “4 BD/WE49-01”.'; return; }
        if (unknown.length || bad.length) $('#imp-msg').textContent = `${unknown.length} card number(s) not in the database will be kept and flagged.`;
        create({ ...emptyDeck($('#imp-name').value.trim() || 'Imported deck'), cards });
      });
    },
  };
}

/* ───────────────────────── editor ───────────────────────── */
function editor({ db, path }, byNumber) {
  const id = path[1];
  let deck = getDeck(id);
  if (!deck) return { title: 'Deck not found', html: `<div class="container">${emptyState('Deck not found', 'This deck does not exist on this device. It may have been deleted.', '<a class="btn primary" href="#/decks">Back to decks</a>')}</div>` };

  const facets = buildFacets(db.cards);
  const search = { q: '', colors: [], types: [], pageSize: 30 };
  let pane = 'cards', note = '', noteTimer = 0;

  const html = `<div class="container wide">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a> / <a href="#/decks">Decks</a> / <span>${esc(deck.name)}</span></nav>
    <div class="deck-head">
      <label class="sr-only" for="dname">Deck name</label>
      <input id="dname" class="deck-name" type="text" value="${esc(deck.name)}" maxlength="80">
      <span id="saved" class="muted small" role="status"></span>
    </div>
    ${storageNote()}
    <div class="deck-tabs" role="tablist"><button role="tab" class="seg-btn" data-pane="cards" aria-pressed="true">Find cards</button><button role="tab" class="seg-btn" data-pane="deck" aria-pressed="false">Deck <span id="tabcount"></span></button></div>
    <div class="deck-layout show-cards" id="layout">
      <section class="deck-find" aria-label="Find cards">
        <form id="dq" role="search" autocomplete="off"><label class="sr-narrow" for="dsearch">Search cards</label>
          <input id="dsearch" type="search" placeholder="Search cards to add…"></form>
        <div class="chips" id="dfilters"></div>
        <div id="dresults"></div>
      </section>
      <section class="deck-main" aria-label="Your deck">
        <div id="dstatus" class="deck-status"></div>
        <div id="dlive" class="sr-only" role="status" aria-live="polite"></div>
        <div id="dlist"></div>
        <div id="dstats"></div>
        <div class="toolbar">
          <button class="btn" id="b-export">Export list</button>
          <button class="btn" id="b-import">Import list</button>
          <button class="btn" id="b-clear">Clear deck</button>
          <button class="btn" id="b-delete">Delete deck</button>
        </div>
        <div id="dtext" class="panel" hidden></div>
      </section>
    </div></div>`;

  return {
    title: deck.name,
    html,
    mount(root) {
      const $ = (s) => root.querySelector(s);
      const persist = () => { deck = saveDeck(deck); $('#saved').textContent = persistent ? 'Saved on this device' : 'Not saved (storage unavailable)'; };
      const say = (msg) => { note = msg; $('#dlive').textContent = msg; clearTimeout(noteTimer); noteTimer = setTimeout(() => { note = ''; drawStatus(); }, 3500); drawStatus(); };

      /* ---- drawing ---- */
      function drawFilters() {
        $('#dfilters').innerHTML = facets.colors.map((c) => chip(c.value, `data-fc="${esc(c.value)}"`, search.colors.includes(c.value), colorDot(c.value))).join('')
          + facets.types.map((t) => chip(t.value, `data-ft="${esc(t.value)}"`, search.types.includes(t.value))).join('');
      }
      function drawResults() {
        const r = searchCards(db.cards, { q: search.q, colors: search.colors, types: search.types, pageSize: search.pageSize });
        const rows = r.items.map((c) => {
          const n = countOf(deck, c.number), ok = canAdd(deck, c, byNumber);
          const meta = [c.number, c.type === 'Climax' ? 'Climax' : `Lv ${c.level ?? '–'} · cost ${c.cost ?? '–'}${typeof c.power === 'number' ? ` · ${c.power}` : ''}`].join(' · ');
          return `<div class="rrow"><a class="mini" href="${cardHref(c.number)}" aria-label="View ${esc(c.name)}">${cardArt(c)}</a>
            <div class="rinfo"><a href="${cardHref(c.number)}"><strong>${esc(displayName(c))}</strong></a><div class="muted small">${colorDot(c.color)} ${esc(meta)}</div></div>
            <div class="rctl">${n ? `<span class="in-deck" title="Copies in deck">×${n}</span>` : ''}<button class="btn add" data-add="${esc(c.number)}" aria-label="Add ${esc(c.name)} to deck" ${ok.ok ? '' : `disabled title="${esc(ok.reason)}"`}>+</button></div></div>`;
        }).join('');
        $('#dresults').innerHTML = `<div class="result-head" role="status">${r.total} card${r.total === 1 ? '' : 's'}</div>${rows || emptyState('No cards match', 'Try a different search or clear the filters.')}
          ${r.total > r.items.length ? `<button class="btn" data-more>Show more (${r.total - r.items.length})</button>` : ''}`;
      }
      function drawStatus() {
        const a = analyze(deck, byNumber);
        $('#tabcount').textContent = `(${a.total})`;
        $('#dstatus').innerHTML = `<div class="count-big ${a.total === DECK_SIZE ? 'full' : ''}"><strong>${a.total}</strong>/${DECK_SIZE}</div>
          <div><span class="badge ${a.valid ? 'ok' : 'warn'}">${a.valid ? 'Legal deck' : 'Not legal yet'}</span>
          <span class="muted small"> Climax ${a.stats.climax}/${MAX_CLIMAX}</span></div>${note ? `<div class="deck-note" role="alert">${esc(note)}</div>` : ''}`;
      }
      function drawList() {
        const groups = groupDeck(deck, byNumber);
        $('#dlist').innerHTML = groups.length ? groups.map((g) => `<div class="dgroup"><h3>${esc(g.label)} <span class="count">${g.total}</span></h3>
          ${g.entries.map(({ number, count, card }) => `<div class="drow"><a class="mini sm" href="${cardHref(number)}">${card ? cardArt(card) : '<div class="art"></div>'}</a>
            <div class="rinfo"><a href="${cardHref(number)}"><strong>${esc(card ? displayName(card) : number)}</strong></a><div class="muted small">${esc(number)}${card && card.type === 'Character' ? ` · cost ${card.cost ?? '–'}` : ''}${card ? '' : ' · not in database'}</div></div>
            <div class="stepper"><button class="btn sq" data-dec="${esc(number)}" aria-label="Remove one ${esc(card ? card.name : number)}">−</button><span class="n" aria-label="${count} copies">${count}</span><button class="btn sq" data-add="${esc(number)}" aria-label="Add one ${esc(card ? card.name : number)}" ${!card || canAdd(deck, card, byNumber).ok ? '' : 'disabled'}>+</button></div></div>`).join('')}</div>`).join('')
          : emptyState('This deck is empty', 'Search on the left and press + to add cards.');
      }
      function drawStats() {
        const a = analyze(deck, byNumber), s = a.stats, max = Math.max(1, ...Object.values(s.byLevel));
        const bars = [0, 1, 2, 3].map((l) => `<div class="sbar"><span>Lv ${l}</span><div class="track"><div style="width:${(s.byLevel[l] / max) * 100}%"></div></div><b>${s.byLevel[l]}</b></div>`).join('');
        const cmax = Math.max(1, ...Object.values(s.byColor));
        const colors = Object.entries(s.byColor).map(([c, n]) => `<div class="sbar"><span>${colorDot(c)} ${esc(c)}</span><div class="track"><div style="width:${(n / cmax) * 100}%;background:${COLOR_HEX[c] || 'var(--accent)'}"></div></div><b>${n}</b></div>`).join('');
        const trig = Object.entries(s.triggers).sort((x, y) => y[1] - x[1]).map(([t, n]) => `${triggerBadge(t)} <span class="muted small">×${n}</span>`).join(' ');
        $('#dstats').innerHTML = `<div class="panel stats-panel"><h3>Deck check</h3>
          ${a.issues.length ? `<ul class="issues">${a.issues.map((i) => `<li class="${i.level}">${esc(i.text)}</li>`).join('')}</ul>` : '<p class="ok-line">Legal: 50 cards, no more than 4 of any card, 8 or fewer Climax.</p>'}
          <div class="stat-grid"><div><strong>${s.characters}</strong><span>Characters</span></div><div><strong>${s.events}</strong><span>Events</span></div><div><strong>${s.climax}</strong><span>Climax</span></div><div><strong>${s.avgCost ? s.avgCost.toFixed(1) : '–'}</strong><span>Avg cost</span></div></div>
          <h4>Level curve</h4>${bars}<h4>Colors</h4>${colors || '<p class="muted small">No colors yet.</p>'}
          <h4>Trigger icons</h4><div class="chips">${trig || '<span class="muted small">None recorded.</span>'}</div></div>`;
      }
      const drawAll = () => { drawStatus(); drawList(); drawStats(); drawResults(); };

      /* ---- mutations ---- */
      function add(number) {
        const card = byNumber.get(number); if (!card) return;
        const ok = canAdd(deck, card, byNumber);
        if (!ok.ok) return say(ok.reason);
        deck = withCard(deck, number, +1); persist(); drawAll();
        $('#dlive').textContent = `Added ${card.name}. ${countOf(deck, number)} in deck, ${totalCards(deck)} total.`;
      }
      function remove(number) { deck = withCard(deck, number, -1); persist(); drawAll(); }

      drawFilters(); drawAll(); persist(); $('#saved').textContent = '';

      /* ---- events ---- */
      let t; $('#dsearch').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { search.q = e.target.value; search.pageSize = 30; drawResults(); }, 140); });
      $('#dq').addEventListener('submit', (e) => e.preventDefault());
      $('#dname').addEventListener('input', (e) => { deck = { ...deck, name: e.target.value }; persist(); document.title = `${deck.name || 'Deck'} · Weiss Schwarz Card Wiki`; });
      root.addEventListener('click', (e) => {
        const b = e.target.closest('button'); if (!b) return;
        const d = b.dataset;
        if (d.add) add(d.add);
        else if (d.dec) remove(d.dec);
        else if ('more' in d) { search.pageSize += 30; drawResults(); }
        else if (d.fc) { const i = search.colors.indexOf(d.fc); i < 0 ? search.colors.push(d.fc) : search.colors.splice(i, 1); search.pageSize = 30; drawFilters(); drawResults(); }
        else if (d.ft) { const i = search.types.indexOf(d.ft); i < 0 ? search.types.push(d.ft) : search.types.splice(i, 1); search.pageSize = 30; drawFilters(); drawResults(); }
        else if (d.pane) { pane = d.pane; root.querySelector('#layout').className = `deck-layout show-${pane}`; root.querySelectorAll('[data-pane]').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }
      });
      const arm = (btn, label, fn, ask) => btn.addEventListener('click', () => {
        if (btn.dataset.armed !== '1') { btn.dataset.armed = '1'; btn.textContent = ask(); setTimeout(() => { btn.dataset.armed = ''; btn.textContent = label; }, 3000); return; }
        fn();
      });
      arm($('#b-clear'), 'Clear deck', () => { deck = { ...deck, cards: {} }; persist(); drawAll(); $('#b-clear').textContent = 'Clear deck'; $('#b-clear').dataset.armed = ''; }, () => `Clear all cards in “${deck.name}”? Click again`);
      arm($('#b-delete'), 'Delete deck', () => { deleteDeck(deck.id); location.hash = '#/decks'; }, () => `Delete “${deck.name}”? Click again`);

      const box = $('#dtext');
      $('#b-export').addEventListener('click', () => {
        box.hidden = false;
        box.innerHTML = `<label for="xt">Deck list (one card per line)</label><textarea id="xt" rows="10" readonly></textarea><div class="toolbar"><button class="btn primary" id="copy">Copy</button><button class="btn" id="close">Close</button><span class="muted small" id="cmsg" role="status"></span></div>`;
        const ta = box.querySelector('#xt'); ta.value = exportDeckText(deck, byNumber);
        box.querySelector('#close').onclick = () => { box.hidden = true; };
        box.querySelector('#copy').onclick = async () => {
          try { await navigator.clipboard.writeText(ta.value); box.querySelector('#cmsg').textContent = 'Copied'; }
          catch { ta.select(); box.querySelector('#cmsg').textContent = 'Press Ctrl+C to copy'; }
        };
      });
      $('#b-import').addEventListener('click', () => {
        box.hidden = false;
        box.innerHTML = `<label for="it">Paste a deck list, like “4 BD/WE49-01”</label><textarea id="it" rows="10" placeholder="4 BD/WE49-01"></textarea><div class="toolbar"><button class="btn primary" id="rep">Replace deck</button><button class="btn" id="mrg">Add to deck</button><button class="btn" id="close">Close</button><span class="muted small" id="imsg" role="status"></span></div>`;
        box.querySelector('#close').onclick = () => { box.hidden = true; };
        const run = (merge) => {
          const { cards, unknown, bad } = parseDeckText(box.querySelector('#it').value, byNumber);
          if (!Object.keys(cards).length) { box.querySelector('#imsg').textContent = 'No cards found.'; return; }
          const next = merge ? { ...deck.cards } : {};
          for (const [k, v] of Object.entries(cards)) next[k] = (next[k] || 0) + v;
          deck = { ...deck, cards: next }; persist(); drawAll();
          box.querySelector('#imsg').textContent = `Imported ${Object.values(cards).reduce((a, b) => a + b, 0)} cards.${unknown.length ? ` ${unknown.length} not in the database.` : ''}${bad.length ? ` ${bad.length} line(s) skipped.` : ''}`;
        };
        box.querySelector('#rep').onclick = () => run(false);
        box.querySelector('#mrg').onclick = () => run(true);
      });
    },
  };
}
