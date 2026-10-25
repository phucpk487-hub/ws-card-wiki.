// Pure deck logic (no DOM, no storage). Works in Node and in the app.
// A deck is { id, name, notes, cards: { [cardNumber]: copies }, created, updated }.

export const DECK_SIZE = 50;
export const MAX_COPIES = 4;
export const MAX_CLIMAX = 8;

export const emptyDeck = (name = 'New deck') => ({ id: '', name, notes: '', cards: {}, created: 0, updated: 0 });

export const countOf = (deck, number) => deck.cards[number] || 0;
export const totalCards = (deck) => Object.values(deck.cards).reduce((a, b) => a + b, 0);
export const climaxCount = (deck, byNumber) =>
  Object.entries(deck.cards).reduce((n, [num, c]) => n + (byNumber.get(num)?.type === 'Climax' ? c : 0), 0);

/** Can one more copy of `card` be added? Returns { ok, reason }. */
export function canAdd(deck, card, byNumber) {
  const limit = card.maxCopies || MAX_COPIES;
  if (totalCards(deck) >= DECK_SIZE) return { ok: false, reason: `Deck is full (${DECK_SIZE} cards)` };
  if (countOf(deck, card.number) >= limit) return { ok: false, reason: `Maximum ${limit} copies of one card` };
  if (card.type === 'Climax' && climaxCount(deck, byNumber) >= MAX_CLIMAX) return { ok: false, reason: `Maximum ${MAX_CLIMAX} Climax cards` };
  return { ok: true, reason: '' };
}

/** Returns a new deck (the input is never mutated). */
export function withCard(deck, number, delta) {
  const cards = { ...deck.cards };
  const next = (cards[number] || 0) + delta;
  if (next <= 0) delete cards[number]; else cards[number] = next;
  return { ...deck, cards };
}

const LEVEL_LABELS = { 0: 'Level 0', 1: 'Level 1', 2: 'Level 2', 3: 'Level 3' };

/** Group deck entries for display: Level 0-3 characters, Events, Climax, Unknown. */
export function groupDeck(deck, byNumber) {
  const groups = [
    ...[0, 1, 2, 3].map((l) => ({ key: `c${l}`, label: LEVEL_LABELS[l], entries: [] })),
    { key: 'event', label: 'Events', entries: [] }, { key: 'climax', label: 'Climax', entries: [] }, { key: 'unknown', label: 'Not in database', entries: [] },
  ];
  const by = Object.fromEntries(groups.map((g) => [g.key, g]));
  for (const [number, count] of Object.entries(deck.cards)) {
    const card = byNumber.get(number);
    const key = !card ? 'unknown' : card.type === 'Climax' ? 'climax' : card.type === 'Event' ? 'event' : `c${Math.min(3, Math.max(0, card.level ?? 0))}`;
    (by[key] || by.unknown).entries.push({ number, count, card });
  }
  for (const g of groups) g.entries.sort((a, b) => (a.card?.cost ?? 0) - (b.card?.cost ?? 0) || a.number.localeCompare(b.number, undefined, { numeric: true }));
  return groups.filter((g) => g.entries.length).map((g) => ({ ...g, total: g.entries.reduce((n, e) => n + e.count, 0) }));
}

/** Validation and statistics. */
export function analyze(deck, byNumber) {
  const total = totalCards(deck);
  const stats = { characters: 0, events: 0, climax: 0, unknown: 0, byLevel: { 0: 0, 1: 0, 2: 0, 3: 0 }, byColor: {}, triggers: {}, cost: 0, costN: 0 };
  const issues = [];
  for (const [number, count] of Object.entries(deck.cards)) {
    const card = byNumber.get(number);
    if (!card) { stats.unknown += count; issues.push({ level: 'warn', text: `${number} is not in the database` }); continue; }
    const limit = card.maxCopies || MAX_COPIES;
    if (count > limit) issues.push({ level: 'error', text: `${card.name}: ${count} copies (max ${limit})` });
    if (card.type === 'Climax') stats.climax += count; else if (card.type === 'Event') stats.events += count; else stats.characters += count;
    if (card.type !== 'Climax') {
      const lv = Math.min(3, Math.max(0, card.level ?? 0));
      stats.byLevel[lv] += count;
      if (typeof card.cost === 'number') { stats.cost += card.cost * count; stats.costN += count; }
    }
    if (card.color) stats.byColor[card.color] = (stats.byColor[card.color] || 0) + count;
    for (const t of card.triggers || []) stats.triggers[t] = (stats.triggers[t] || 0) + count;
  }
  if (total < DECK_SIZE) issues.push({ level: 'error', text: `Needs ${DECK_SIZE - total} more card${DECK_SIZE - total === 1 ? '' : 's'} (${total}/${DECK_SIZE})` });
  if (total > DECK_SIZE) issues.push({ level: 'error', text: `${total - DECK_SIZE} card${total - DECK_SIZE === 1 ? '' : 's'} over the ${DECK_SIZE}-card limit` });
  if (stats.climax > MAX_CLIMAX) issues.push({ level: 'error', text: `${stats.climax} Climax cards (max ${MAX_CLIMAX})` });
  const known = total - stats.unknown;
  stats.avgCost = stats.costN ? stats.cost / stats.costN : 0;
  stats.climaxPct = known ? (stats.climax / known) * 100 : 0;
  return { total, stats, issues, valid: !issues.some((i) => i.level === 'error') };
}

/** "4 BD/WE49-01" / "BD/WE49-01 x4" / "BD/WE49-01" per line; anything after # or // is a comment. */
export function parseDeckText(text, byNumber) {
  const cards = {}, unknown = [], bad = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.replace(/(#|\/\/).*$/, '').trim();
    if (!line) continue;
    let m = /^(\d+)\s*[x×]?\s+(\S+)/i.exec(line), number, count;
    if (m) { count = +m[1]; number = m[2]; }
    else if ((m = /^(\S+)\s*[x×]\s*(\d+)$/i.exec(line))) { number = m[1]; count = +m[2]; }
    else if ((m = /^(\S+)$/.exec(line))) { number = m[1]; count = 1; }
    else { bad.push(line); continue; }
    const key = [...byNumber.keys()].find((k) => k.toLowerCase() === number.toLowerCase()) || number;
    if (!byNumber.has(key)) unknown.push(number);
    cards[key] = (cards[key] || 0) + count;
  }
  return { cards, unknown, bad };
}

export function exportDeckText(deck, byNumber) {
  const groups = groupDeck(deck, byNumber);
  const lines = [`# ${deck.name}`, `# ${totalCards(deck)} cards`];
  for (const g of groups) {
    lines.push('', `# ${g.label} (${g.total})`);
    for (const e of g.entries) lines.push(`${e.count} ${e.number}${e.card ? `  # ${e.card.name}` : ''}`);
  }
  return lines.join('\n') + '\n';
}
