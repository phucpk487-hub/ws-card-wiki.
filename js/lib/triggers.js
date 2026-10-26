// Trigger names. The card-list PDFs use nicknames for some icons; everything is stored under one name per icon.
const ALIASES = { door: 'Come Back', comeback: 'Come Back', 'come back': 'Come Back', salvage: 'Come Back', pants: 'Gate', bar: 'Treasure', 'gold bar': 'Treasure', pool: 'Pool', stock: 'Pool', bounce: 'Bounce', return: 'Bounce' };

export function canonicalTrigger(name) {
  const t = String(name || '').trim();
  if (!t) return '';
  return ALIASES[t.toLowerCase()] || t[0].toUpperCase() + t.slice(1).toLowerCase().replace(/ (\w)/g, (_, c) => ` ${c.toUpperCase()}`);
}

export const canonicalTriggers = (list) => [...new Set((list || []).map(canonicalTrigger).filter(Boolean))];
