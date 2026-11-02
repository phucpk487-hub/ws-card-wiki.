import { openPdf } from '../import/pdfReader.js';
import { parseSheet } from '../import/parse.js';
import { isTableSheet, parseTableSheet } from '../import/tableSheet.js';
import { parseSheetLink, csvUrls, pdfUrl, parseSheetCsv, parseCardPage, gridToPage, looksLikeHtml } from '../import/sheetLink.js';
import { openZip, sheetList, sheetRows, sheetPictures, pageFromSheet } from '../import/xlsx.js';
import { isNativeApp } from '../lib/files.js';
import { detectColor, powerCrop, soulCount, hasSoulTrigger, detectTrigger, detectClimaxTriggers, detectCounter, readPowerCanvas, toBlob } from '../import/images.js';
import { powerTemplates, learnPower, learnedDigitsText } from '../import/powerLearn.js';
import { savePack, deletePack, listPacks, listKnownCards } from '../import/store.js';
import { fillTraits } from '../import/known.js';
import { resetDb } from '../lib/db.js';
import { setsToJson, setsFromJson } from '../lib/backup.js';
import { saveFile } from '../lib/files.js';
import { requestPersistence } from '../lib/persist.js';
import { hiddenSets } from '../lib/hiddenSets.js';
import { restoreHiddenSet } from '../lib/setAdmin.js';
import { esc, formatDate, setHref } from '../lib/ui.js';
import { canonicalTrigger, canonicalTriggers } from '../lib/triggers.js';

