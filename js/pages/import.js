import { readPdf } from '../import/pdfReader.js';
import { parseSheet } from '../import/parse.js';
import { detectColor, powerCrop, nameCrop, soulCount, hasSoulTrigger, detectTrigger, readPowerCanvas, toBlob } from '../import/images.js';
import { powerTemplates, learnPower, learnedDigitsText } from '../import/powerLearn.js';
import { savePack, deletePack, listPacks } from '../import/store.js';
import { resetDb } from '../lib/db.js';
import { setsToJson, setsFromJson } from '../lib/backup.js';
import { saveFile } from '../lib/files.js';
import { requestPersistence } from '../lib/persist.js';
import { hiddenSets } from '../lib/hiddenSets.js';
import { restoreHiddenSet } from '../lib/setAdmin.js';
import { esc, formatDate, setHref } from '../lib/ui.js';

const COLORS = ['Yellow', 'Green', 'Red', 'Blue', 'Purple', 'White', 'Colorless'];
const TRIGGERS = ['Soul', 'Pool', 'Draw', 'Come Back', 'Shot', 'Bounce', 'Gate', 'Standby', 'Treasure', 'Choice', 'Bar', 'Door', 'Pants'];
const SET_TYPES = ['Booster Pack', 'Trial Deck', 'Extra Booster', 'Premium Booster', 'Promo', 'Other'];
const slug = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titleCase = (s) => s.trim().replace(/\s+/g, ' ').split(' ').map((w) => w[0].toUpperCase() + w.slice(1).toLowerCase()).join(' ');

export async function render({ navigate }) {
  return {
    title: 'Import cards',
    html: '<div class="container narrow-wide" id="imp"></div>',
    mount(root) { new Importer(root.querySelector('#imp'), navigate).start(); },
  };
}

class Importer {
  constructor(el, navigate) {
    this.el = el; this.navigate = navigate;
    this.form = { name: '', series: '', type: 'Booster Pack', date: '', code: '' };
    this.items = []; this.warnings = []; this.error = ''; this.urls = [];
  }

