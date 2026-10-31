// Fill missing trait lists from the same card printed elsewhere (another saved set, or this PDF).
const key = (c) => `${String(c.name || '').trim().toLowerCase()}|${c.level}|${c.cost}`;

/** items: [{ card }]; known: cards from saved sets. Returns warnings to show. Only touches Characters that have no traits. */
export function fillTraits(items, known = []) {
  const byKey = new Map();
  for (const c of [...known, ...items.map((i) => i.card)]) {
    if (c && c.type === 'Character' && c.traits && c.traits.length && !byKey.has(key(c))) byKey.set(key(c), { traits: c.traits, number: c.number });
  }
  const out = [];
  for (const { card } of items) {
    if (card.type !== 'Character' || (card.traits && card.traits.length)) continue;
    const hit = byKey.get(key(card));
    if (!hit) continue;
    card.traits = [...hit.traits];
    out.push(`${card.number}: the PDF lists no traits; copied them from ${hit.number} (same name, level and cost). Please check.`);
  }
  return out;
}
