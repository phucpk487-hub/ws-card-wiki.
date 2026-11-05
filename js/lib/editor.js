// Editing a set after import, and choosing a card's main picture. Pure helpers (applySetEdit, swapMainArt) plus the form markup; saving goes through updatePack.
import { updatePack } from '../import/store.js';
import { resetDb } from './db.js';
import { esc } from './ui.js';

const int = (v) => (String(v ?? '').trim() === '' || !Number.isFinite(+v) ? null : Math.max(0, Math.round(+v)));

export function applySetEdit(set, v) {
  const total = int(v.total);
  return { ...set, name: String(v.name ?? '').trim() || set.name, type: String(v.type ?? '').trim() || set.type, series: String(v.series ?? '').trim() || set.series,
    releaseDate: String(v.releaseDate ?? '').trim() || set.releaseDate, description: String(v.description ?? '').trim(), total: total || set.total };
}

/** Make alternate picture number `i` the main one; the old main picture becomes that alternate (nothing is lost). */
export function swapMainArt(card, i) {
  const alts = [...(card.altImages || [])];
  if (!alts[i]) return card;
  const next = alts[i];
  if (card.image) alts[i] = card.image; else alts.splice(i, 1);
  return { ...card, image: next, altImages: alts };
}

export async function saveMainArt(set, number, i, shown) {
  await updatePack(set.packId, (pack) => {
    const k = pack.cards.findIndex((c) => c.number === number);
    if (k < 0) throw new Error(`Card ${number} was not found in this set.`);
    if ((pack.cards[k].altImages || []).length !== shown) throw new Error('The saved pictures do not match what is shown. Reload the page and try again.');
    pack.cards[k] = swapMainArt(pack.cards[k], i);
  });
  resetDb();
}

export async function saveSetEdit(set, values) {
  await updatePack(set.packId, (pack) => {
    pack.set = applySetEdit(pack.set, values);
    if (pack.set.series !== set.series) pack.cards = pack.cards.map((c) => ({ ...c, series: pack.set.series }));
  });
  resetDb();
}

const field = (label, inner) => `<label>${label}${inner}</label>`;
export function setFormHtml(s, types) {
  return `<form class="panel edit-form" id="edit-form" autocomplete="off"><h2>Edit set</h2>
    <div class="fields">
      ${field('Name', `<input name="name" value="${esc(s.name)}" required>`)}
      ${field('Type', `<input name="type" list="edit-types" value="${esc(s.type)}">`)}
      ${field('Series', `<input name="series" value="${esc(s.series)}">`)}
      ${field('Release date', `<input name="releaseDate" type="date" value="${esc(s.releaseDate || '')}">`)}
      ${field('Total cards in set', `<input name="total" type="number" min="1" inputmode="numeric" value="${s.total ?? ''}">`)}
    </div>
    ${field('Description', `<textarea name="description" rows="3">${esc(s.description || '')}</textarea>`)}
    <datalist id="edit-types">${types.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
    <div class="toolbar"><button class="btn primary" type="submit">Save changes</button><button class="btn" type="button" data-cancel>Cancel</button></div>
    <p class="muted" id="edit-err" role="status"></p></form>`;
}

export function formValues(form) {
  const v = {};
  for (const el of form.elements) { if (!el.name || el.disabled) continue; v[el.name] = el.type === 'checkbox' ? el.checked : el.value; }
  return v;
}
