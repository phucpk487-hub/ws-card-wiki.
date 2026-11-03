// Turns a grid of cells (an Excel tab) into the page model the per-card table reader understands, and reads the cards from it.
// The cells become the same "page model" the PDF table reader uses, so the rules for type, soul, triggers and effects are shared.
import { isTableSheet, parseTableSheet } from './tableSheet.js';

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

/** A page model (cells, maybe with pictures) to { cards, setCode, warnings }; throws a readable error when it is not a card tab. */
export function parseCardPage(page) {
  if (!isTableSheet([page])) throw new Error('This tab does not look like a card sheet. It needs the labels Level, Cost, Power, Trait, Card No., Rarity, Color, Souls, Trigger and Effect. Check that you chose the right tab.');
  return parseTableSheet([page]);
}
