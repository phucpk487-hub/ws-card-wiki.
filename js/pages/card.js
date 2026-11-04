import { findCard, cardsInSet, findSet } from '../lib/db.js';
import { relatedCards } from '../lib/search.js';
import { listDecks, saveDeck } from '../lib/deckStore.js';
import { canAdd, withCard, countOf, emptyDeck } from '../lib/deck.js';
import { pushRecent } from '../lib/recent.js';
import { cardFormHtml, formValues, saveCardEdit } from '../lib/editor.js';
import { esc, displayName, cardArt, cardTile, colorBadge, formatEffect, triggerBadge, searchHref, setHref, cardHref, emptyState } from '../lib/ui.js';

export async function render({ db, path }) {
  const number = path[1] || '';
  const card = findCard(db, number);
  if (!card) {
    return {
      title: 'Card not found',
      html: `<div class="container">${emptyState('Card not found', `There is no card numbered “${number}” in the database.`,
        `<a class="btn primary" href="${searchHref({ q: number.split('-')[0] || number })}">Search for similar cards</a>`)}</div>`,
    };
  }
  const set = findSet(db, card.set);
  const siblings = cardsInSet(db, card.set);
  const idx = siblings.findIndex((c) => c.number === card.number);
  const prev = siblings[idx - 1], next = siblings[idx + 1];
  const related = relatedCards(db.cards, card);
  const isChar = card.type === 'Character';
  const dash = '–';

  const row = (label, value) => `<tr><th scope="row">${label}</th><td>${value}</td></tr>`;
  const stats = [
    row('Card number', `<code>${esc(card.number)}</code> <button class="btn tiny" data-copy="${esc(card.number)}" aria-label="Copy card number">Copy</button>`),
    row('Type', esc(card.type)),
    row('Color', colorBadge(card.color)),
    ...(card.type !== 'Climax' ? [row('Level', card.level ?? dash), row('Cost', card.cost ?? dash)] : []),
    ...(isChar ? [row('Power', card.power ?? dash), row('Soul', card.soul ?? dash)] : []),
    ...(card.type !== 'Climax' ? [row('Counter', card.counter ? '<span class="badge">Counter</span>' : dash)] : []),
    row('Trigger', card.triggers.length ? card.triggers.map(triggerBadge).join(' ') : dash),
    row('Traits', card.traits.length ? card.traits.map((t) => `<a class="chip small" href="${searchHref({ traits: t })}">${esc(t)}</a>`).join(' ') : dash),
    row('Rarity', esc((card.rarities && card.rarities.length ? card.rarities : [card.rarity]).join(', ') || dash)),
    row('Series', `<a href="${searchHref({ series: card.series })}">${esc(card.series)}</a>`),
    row('Set', set ? `<a href="${setHref(set.code)}">${esc(set.name)}</a> <span class="muted">(${esc(set.code)})</span>` : esc(card.set)),
    row('Illustrator', esc(card.illustrator || dash)),
  ].join('');

  const html = `
  <div class="container">
    <nav class="crumbs" aria-label="Breadcrumb"><a href="#/">Home</a> / <a href="#/cards">Cards</a> / <span>${esc(card.number)}</span></nav>
    <article class="card-page">
      <div class="card-visual">${cardArt(card, { lazy: false })}
        ${(card.altImages || []).length ? `<div class="alts" aria-label="Alternate art">${card.altImages.map((u, i) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Alternate art ${i + 1} of ${esc(card.name)}" loading="lazy"></a>`).join('')}</div>` : ''}
        <div class="nav-prev-next">
          ${prev ? `<a class="btn" href="${cardHref(prev.number)}" rel="prev">← ${esc(prev.number.split('-').pop())}</a>` : '<span></span>'}
          ${next ? `<a class="btn" href="${cardHref(next.number)}" rel="next">${esc(next.number.split('-').pop())} →</a>` : '<span></span>'}
        </div>
      </div>
      <div class="card-info">
        <h1>${esc(displayName(card))}</h1>
        <div class="add-deck" id="add-deck"></div>
        <section aria-labelledby="eff"><h2 id="eff">Card text</h2>
          ${card.effect.length ? `<ul class="effects">${card.effect.map((e) => `<li>${formatEffect(e)}</li>`).join('')}</ul>` : '<p class="muted">No card text.</p>'}
          ${(card.notes || []).map((n) => `<p class="note">Note: ${esc(n)}</p>`).join('')}
          ${card.flavor ? `<blockquote class="flavor">“${esc(card.flavor)}”</blockquote>` : ''}
        </section>
        <section aria-labelledby="det"><h2 id="det">Details</h2><table class="kv"><tbody>${stats}</tbody></table></section>
        ${set && set.packId ? '<div id="edit-area"><button class="btn" id="edit-open">Edit card…</button></div>' : ''}
      </div>
    </article>
    ${related.length ? `<section><div class="section-head"><h2>Related cards</h2></div><div class="grid">${related.map(cardTile).join('')}</div></section>` : ''}
  </div>`;

  return {
    title: displayName(card),
    html,
    mount(root, { db, navigate }) {
      const ea = root.querySelector('#edit-area');
      if (ea) ea.addEventListener('click', async (e) => {
        if (e.target.id === 'edit-open') {
          ea.innerHTML = cardFormHtml(card);
          const form = ea.querySelector('#edit-form'), t = form.elements.type;
          t.addEventListener('change', () => { const ty = t.value; // fields that do not exist for this type are switched off
            const on = (n, ok) => { form.elements[n].disabled = !ok; };
            on('level', ty !== 'Climax'); on('cost', ty !== 'Climax'); on('counter', ty !== 'Climax'); on('power', ty === 'Character'); on('soul', ty === 'Character'); });
          form.elements.name.focus();
          form.addEventListener('submit', async (ev) => {
            ev.preventDefault(); const err = form.querySelector('#edit-err'), btn = form.querySelector('[type=submit]');
            btn.disabled = true; btn.textContent = 'Saving…';
            try { await saveCardEdit(set, card.number, formValues(form)); navigate(location.hash); }
            catch (x) { btn.disabled = false; btn.textContent = 'Save changes'; err.textContent = `Could not save: ${x.message}`; }
          });
        } else if (e.target.closest('[data-cancel]')) ea.innerHTML = '<button class="btn" id="edit-open">Edit card…</button>';
      });
      pushRecent(card.number);
      const key = (e) => {
        if (e.target.closest && e.target.closest('input,select,textarea') || e.altKey || e.ctrlKey || e.metaKey) return;
        const to = e.key === 'ArrowLeft' ? prev : e.key === 'ArrowRight' ? next : null;
        if (to) location.hash = cardHref(to.number);
      };
      document.addEventListener('keydown', key);
      window.addEventListener('hashchange', () => document.removeEventListener('keydown', key), { once: true });
      const byNumber = new Map(db.cards.map((c) => [c.number, c]));
      const box = root.querySelector('#add-deck');
      let msg = '', pick = '';
      const draw = () => {
        const decks = listDecks();
        if (!pick || (pick !== 'new' && !decks.some((d) => d.id === pick))) pick = decks[0] ? decks[0].id : 'new';
        const cur = decks.find((d) => d.id === pick);
        box.innerHTML = `<label class="sr-only" for="deck-pick">Deck</label><select id="deck-pick">${decks.map((d) => `<option value="${esc(d.id)}" ${d.id === pick ? 'selected' : ''}>${esc(d.name)}${countOf(d, card.number) ? ` (×${countOf(d, card.number)})` : ''}</option>`).join('')}<option value="new" ${pick === 'new' ? 'selected' : ''}>+ New deck</option></select>
          <button class="btn primary" id="add-btn">Add to deck</button>${cur ? ` <a class="small" href="#/deck/${encodeURIComponent(cur.id)}">Open deck</a>` : ''}<span class="muted small" role="status" aria-live="polite"> ${esc(msg)}</span>`;
      };
      draw();
      box.addEventListener('change', (e) => { if (e.target.id === 'deck-pick') { pick = e.target.value; msg = ''; draw(); } });
      box.addEventListener('click', (e) => {
        if (e.target.id !== 'add-btn') return;
        let deck = pick === 'new' ? emptyDeck(`Deck ${listDecks().length + 1}`) : listDecks().find((d) => d.id === pick);
        const ok = canAdd(deck, card, byNumber);
        if (!ok.ok) { msg = ok.reason; return draw(); }
        deck = saveDeck(withCard(deck, card.number, +1)); pick = deck.id; msg = `Added (×${countOf(deck, card.number)})`; draw();
      });
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-copy]');
        if (!b) return;
        try { await navigator.clipboard.writeText(b.dataset.copy); b.textContent = 'Copied'; } catch { b.textContent = 'Press Ctrl+C'; }
        setTimeout(() => { b.textContent = 'Copy'; }, 1400);
      });
    },
  };
}