  /* ───────── step 1: choose a file ───────── */
  async start() {
    this.freeUrls(); this.items = [];
    const saved = await listPacks();
    this.el.innerHTML = `
      <h1>Import cards</h1>
      <p class="lead">Add a card sheet PDF to the database. Everything is read and stored in this browser; nothing is uploaded.</p>
      ${this.error ? `<div class="state error" role="alert"><p>${esc(this.error)}</p></div>` : ''}
      <form id="imp-form" class="panel imp-form">
        <label class="drop" id="drop" for="pdf">
          <input id="pdf" type="file" accept="application/pdf,.pdf" required>
          <strong id="file-label">Choose a PDF or drop it here</strong>
          <span class="muted small">One row per card: card number, “(N) 1/0 Name (Traits)” header, effect text and card images.</span>
        </label>
        <div class="fields">
          <label>Set name<input id="f-name" name="name" required placeholder="e.g. BanG Dream! 10th Anniversary Premium Booster" value="${esc(this.form.name)}"></label>
          <label>Series<input id="f-series" name="series" required placeholder="e.g. BanG Dream!" value="${esc(this.form.series)}"></label>
          <label>Set type<select id="f-type" name="type">${SET_TYPES.map((t) => `<option ${t === this.form.type ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          <label>Release date <span class="muted">(optional)</span><input id="f-date" name="date" type="date" value="${esc(this.form.date)}"></label>
        </div>
        <button class="btn primary" type="submit">Read PDF</button>
      </form>
      <h2>Imported sets</h2>
      <div id="imp-list">${saved.length ? `<ul class="list">${saved.map((p) => `<li class="imp-row"><div><a href="${setHref(p.set.code)}"><strong>${esc(p.set.name)}</strong></a>
        <div class="muted small">${esc(p.set.code)} · ${p.count} cards · saved ${formatDate(new Date(p.savedAt).toISOString().slice(0, 10))}</div></div>
        <button class="btn" data-del="${esc(p.id)}">Delete</button></li>`).join('')}</ul>`
        : '<p class="muted">Nothing imported yet.</p>'}</div>
      <div class="panel" id="bk-panel"><h3>Back up imported sets</h3>
        <p class="muted small">Browsers can clear saved data when the device is short on space. Keep a backup file of your imported sets, and restore it here if they ever disappear. <span id="persist-note"></span></p>
        <div class="toolbar"><button class="btn" id="bk-save" ${saved.length ? '' : 'disabled'}>Back up sets</button><label class="btn" for="bk-file">Restore sets</label><input id="bk-file" type="file" accept="application/json,.json" hidden></div>
        <p id="bk-msg" class="muted small" role="status"></p></div>
      <details class="panel" id="ld-panel"><summary><strong>Learned digits</strong></summary>
        <p class="muted small">Digits this app has learned from your corrections (for example the 3 in 3000 power). Copy the text and send it to whoever maintains the app so it can be built in for everyone.</p>
        <textarea id="ld-text" rows="4" readonly aria-label="Learned digits" style="width:100%"></textarea>
        <div class="toolbar"><button class="btn" id="ld-copy" type="button">Copy</button></div>
        <p id="ld-msg" class="muted small" role="status"></p></details>
      ${hiddenSets().length ? `<h2>Hidden sets</h2><ul class="list">${hiddenSets().map((c) => `<li class="imp-row"><div><strong>${esc(c)}</strong><div class="muted small">Deleted from the bundled data</div></div><button class="btn" data-restore="${esc(c)}">Restore</button></li>`).join('')}</ul>` : ''}
      <details class="panel"><summary><strong>Which PDFs work?</strong></summary>
        <p>Sheets laid out like the official card-list PDFs: a card number such as <code>BD/WE49-01</code> in the left column, the card text in the middle, card images beside it, and rarities in the last column.</p>
        <p>Power, color and soul icons are read from the card images automatically; check them in the table and type in anything left empty.</p></details>`;
    const file = this.el.querySelector('#pdf'), label = this.el.querySelector('#file-label'), drop = this.el.querySelector('#drop');
    const setFile = (f) => {
      if (!f) return;
      this.file = f; label.textContent = f.name;
      const nameEl = this.el.querySelector('#f-name');
      if (!nameEl.value) nameEl.value = f.name.replace(/\.pdf$/i, '').replace(/^[0-9a-f]{6,10}-/i, '').replace(/[-_]+/g, ' ').trim();
    };
    file.addEventListener('change', () => setFile(file.files[0]));
    ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f) { const dt = new DataTransfer(); dt.items.add(f); file.files = dt.files; setFile(f); }
    });
    const bkMsg = (t) => { this.el.querySelector('#bk-msg').textContent = t; };
    requestPersistence().then((s) => { const n = this.el.querySelector('#persist-note'); if (n) n.textContent = s === 'persistent' ? 'This device has agreed to keep your data.' : s === 'best-effort' ? 'This device may clear saved data if it runs low on space.' : ''; });
    const ld = this.el.querySelector('#ld-text'), ldMsg = this.el.querySelector('#ld-msg');
    ld.value = learnedDigitsText();
    if (!ld.value) ldMsg.textContent = 'Nothing learned yet. Import a set and type in a power that was left empty (such as one with a 3).';
    this.el.querySelector('#ld-copy').addEventListener('click', async () => {
      if (!ld.value) return;
      try { await navigator.clipboard.writeText(ld.value); ldMsg.textContent = 'Copied.'; }
      catch { ld.focus(); ld.select(); ldMsg.textContent = 'Press and hold the text, then choose Copy.'; }
    });
    this.el.querySelector('#bk-save').addEventListener('click', async () => {
      try { bkMsg('Preparing backup…'); bkMsg(await saveFile(`ws-sets-${new Date().toISOString().slice(0, 10)}.json`, new Blob([await setsToJson()], { type: 'application/json' }))); }
      catch (err) { bkMsg(`Could not save the backup: ${err.message}`); }
    });
    this.el.querySelector('#bk-file').addEventListener('change', async (e) => {
      const f = e.target.files[0]; e.target.value = ''; if (!f) return;
      try { bkMsg('Restoring…'); const n = await setsFromJson(await f.text()); resetDb(); bkMsg(`Restored ${n} set${n === 1 ? '' : 's'}.`); setTimeout(() => this.start(), 800); }
      catch (err) { bkMsg(err.message); }
    });
    this.el.querySelector('#imp-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      this.form = { name: fd.get('name').trim(), series: fd.get('series').trim(), type: fd.get('type'), date: fd.get('date') || '', code: '' };
      this.error = '';
      this.read(file.files[0] || this.file);
    });
    this.el.addEventListener('click', async (e) => {
      const r = e.target.closest('[data-restore]');
      if (r) { restoreHiddenSet(r.dataset.restore); this.start(); return; }
      const b = e.target.closest('[data-del]');
      if (!b) return;
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Click again to delete'; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Delete'; }, 3000); return; }
      try { await deletePack(b.dataset.del); resetDb(); this.start(); } catch (err) { this.error = `Could not delete: ${err.message}`; this.start(); }
    });
  }

  /* ───────── step 2: read + process ───────── */
  progress(text, value) {
    this.el.innerHTML = `<h1>Reading ${esc(this.file?.name || 'PDF')}</h1><div class="panel" role="status" aria-live="polite"><p>${esc(text)}</p><progress max="100" value="${Math.round(value)}"></progress></div>`;
  }

  async read(file) {
    if (!file) { this.error = 'Choose a PDF file first.'; return this.start(); }
    try {
      this.progress('Opening PDF…', 2);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { pages, destroy } = await readPdf(bytes, { onProgress: (n, t) => this.progress(`Reading text, page ${n} of ${t}…`, 2 + (n / t) * 28) });
      const parsed = parseSheet(pages);
      if (!parsed.cards.length) throw new Error('No card rows were found. This importer expects a sheet with card numbers like “ABC/S01-001” in the left column. Scanned (image-only) PDFs are not supported.');
      this.form.code = parsed.setCode;
      this.warnings = parsed.warnings.slice();
      const items = [], templates = powerTemplates();
      for (let i = 0; i < parsed.cards.length; i++) {
        this.progress(`Processing images, card ${i + 1} of ${parsed.cards.length}…`, 30 + (i / parsed.cards.length) * 68);
        const card = parsed.cards[i], ref = card._img, pg = pages[ref.page];
        const item = { card, mainBlob: null, altBlobs: [], crop: null, url: null };
        if (ref.main !== null) {
          const canvas = await pg.images[ref.main].pixels();
          card.color = detectColor(canvas);
          item.nameCrop = nameCrop(canvas);
          if (card.type === 'Character') { item.crop = powerCrop(canvas); item.soul = soulCount(canvas); const pw = readPowerCanvas(canvas, templates); item.power = pw.value; item.glyphs = pw.glyphs; }
          item.soulTrigger = card.type !== 'Climax' && hasSoulTrigger(canvas);
          if (item.soulTrigger && !card.triggers.includes('Soul')) card.triggers.push('Soul');
          else if (card.type !== 'Climax' && !card.triggers.length) {
            const t = detectTrigger(canvas);
            if (t) { card.triggers.push(t); item.triggerGuess = t; }
          }
          item.mainBlob = await toBlob(canvas);
          item.url = URL.createObjectURL(item.mainBlob); this.urls.push(item.url);
        } else { card.color = null; this.warnings.push(`${card.number}: the PDF has no image for this card.`); }
        for (const a of ref.alts) item.altBlobs.push(await toBlob(await pg.images[a].pixels()));
        Object.assign(card, { power: card.type === 'Character' ? (item.power ?? null) : null, soul: card.type === 'Character' ? (item.soul ?? null) : null, nameJp: null });
        items.push(item);
        if (i % 4 === 3) await new Promise((r) => setTimeout(r)); // let the progress bar paint
      }
      destroy?.();
      this.items = items;
      this.review();
    } catch (err) {
      console.error(err);
      const friendly = { InvalidPDFException: 'That file is not a valid PDF.', PasswordException: 'That PDF is password protected. Remove the password and try again.', MissingPDFException: 'That PDF could not be found.' };
      this.error = friendly[err.name] || err.message || 'Could not read that PDF.';
      this.start();
    }
  }

  /* ───────── step 3: review and fill in what the PDF cannot tell us ───────── */
  missing() {
    const ch = this.items.filter((i) => i.card.type === 'Character');
    return { power: ch.filter((i) => i.card.power === null).length, soul: ch.filter((i) => i.card.soul === null).length, color: this.items.filter((i) => !i.card.color).length };
  }

  review() {
    const { form } = this;
    const rows = this.items.map((it, i) => {
      const c = it.card, ch = c.type === 'Character';
      return `<tr data-i="${i}">
        <td>${it.url ? `<img class="thumb" src="${it.url}" alt="${esc(c.name)}">` : '<div class="thumb none" aria-label="No image">–</div>'}</td>
        <td><strong>${esc(c.number)}</strong><div>${esc(c.name)}</div><div class="muted small">${ch ? `Lv ${c.level} · cost ${c.cost} · ${esc(c.traits.join(' / '))}` : 'Climax'}</div></td>
        <td>${ch ? `${it.crop ? `<img class="crop" src="${it.crop}" alt="Power as printed on ${esc(c.number)}">` : ''}<input class="num-in" data-k="power" type="number" min="0" step="500" inputmode="numeric" aria-label="Power for ${esc(c.number)}" value="${c.power ?? ''}">` : '<span class="muted">–</span>'}</td>
        <td>${ch ? `<input class="num-in sm" data-k="soul" type="number" min="0" max="5" step="1" inputmode="numeric" aria-label="Soul for ${esc(c.number)}" value="${c.soul ?? ''}">` : '<span class="muted">–</span>'}</td>
        <td><select data-k="color" aria-label="Color for ${esc(c.number)}"><option value="">?</option>${COLORS.map((x) => `<option ${x === c.color ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
        <td><input data-k="triggers" list="trig-list" aria-label="Triggers for ${esc(c.number)}" placeholder="e.g. Soul, Draw" value="${esc(c.triggers.join(', '))}"></td>
        <td class="jp-cell">${it.nameCrop ? `<img class="crop wide" src="${it.nameCrop}" alt="Title bar of ${esc(c.number)}, showing the Japanese name">` : ''}<input data-k="nameJp" lang="ja" aria-label="Japanese name for ${esc(c.number)}" placeholder="Type or paste the name shown above" value="${esc(c.nameJp || '')}"></td></tr>`;
    }).join('');
    this.el.innerHTML = `
      <h1>Review ${this.items.length} cards</h1>
      <div class="panel imp-summary">
        <div class="fields">
          <label>Set code<input id="r-code" value="${esc(form.code)}"></label>
          <label>Set name<input id="r-name" value="${esc(form.name)}"></label>
        </div>
        <p id="miss" class="muted"></p>
        <div class="imp-actions">
          <button class="btn primary" id="save">Save ${this.items.length} cards</button>
          <button class="btn" id="cancel">Cancel</button>
          <span class="grow"></span>
          <label class="inline"><input type="checkbox" id="only-attn"> Only cards needing attention</label>
          <label class="inline">Fill empty soul with <select id="soul-fill"><option>0</option><option selected>1</option><option>2</option></select></label>
          <button class="btn" id="apply-soul">Apply</button>
        </div>
        <div id="save-err" class="state error" role="alert" hidden></div>
      </div>
      ${this.warnings.length ? `<details class="panel"><summary>${this.warnings.length} note${this.warnings.length === 1 ? '' : 's'} from reading the PDF</summary><ul>${this.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
      <p class="muted small">Soul is counted from the icons on the card; please glance over it. Trigger icons (Soul, Treasure, Pool, Gate, Come Back, Draw, Shot, Standby, Choice, Bounce) are recognised from the top-right icon; check them, especially Bounce and Standby, and add any other kind by hand. Power is read from the number on the card; compare it with the zoomed crop, and type it in when it is empty. A digit the reader has never seen (such as 3) is learned after you type it once. Press Enter in a power box to jump to the next card.</p>
      <div class="table-wrap"><table class="data imp-table"><thead><tr><th></th><th>Card</th><th>Power</th><th>Soul</th><th>Color</th><th>Trigger</th><th>Name (JP)</th></tr></thead><tbody id="rows">${rows}</tbody></table></div>
      <datalist id="trig-list">${TRIGGERS.map((t) => `<option value="${t}">`).join('')}</datalist>`;
    this.updateMissing();

    const $ = (s) => this.el.querySelector(s);
    const body = $('#rows');
    body.addEventListener('input', (e) => this.onEdit(e));
    body.addEventListener('change', (e) => this.onEdit(e));
    body.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || !e.target.dataset.k) return;
      e.preventDefault();
      let tr = e.target.closest('tr').nextElementSibling;
      while (tr && (tr.hidden || !tr.querySelector(`[data-k="${e.target.dataset.k}"]`))) tr = tr.nextElementSibling;
      tr?.querySelector(`[data-k="${e.target.dataset.k}"]`)?.focus();
    });
    $('#cancel').addEventListener('click', () => this.start());
    $('#save').addEventListener('click', () => this.save());
    $('#only-attn').addEventListener('change', () => this.filter());
    $('#apply-soul').addEventListener('click', () => {
      const v = Number($('#soul-fill').value);
      this.items.forEach((it, i) => { if (it.card.type === 'Character' && it.card.soul === null) { it.card.soul = v; body.querySelector(`tr[data-i="${i}"] [data-k="soul"]`).value = v; } });
      this.updateMissing(); this.filter();
    });
    $('#r-code').addEventListener('input', (e) => { form.code = e.target.value.trim(); });
    $('#r-name').addEventListener('input', (e) => { form.name = e.target.value.trim(); });
  }

  onEdit(e) {
    const k = e.target.dataset.k; if (!k) return;
    const c = this.items[Number(e.target.closest('tr').dataset.i)].card, v = e.target.value.trim();
    if (k === 'power' || k === 'soul') c[k] = v === '' ? null : Math.max(0, Math.round(Number(v)));
    if (k === 'power' && c.power && c.power % 500 === 0) learnPower(this.items[Number(e.target.closest('tr').dataset.i)].glyphs || [], String(c.power));
    else if (k === 'color') c.color = v || null;
    else if (k === 'triggers') c.triggers = [...new Set(v.split(',').map((t) => t.trim()).filter(Boolean).map(titleCase))];
    else if (k === 'nameJp') c.nameJp = v || null;
    this.updateMissing();
  }

  updateMissing() {
    const m = this.missing(), el = this.el.querySelector('#miss');
    if (el) el.textContent = m.power || m.soul || m.color
      ? `Still empty: ${m.power} power, ${m.soul} soul, ${m.color} color. You can save now and fill these in later by importing again.`
      : 'Everything is filled in.';
  }

  filter() {
    const only = this.el.querySelector('#only-attn').checked;
    this.el.querySelectorAll('#rows tr').forEach((tr) => {
      const c = this.items[Number(tr.dataset.i)].card;
      tr.hidden = only && !(c.color === null || (c.type === 'Character' && (c.power === null || c.soul === null)));
    });
  }

  /* ───────── step 4: save ───────── */
  async save() {
    const { form } = this, err = this.el.querySelector('#save-err'), btn = this.el.querySelector('#save');
    err.hidden = true;
    if (!form.code || !form.name) { err.textContent = 'Set code and set name are required.'; err.hidden = false; return; }
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      const id = slug(form.code), images = new Map();
      const cards = this.items.map((it) => {
        const c = it.card, s = slug(c.number), out = { ...c };
        delete out._img;
        Object.assign(out, { series: form.series, set: form.code, rarity: (c.rarities && c.rarities[0]) || '', flavor: '', illustrator: '', image: null, altImages: [] });
        const ext = (b) => (b.type === 'image/webp' ? 'webp' : 'jpg');
        if (it.mainBlob) { const k = `${id}/${s}.${ext(it.mainBlob)}`; images.set(k, it.mainBlob); out.image = `idb:${k}`; }
        it.altBlobs.forEach((b, n) => { const k = `${id}/${s}-alt${n + 1}.${ext(b)}`; images.set(k, b); out.altImages.push(`idb:${k}`); });
        return out;
      });
      const pack = {
        id, savedAt: Date.now(), cards,
        set: { code: form.code, name: form.name, series: form.series, type: form.type, releaseDate: form.date, total: cards.length, description: `${form.name}. Imported from a card sheet PDF.` },
      };
      await savePack(pack, images);
      resetDb();
      this.freeUrls();
      this.navigate(setHref(form.code));
    } catch (e) {
      console.error(e);
      err.textContent = `Could not save: ${e.message}`; err.hidden = false;
      btn.disabled = false; btn.textContent = `Save ${this.items.length} cards`;
    }
  }

  freeUrls() { this.urls.forEach((u) => URL.revokeObjectURL(u)); this.urls = []; }
}
