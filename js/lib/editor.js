// Editing cards and sets after they were imported. Pure helpers (applyCardEdit, applySetEdit) plus the form markup; saving goes through updatePack.
import { updatePack } from '../import/store.js';
import { resetDb } from './db.js';
import { canonicalTriggers } from './triggers.js';
import { esc } from './ui.js';

export const COLORS = ['Yellow', 'Green', 'Red', 'Blue', 'Purple', 'White', 'Colorless'];
export const TYPES = ['Character', 'Event', 'Climax'];
const TRIGGERS = ['Soul', 'Pool', 'Draw', 'Come Back', 'Shot', 'Bounce', 'Gate', 'Standby', 'Treasure', 'Choice', 'Bar', 'Door', 'Pants'];
const int = (v) => (String(v ?? '').trim() === '' || !Number.isFinite(+v) ? null : Math.max(0, Math.round(+v)));
const list = (v) => String(v ?? '').split(',').map((t) => t.trim()).filter(Boolean);

/** values: raw form values (strings / booleans). Returns the edited copy of card. Climax has no level, cost, power, soul or counter; only Characters have power and soul. */
export function applyCardEdit(card, v) {
  const type = TYPES.includes(v.type) ? v.type : card.type;
  const out = { ...card, type, name: String(v.name ?? card.name).trim() || card.name, color: COLORS.includes(v.color) ? v.color : null };
  out.level = type === 'Climax' ? null : int(v.level); out.cost = type === 'Climax' ? null : int(v.cost);
  out.power = type === 'Character' ? int(v.power) : null; out.soul = type === 'Character' ? int(v.soul) : null;
  out.counter = type !== 'Climax' && !!v.counter;
  out.triggers = canonicalTriggers(list(v.triggers)); out.traits = list(v.traits);
  const rarity = String(v.rarity ?? '').trim(); out.rarity = rarity; out.rarities = rarity ? [rarity] : [];
  out.illustrator = String(v.illustrator ?? '').trim();
  out.effect = String(v.effect ?? '').split('\n').map((t) => t.trim()).filter(Boolean);
  return out;
}

export function applySetEdit(set, v) {
  const total = int(v.total);
  return { ...set, name: String(v.name ?? '').trim() || set.name, type: String(v.type ?? '').trim() || set.type, series: String(v.series ?? '').trim() || set.series,
    releaseDate: String(v.releaseDate ?? '').trim() || set.releaseDate, description: String(v.description ?? '').trim(), total: total || set.total };
}

export async function saveCardEdit(set, number, values) {
  await updatePack(set.packId, (pack) => {
    const i = pack.cards.findIndex((c) => c.number === number);
    if (i < 0) throw new Error(`Card ${number} was not found in this set.`);
    pack.cards[i] = applyCardEdit(pack.cards[i], values);
  });
  resetDb();
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
const sel = (k, opts, cur, blank) => `<select name="${k}">${blank ? '<option value="">?</option>' : ''}${opts.map((o) => `<option ${o === cur ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;

export function cardFormHtml(c) {
  const ch = c.type === 'Character', cl = c.type === 'Climax';
  return `<form class="panel edit-form" id="edit-form" autocomplete="off"><h2>Edit card</h2>
    <div class="fields">
      ${field('Name', `<input name="name" value="${esc(c.name)}" required>`)}
      ${field('Type', sel('type', TYPES, c.type))}
      ${field('Color', sel('color', COLORS, c.color, true))}
      ${field('Level', `<input name="level" type="number" min="0" inputmode="numeric" value="${c.level ?? ''}" ${cl ? 'disabled' : ''}>`)}
      ${field('Cost', `<input name="cost" type="number" min="0" inputmode="numeric" value="${c.cost ?? ''}" ${cl ? 'disabled' : ''}>`)}
      ${field('Power', `<input name="power" type="number" min="0" step="500" inputmode="numeric" value="${c.power ?? ''}" ${ch ? '' : 'disabled'}>`)}
      ${field('Soul', `<input name="soul" type="number" min="0" max="5" inputmode="numeric" value="${c.soul ?? ''}" ${ch ? '' : 'disabled'}>`)}
      ${field('Rarity', `<input name="rarity" value="${esc((c.rarities && c.rarities[0]) || c.rarity || '')}">`)}
      ${field('Illustrator', `<input name="illustrator" value="${esc(c.illustrator || '')}">`)}
      ${field('Triggers (comma separated)', `<input name="triggers" list="edit-trig" value="${esc((c.triggers || []).join(', '))}">`)}
      ${field('Traits (comma separated)', `<input name="traits" value="${esc((c.traits || []).join(', '))}">`)}
    </div>
    <label class="check"><input name="counter" type="checkbox" ${c.counter ? 'checked' : ''} ${cl ? 'disabled' : ''}> Counter</label>
    ${field('Card text (one ability per line)', `<textarea name="effect" rows="6">${esc((c.effect || []).join('\n'))}</textarea>`)}
    <datalist id="edit-trig">${TRIGGERS.map((t) => `<option value="${t}">`).join('')}</datalist>
    <div class="toolbar"><button class="btn primary" type="submit">Save changes</button><button class="btn" type="button" data-cancel>Cancel</button></div>
    <p class="muted" id="edit-err" role="status"></p></form>`;
}

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
