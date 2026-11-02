// Read card data from a Google Sheets link (a tab laid out like the per-card tables: name, Level/Cost/Power/Trait, Card No./Rarity/Color/Souls/Trigger, Effect).
// The sheet's cells become the same "page model" the PDF table reader uses, so the rules for type, soul, triggers and effects are shared.
// Pictures floating over the sheet are not part of any text export, so these cards come without pictures.
import { isTableSheet, parseTableSheet } from './tableSheet.js';

/** { id, gid } from a Google Sheets link, or null. gid is the tab number from "#gid=123" when the link has one. */
export function parseSheetLink(text) {
  const m = /\/spreadsheets\/d\/([\w-]{20,})/.exec(String(text || '').trim());
  if (!m) return null;
  const g = /[#&?]gid=(\d+)/.exec(text);
  return { id: m[1], gid: g ? g[1] : null };
}

/** Addresses to try, best first. A tab number gives a faithful CSV export; a tab name only works through the "visualization" endpoint. */
export function csvUrls({ id, gid }, tab = '') {
  const base = `https://docs.google.com/spreadsheets/d/${id}`, t = String(tab || '').trim();
  const byName = /^\d+$/.test(t) ? null : t;
  const g = /^\d+$/.test(t) ? t : gid;
  const urls = [];
  if (g || !byName) urls.push({ url: `${base}/export?format=csv&gid=${g || 0}`, exact: true });
  if (byName) urls.push({ url: `${base}/gviz/tq?tqx=out:csv&headers=0&sheet=${encodeURIComponent(byName)}`, exact: false });
  else urls.push({ url: `${base}/gviz/tq?tqx=out:csv&headers=0&gid=${g || 0}`, exact: false });
  return urls;
}

/** The tab as a PDF (pictures included), for the same reader that handles PDF files. Needs the tab number. */
export function pdfUrl({ id, gid }, tab = '') {
  const t = String(tab || '').trim(), g = /^\d+$/.test(t) ? t : gid;
  return g ? `https://docs.google.com/spreadsheets/d/${id}/export?format=pdf&gid=${g}&portrait=false&fitw=true&gridlines=false&printtitle=false&sheetnames=false&pagenum=UNDEFINED&attachment=false` : null;
}

/** True when Google answered with a web page (usually the sign-in page) instead of data. */
export const looksLikeHtml = (text) => /^\s*<(!doctype|html|head|body)/i.test(text || '');

/** CSV (RFC 4180: quoted cells may hold commas, quotes and new lines) to rows of strings. */
export function parseCsv(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  const src = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false; } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/** Rows of cells to a page model: one word per line of text in a cell, laid out on a grid so the PDF table reader can use it. */
export function gridToPage(rows) {
  const words = [];
  rows.forEach((cells, r) => cells.forEach((value, c) => {
    String(value).split(/\r?\n/).map((s) => s.trim()).filter(Boolean).forEach((line, k) => {
      words.push({ str: line, x0: c * 100, x1: c * 100 + 90, base: r * 100 + k * 10 + 50, size: 10 });
    });
  }));
  return { index: 0, width: Math.max(1, ...rows.map((r) => r.length)) * 100, height: rows.length * 100 + 100, words, images: [] };
}

/** CSV text to { cards, setCode, warnings }; throws a readable error when the text is not a card tab. */
export function parseSheetCsv(text) {
  if (looksLikeHtml(text)) throw new Error('Google sent back a web page instead of the sheet. Set the sheet to “Anyone with the link can view” and try again.');
  const page = gridToPage(parseCsv(text));
  if (!isTableSheet([page])) throw new Error('This tab does not look like a card sheet. It needs the labels Level, Cost, Power, Trait, Card No., Rarity, Color, Souls, Trigger and Effect. Check the tab name or number.');
  const out = parseTableSheet([page]);
  for (const c of out.cards) { c._img = { page: 0, main: null, alts: [] }; }
  out.warnings = out.warnings.filter((w) => !/picture|image/i.test(w));
  return out;
}