const COLORS = ['Yellow', 'Green', 'Red', 'Blue', 'Purple', 'White', 'Colorless'];
const TRIGGERS = ['Soul', 'Pool', 'Draw', 'Come Back', 'Shot', 'Bounce', 'Gate', 'Standby', 'Treasure', 'Choice', 'Bar', 'Door', 'Pants'];
const SET_TYPES = ['Booster Pack', 'Trial Deck', 'Extra Booster', 'Premium Booster', 'Promo', 'Other'];
const slug = (s) => String(s).replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');

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
      ${this.error ? `<div class="state error" role="alert"><p>${esc(this.error)}</p>${this.errorLink ? `<p>Download it with your browser instead: <a class="btn" href="${esc(this.errorLink)}" target="_blank" rel="noopener">Download the PDF</a></p><p class="muted small">When the browser has finished, come back here and choose that file under “Choose a PDF”.</p>` : ''}</div>` : ''}
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
      <form id="sheet-form" class="panel imp-form">
        <h2 style="margin-top:0">Or read a Google Sheets link</h2>
        <p class="muted small">For a sheet with one table per card (Level, Cost, Power, Trait, Card No., Rarity, Color, Souls, Trigger, Effect). The sheet must be shared as “Anyone with the link can view”. The card data is read; pictures are not in a sheet, so these cards come without pictures.</p>
        <div class="fields">
          <label>Sheet link<input id="s-link" name="link" required inputmode="url" placeholder="https://docs.google.com/spreadsheets/d/…"></label>
          <label>Tab <span class="muted">(its number from “#gid=…”, or its name)</span><input id="s-tab" name="tab" placeholder="e.g. 1829 or Persona 5X"></label>
          <label>Set name<input id="s-name" name="name" required placeholder="e.g. Persona 5X (Chinese exclusive)"></label>
          <label>Series<input id="s-series" name="series" required placeholder="e.g. Persona 5: The Phantom X"></label>
          <label>Set type<select id="s-type" name="type">${SET_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></label>
        </div>
        <label class="check"><input type="checkbox" id="s-pics" name="pics"> Also get the pictures <span class="muted small">(downloads the tab as a PDF, which is much bigger and slower; needs the tab number)</span></label>
        <button class="btn primary" type="submit">Read sheet</button>
      </form>
      <form id="xlsx-form" class="panel imp-form">
        <h2 style="margin-top:0">Or read an Excel file (.xlsx)</h2>
        <p class="muted small">The Excel version of a card sheet (one table per card, with the pictures in the sheet). Card data and pictures are both read. Big files are read piece by piece, so even several hundred MB is fine.</p>
        <label class="drop" for="xl-file"><input id="xl-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required><strong id="xl-label">Choose an Excel file</strong></label>
        <div class="fields">
          <label>Tab<select id="xl-tab" name="tab" disabled><option>Choose the file first</option></select></label>
          <label>Set name<input id="xl-name" name="name" required placeholder="e.g. Persona 5X (Chinese exclusive)"></label>
          <label>Series<input id="xl-series" name="series" required placeholder="e.g. Persona 5: The Phantom X"></label>
          <label>Set type<select name="type">${SET_TYPES.map((t) => `<option>${t}</option>`).join('')}</select></label>
        </div>
        <button class="btn primary" type="submit">Read Excel file</button>
        <p id="xl-msg" class="muted small" role="status"></p>
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
    this.el.querySelector('#sheet-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      this.form = { name: fd.get('name').trim(), series: fd.get('series').trim(), type: fd.get('type'), date: '', code: '' };
      this.error = ''; this.errorLink = '';
      this.readSheet(fd.get('link'), fd.get('tab'), fd.get('pics') === 'on');
    });
    const xl = this.el.querySelector('#xl-file'), xlMsg = this.el.querySelector('#xl-msg'), xlTab = this.el.querySelector('#xl-tab');
    xl.addEventListener('change', async () => {
      const f = xl.files[0]; if (!f) return;
      this.el.querySelector('#xl-label').textContent = f.name; xlMsg.textContent = 'Looking at the tabs…';
      try {
        const tabs = await sheetList(await openZip(f));
        xlTab.innerHTML = tabs.map((t, i) => `<option value="${i}">${esc(t.name)}</option>`).join(''); xlTab.disabled = false;
        const nm = this.el.querySelector('#xl-name'); if (!nm.value) nm.value = tabs[0] ? tabs[0].name : '';
        xlTab.onchange = () => { nm.value = tabs[+xlTab.value].name; };
        xlMsg.textContent = `${tabs.length} tab${tabs.length === 1 ? '' : 's'} found. Choose the one with the cards.`;
      } catch (err) { xlMsg.textContent = err.message; xlTab.disabled = true; }
    });
    this.el.querySelector('#xlsx-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      this.form = { name: fd.get('name').trim(), series: fd.get('series').trim(), type: fd.get('type'), date: '', code: '' };
      this.error = ''; this.errorLink = '';
      this.readXlsx(xl.files[0], +fd.get('tab') || 0);
    });
    this.el.addEventListener('click', async (e) => {
      const r = e.target.closest('[data-restore]');
      if (r) { restoreHiddenSet(r.dataset.restore); this.start(); return; }
      const b = e.target.closest('[data-del]');
      if (!b) return;
      if (b.dataset.armed !== '1') { const nm = (b.closest('.imp-row')?.querySelector('strong')?.textContent || 'this set').trim(); b.dataset.armed = '1'; b.textContent = `Delete “${nm}”? Click again`; setTimeout(() => { b.dataset.armed = ''; b.textContent = 'Delete'; }, 3000); return; }
      try { await deletePack(b.dataset.del); resetDb(); this.start(); } catch (err) { this.error = `Could not delete: ${err.message}`; this.start(); }
    });
  }

  /** Say what is actually wrong with a file pdf.js rejected, so the cause is visible instead of a bare "not valid". */
  invalidPdfMessage() {
    const f = this.fileInfo || { size: 0, head: '' }, kb = Math.round(f.size / 1024);
    if (!f.size) return 'That file is empty (0 KB). The phone could not read it from where it is stored: copy it to the Downloads folder and choose it again.';
    if (!f.head.startsWith('%PDF')) return `That file (${kb} KB) is not a PDF: it starts with “${f.head}”. It may be a web page or a download that failed. Save the page as PDF (Print, then Save as PDF) and choose that file.`;
    return `That PDF (${kb} KB) looks damaged or uses a format this reader cannot open. Open it in a PDF viewer and print it again to a new PDF (Print, then Save as PDF), then choose the new file.`;
  }

  /* ───────── step 2: read + process ───────── */
  progress(text, value) {
    this.el.innerHTML = `<h1>Reading ${esc(this.file?.name || 'PDF')}</h1><div class="panel" role="status" aria-live="polite"><p>${esc(text)}</p><progress max="100" value="${Math.round(value)}"></progress></div>`;
  }

  async read(file) {
    this.errorLink = '';
    if (!file) { this.error = 'Choose a PDF file first.'; return this.start(); }
    try {
      this.progress('Opening PDF…', 2);
      this.fileInfo = { size: file.size, head: String.fromCharCode(...new Uint8Array(await file.slice(0, 8).arrayBuffer())).replace(/[^\x20-\x7e]/g, '?') };
      const pdf = await openPdf(file);
      const templates = powerTemplates(), items = [];
      this.warnings = []; this.form.code = '';
      // One page at a time: read its text, find its cards, read their pictures, then let go of the page's memory.
      for (let n = 1; n <= pdf.numPages; n++) {
        this.progress(`Reading page ${n} of ${pdf.numPages} (${items.length} cards so far)…`, 2 + ((n - 1) / pdf.numPages) * 96);
        const model = await pdf.getPage(n);
        const parsed = isTableSheet([model]) ? parseTableSheet([model]) : parseSheet([model]);
        this.warnings.push(...parsed.warnings);
        for (const card of parsed.cards) items.push(await this.processCard(card, model, templates));
        pdf.release(n);
        await new Promise((r) => setTimeout(r)); // let the progress bar paint
      }
      if (!items.length) throw new Error('No card rows were found. This importer expects a sheet with card numbers like “ABC/S01-001” in the left column, or one table per card. Scanned (image-only) PDFs are not supported.');
      pdf.destroy();
      await this.finish(items);
    } catch (err) {
      console.error(err);
      const friendly = { InvalidPDFException: this.invalidPdfMessage(), PasswordException: 'That PDF is password protected. Remove the password and try again.', MissingPDFException: 'That PDF could not be found.' };
      this.error = friendly[err.name] || err.message || 'Could not read that PDF.';
      this.start();
    }
  }

  /** Read one card's pictures: colour, power, soul, triggers, counter; returns the review item. */
  /** Download a sheet tab as CSV. In the phone app the request goes out natively (no browser cross-origin limits). */
  async fetchSheet(link, tab) {
    const ref = parseSheetLink(link);
    if (!ref) throw new Error('That does not look like a Google Sheets link. It should contain “docs.google.com/spreadsheets/d/…”.');
    const http = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorHttp;
    const get = async (url) => {
      if (isNativeApp() && http && http.get) { const r = await http.get({ url, responseType: 'text' }); return { status: r.status, text: String(r.data ?? '') }; }
      const r = await fetch(url); return { status: r.status, text: await r.text() };
    };
    let last = '';
    for (const { url, exact } of csvUrls(ref, tab)) {
      try {
        const r = await get(url);
        if (r.status === 200 && r.text && !looksLikeHtml(r.text)) { if (!exact) this.sheetNote = 'Read by tab name: Google can leave out some cells that way. If anything is missing, use the tab number from the address (#gid=…) instead.'; return r.text; }
        last = r.status === 200 ? 'private' : `status ${r.status}`;
      } catch (err) { last = `network: ${err.message}`; }
    }
    if (last === 'private' || /status (401|403|404)/.test(last)) throw new Error('Google would not give the sheet to the app. Open the sheet, tap Share, set General access to “Anyone with the link” (Viewer), and try again. Also check the tab number or name.');
    throw new Error(`Could not download the sheet (${last}). Check your connection, then try again.`);
  }

  /** Download the tab as a PDF and hand it to the normal PDF reader, which also finds the pictures. */
  async readSheetPdf(link, tab) {
    this.errorLink = '';
    const ref = parseSheetLink(link), url = ref && pdfUrl(ref, tab);
    if (!ref) throw new Error('That does not look like a Google Sheets link.');
    if (!url) throw new Error('Pictures need the tab number. Open the tab in a browser and copy the digits after “#gid=” from the address, then put them in the Tab box (or paste the whole address).');
    this.file = { name: 'Google Sheets' }; this.progress('Downloading the tab as a PDF (this can take a while)…', 10);
    const P = window.Capacitor && window.Capacitor.Plugins;
    let blob;
    if (isNativeApp() && P && P.Filesystem && P.Filesystem.downloadFile) {
      let r;
      try { r = await P.Filesystem.downloadFile({ url, path: 'sheet-download.pdf', directory: 'CACHE', connectTimeout: 600000, readTimeout: 1800000 }); }
      catch (err) { this.errorLink = url; throw new Error(`The app could not download the PDF from Google (${String(err.message || err).split(':')[0]}). A file this big often fails inside the app.`); }
      blob = await (await fetch(window.Capacitor.convertFileSrc(r.path))).blob();
    } else {
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Google would not give the PDF (status ${r.status}). Check that the sheet is shared as “Anyone with the link”.`);
      blob = await r.blob();
    }
    const head = String.fromCharCode(...new Uint8Array(await blob.slice(0, 5).arrayBuffer()));
    if (head !== '%PDF-') throw new Error('Google did not send a PDF. Set the sheet to “Anyone with the link can view” and check the tab number.');
    const f = new File([blob], 'sheet.pdf', { type: 'application/pdf' });
    this.file = f; await this.read(f);
  }

  async readSheet(link, tab, pictures = false) {
    if (pictures) {
      try { await this.readSheetPdf(link, tab); } catch (err) { console.error(err); this.error = err.message || 'Could not get the PDF.'; this.start(); }
      return;
    }
    try {
      this.file = { name: 'Google Sheets' }; this.sheetNote = '';
      this.progress('Downloading the sheet…', 15);
      const text = await this.fetchSheet(link, tab);
      this.progress('Reading the cards…', 60);
      const parsed = parseSheetCsv(text);
      this.warnings = [...parsed.warnings]; if (this.sheetNote) this.warnings.push(this.sheetNote);
      const templates = powerTemplates(), items = [];
      for (const card of parsed.cards) items.push(await this.processCard(card, { images: [] }, templates));
      if (!items.length) throw new Error('No cards were found in that tab.');
      this.warnings = this.warnings.filter((w) => !/has no image for this card/.test(w));
      this.warnings.push('Cards from a sheet have no pictures.');
      await this.finish(items);
    } catch (err) {
      console.error(err);
      this.error = err.message || 'Could not read that sheet.';
      this.start();
    }
  }

  /** An Excel workbook: the tab's cells become the card tables, and the pictures over the cells go to the cards beside them. */
  async readXlsx(file, tabIndex) {
    try {
      if (!file) throw new Error('Choose an Excel file first.');
      this.file = file; this.progress('Opening the workbook…', 3);
      const zip = await openZip(file), tab = (await sheetList(zip))[tabIndex];
      if (!tab) throw new Error('That tab was not found.');
      this.progress(`Reading the cells of “${tab.name}”…`, 8);
      const page = pageFromSheet(zip, await sheetRows(zip, tab.path), await sheetPictures(zip, tab.path), gridToPage);
      const parsed = parseCardPage(page);
      if (!parsed.cards.length) throw new Error('No cards were found in that tab.');
      this.warnings = [...parsed.warnings];
      const templates = powerTemplates(), items = [];
      for (const card of parsed.cards) {
        this.progress(`Reading card ${items.length + 1} of ${parsed.cards.length} (${card.number})…`, 10 + (items.length / parsed.cards.length) * 88);
        items.push(await this.processCard(card, page, templates));
        await new Promise((r) => setTimeout(r));
      }
      await this.finish(items);
    } catch (err) {
      console.error(err);
      this.error = err.message || 'Could not read that Excel file.';
      this.start();
    }
  }

  /** Common end of every import: duplicates, borrowed traits, set code, then the review screen. */
  async finish(items) {
    const seen = new Set();
    for (const { card } of items) { if (seen.has(card.number)) this.warnings.push(`duplicate card number ${card.number}`); seen.add(card.number); }
    const filled = fillTraits(items, await listKnownCards());
    for (const w of filled) { const num = w.split(':')[0]; this.warnings = this.warnings.filter((x) => !x.startsWith(`${num}: no trait list`)); }
    this.warnings.push(...filled);
    this.form.code = items[0].card.number.replace(/-\d+[A-Za-z]*$/, '');
    this.items = items;
    this.review();
  }

  async processCard(card, model, templates) {
        const ref = card._img, pg = model;
        const item = { card, mainBlob: null, altBlobs: [], crop: null, url: null };
        if (card._table) { item.power = card.power; item.soul = card.soul; item.glyphs = []; }   // text sheets carry the values even when a card has no picture
        let mainP = null;   // encoding runs off the main thread, so it overlaps with the analysis below and with the alternate pictures
        if (ref.main !== null) {
          const canvas = await pg.images[ref.main].pixels();
          if (card._table) {                       // table sheets print every value as text: use it, only check the Counter icon on the picture
            item.power = card.power; item.soul = card.soul; item.glyphs = [];
            if (!card.color) card.color = detectColor(canvas);
            card.counter = card.type !== 'Climax' && detectCounter(canvas);
            mainP = toBlob(canvas);
          } else {
          card.color = detectColor(canvas);
          if (card.type === 'Character') { item.crop = powerCrop(canvas); item.soul = soulCount(canvas); const pw = readPowerCanvas(canvas, templates); item.power = card._hp ?? pw.value; item.glyphs = pw.glyphs; }
          // An Event prints no power or soul. The sheet header of some Events looks like a Character's, so also treat a card as an Event
          // when it is called "Event", or no power could be read and there is no soul icon (or no traits): Events print none of these. The review screen lets you undo this.
          if (card.type === 'Character' && (/^event$/i.test(card.name) || (item.power == null && (item.soul == null || !card.traits.length)))) {
            card.type = 'Event'; item.power = null; item.glyphs = []; item.crop = null; item.soul = null;
            this.warnings.push(`${card.number}: read as an Event (no power and no soul icon, or no power and no traits); change the type if that is wrong.`);
          }
          item.soulTrigger = card.type !== 'Climax' && hasSoulTrigger(canvas);
          if (item.soulTrigger && !card.triggers.includes('Soul')) card.triggers.push('Soul');
          else if (card.type !== 'Climax' && !card.triggers.length) {
            const t = detectTrigger(canvas);
            if (t) { card.triggers.push(t); item.triggerGuess = t; }
          }
          if (card.type === 'Climax') {
            const seen = detectClimaxTriggers(canvas);                  // one or two icons printed on the card
            const named = canonicalTriggers(card.triggers);              // the PDF text names the first icon; trust that over the picture
            const list = named.length ? [named[0], ...seen.slice(1)] : seen;
            if (list.length) { card.triggers = [...new Set(list)]; item.triggerGuess = card.triggers.join(', '); }
          }
          card.triggers = canonicalTriggers(card.triggers);
          card.counter = card.type !== 'Climax' && detectCounter(canvas);
          mainP = toBlob(canvas);
          }
        } else { if (!card._table) card.color = null; this.warnings.push(`${card.number}: the PDF has no image for this card.`); }
        const altP = ref.alts.map(async (a) => toBlob(await pg.images[a].pixels(), 420, .75));
        if (mainP) { item.mainBlob = await mainP; item.url = URL.createObjectURL(item.mainBlob); this.urls.push(item.url); }
        item.altBlobs = await Promise.all(altP);
        Object.assign(card, { power: card.type === 'Character' ? (item.power ?? null) : null, soul: card.type === 'Character' ? (item.soul ?? null) : null, counter: !!card.counter });
        return item;
  }

  /* ───────── step 3: review and fill in what the PDF cannot tell us ───────── */
  missing() {
    const ch = this.items.filter((i) => i.card.type === 'Character');
    return { power: ch.filter((i) => i.card.power === null).length, soul: ch.filter((i) => i.card.soul === null).length, color: this.items.filter((i) => !i.card.color).length };
  }

  review() {
    const { form } = this;
    const rows = this.items.map((it, i) => this.rowHtml(it, i)).join('');
    this.reviewShell(form, rows);
  }

  rowHtml(it, i) {
      const c = it.card, ch = c.type === 'Character';
      return `<tr data-i="${i}">
        <td>${it.url ? `<img class="thumb" src="${it.url}" alt="${esc(c.name)}">` : '<div class="thumb none" aria-label="No image">–</div>'}</td>
        <td><strong>${esc(c.number)}</strong><div>${esc(c.name)}</div><select data-k="type" aria-label="Type of ${esc(c.number)}">${['Character', 'Event', 'Climax'].map((t) => `<option ${t === c.type ? 'selected' : ''}>${t}</option>`).join('')}</select><div class="muted small">${c.type === 'Climax' ? 'Climax' : `${c.type === 'Event' ? 'Event · ' : ''}Lv ${c.level} · cost ${c.cost}${c.traits.length ? ` · ${esc(c.traits.join(' / '))}` : ''}`}</div></td>
        <td>${ch ? `${it.crop ? `<img class="crop" src="${it.crop}" alt="Power as printed on ${esc(c.number)}">` : ''}<input class="num-in" data-k="power" type="number" min="0" step="500" inputmode="numeric" aria-label="Power for ${esc(c.number)}" value="${c.power ?? ''}">` : '<span class="muted">–</span>'}</td>
        <td>${ch ? `<input class="num-in sm" data-k="soul" type="number" min="0" max="5" step="1" inputmode="numeric" aria-label="Soul for ${esc(c.number)}" value="${c.soul ?? ''}">` : '<span class="muted">–</span>'}</td>
        <td><select data-k="color" aria-label="Color for ${esc(c.number)}"><option value="">?</option>${COLORS.map((x) => `<option ${x === c.color ? 'selected' : ''}>${x}</option>`).join('')}</select></td>
        <td><input data-k="triggers" list="trig-list" aria-label="Triggers for ${esc(c.number)}" placeholder="e.g. Soul, Draw" value="${esc(c.triggers.join(', '))}"></td>
        <td>${c.type === 'Climax' ? '<span class="muted">–</span>' : `<input data-k="counter" type="checkbox" aria-label="Counter icon on ${esc(c.number)}" ${c.counter ? 'checked' : ''}>`}</td></tr>`;
  }

  reviewShell(form, rows) {
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
      <p class="muted small">Soul is counted from the icons on the card; please glance over it. Trigger icons (Soul, Treasure, Pool, Gate, Come Back, Draw, Shot, Standby, Choice, Bounce) are recognised from the icon on the card, climaxes with two icons get both, and the Counter box is ticked when the yellow fist icon is printed under the cost; check them, especially Bounce and Standby, and add any other kind by hand. Power is read from the number on the card; compare it with the zoomed crop, and type it in when it is empty. A digit the reader has never seen (such as 3) is learned after you type it once. Press Enter in a power box to jump to the next card.</p>
      <div class="table-wrap"><table class="data imp-table"><thead><tr><th></th><th>Card</th><th>Power</th><th>Soul</th><th>Color</th><th>Trigger</th><th>Counter</th></tr></thead><tbody id="rows">${rows}</tbody></table></div>
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
    if (k === 'counter') { c.counter = e.target.checked; return; }
    if (k === 'type') {                                          // Events and Climaxes have no power or soul; Climaxes have no level, cost or counter
      const i = Number(e.target.closest('tr').dataset.i), tr = e.target.closest('tr');
      c.type = v;
      if (v !== 'Character') { c.power = null; c.soul = null; }
      if (v === 'Climax') { c.level = null; c.cost = null; c.counter = false; }
      tr.outerHTML = this.rowHtml(this.items[i], i);
      this.updateMissing(); return;
    }
    if (k === 'power' || k === 'soul') c[k] = v === '' ? null : Math.max(0, Math.round(Number(v)));
    if (k === 'power' && c.power && c.power % 500 === 0) learnPower(this.items[Number(e.target.closest('tr').dataset.i)].glyphs || [], String(c.power));
    else if (k === 'color') c.color = v || null;
    else if (k === 'triggers') c.triggers = canonicalTriggers(v.split(','));
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
        delete out._img; delete out._table; delete out._hp;
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
