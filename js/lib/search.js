// Pure search/filter logic. No DOM or browser APIs, so it can be reused unchanged
// in a Capacitor/React Native port or on a server.

export const PAGE_SIZE = 24;
export const RARITY_ORDER = ['C', 'U', 'R', 'RR', 'SR', 'BDR', 'SP', 'SSP', 'CC', 'CR', 'PR'];
export const SORTS = {
  number: 'Card number',
  name: 'Name (A–Z)',
  level: 'Level (high first)',
  cost: 'Cost (high first)',
  power: 'Power (high first)',
  rarity: 'Rarity (rare first)',
};

const FIELD_ALIASES = {
  name: 'name', n: 'name',
  effect: 'effect', e: 'effect', text: 'effect',
  trait: 'trait', t: 'trait',
  series: 'series',
  set: 'set',
  number: 'number', no: 'number',
  flavor: 'flavor',
  illustrator: 'illustrator', artist: 'illustrator',
  type: 'type',
  color: 'color', colour: 'color',
  rarity: 'rarity',
  level: 'level', lv: 'level',
  cost: 'cost',
  power: 'power', pow: 'power',
  soul: 'soul',
  trigger: 'trigger', trig: 'trigger', icon: 'trigger',
  has: 'has',
};

export const NUMERIC_FIELDS = ['level', 'cost', 'power', 'soul'];
const OPS = ['>=', '<=', ':', '=', '>', '<'];

/**
 * Parse a query like:  luna trait:magic "top card" -climax effect:backup level>=2 cost:1-2 soul:2 color:red,blue
 * Returns clauses: { field: string|null, op: ':'|'='|'>'|'<'|'>='|'<=', value: string, negate: boolean }
 */
export function parseQuery(input) {
  const clauses = [];
  const re = /(-)?(?:([a-z]+)(>=|<=|:|=|>|<))?(?:"([^"]*)"|(\S+))/gi;
  let m;
  while ((m = re.exec(String(input || '')))) {
    const negate = !!m[1];
    let field = m[2] ? m[2].toLowerCase() : null;
    const op = m[3] || ':';
    const value = (m[4] !== undefined ? m[4] : m[5]).trim().toLowerCase();
    if (!value) continue;
    if (field && !FIELD_ALIASES[field]) {
      // Unknown "field:" prefix, treat the whole token as plain text
      clauses.push({ field: null, op: ':', value: `${field}${op}${value}`, negate });
      continue;
    }
    clauses.push({ field: field ? FIELD_ALIASES[field] : null, op, value, negate });
  }
  return clauses;
}

const fieldText = (card, field) => {
  switch (field) {
    case 'name': return `${card.name} ${card.nameJp || ''}`;
    case 'effect': return (card.effect || []).join(' ');
    case 'trait': return (card.traits || []).join(' ');
    case 'series': return card.series || '';
    case 'set': return card.set || '';
    case 'number': return card.number || '';
    case 'flavor': return card.flavor || '';
    case 'illustrator': return card.illustrator || '';
    case 'type': return card.type || '';
    case 'color': return card.color || '';
    case 'rarity': return card.rarity || '';
    case 'trigger': return (card.triggers || []).join(' ');
    default:
      return [card.name, card.nameJp, card.number, card.series, card.set, card.type, card.color, card.rarity,
        (card.traits || []).join(' '), (card.effect || []).join(' '), card.flavor, card.illustrator,
        (card.triggers || []).join(' ')].join(' ');
  }
};

const COLOR_WORDS = ['yellow', 'green', 'red', 'blue', 'purple', 'white', 'colorless'];
const TYPE_WORDS = ['character', 'event', 'climax'];

/** "5000", "5k", "5.5k" -> number, or null. */
function toNumber(t) {
  const m = /^(\d+(?:\.\d+)?)(k?)$/.exec(String(t).trim());
  return m ? Number(m[1]) * (m[2] ? 1000 : 1) : null;
}

/** Numeric test: "2", "1-2", "0,1", "2k-5k" for ':' / '='; a single number for > < >= <=. Missing values never match. */
function matchesNumber(v, clause) {
  if (typeof v !== 'number') return false;
  const { op, value } = clause;
  if (op === '>' || op === '<' || op === '>=' || op === '<=') {
    const n = toNumber(value); if (n === null) return false;
    return op === '>' ? v > n : op === '<' ? v < n : op === '>=' ? v >= n : v <= n;
  }
  return value.split(',').some((part) => {
    const r = /^([\d.]+k?)-([\d.]+k?)$/.exec(part.trim());
    if (r) { const lo = toNumber(r[1]), hi = toNumber(r[2]); return lo !== null && hi !== null && v >= Math.min(lo, hi) && v <= Math.max(lo, hi); }
    const n = toNumber(part); return n !== null && v === n;
  });
}

const HAS = {
  image: (c) => !!c.image, trigger: (c) => (c.triggers || []).length > 0, triggers: (c) => (c.triggers || []).length > 0,
  soul: (c) => typeof c.soul === 'number', power: (c) => typeof c.power === 'number', effect: (c) => (c.effect || []).length > 0,
  jp: (c) => !!c.nameJp, flavor: (c) => !!c.flavor, trait: (c) => (c.traits || []).length > 0, traits: (c) => (c.traits || []).length > 0,
};

function matchesClause(card, clause) {
  const { field, value } = clause;
  if (NUMERIC_FIELDS.includes(field)) return matchesNumber(card[field], clause);
  const any = (fn) => value.split(',').map((x) => x.trim()).filter(Boolean).some(fn);
  if (field === 'has') return any((k) => (HAS[k] ? HAS[k](card) : false));
  // Short enumerated fields: exact or abbreviated ("y", "char", "cx"); comma = any of
  if (field === 'rarity') return any((v) => (card.rarity || '').toLowerCase() === v);
  if (field === 'color') return any((v) => (card.color || '').toLowerCase() === v || (v.length >= 1 && COLOR_WORDS.some((w) => w.startsWith(v) && w === (card.color || '').toLowerCase())));
  if (field === 'type') return any((v) => {
    const t = (card.type || '').toLowerCase();
    return t === v || (v === 'cx' && t === 'climax') || (v === 'char' && t === 'character') || (v.length >= 2 && TYPE_WORDS.some((w) => w.startsWith(v) && w === t));
  });
  if (field === 'trigger') return any((v) => (card.triggers || []).some((t) => t.toLowerCase().replace(/\s+/g, '').startsWith(v.replace(/\s+/g, ''))));
  return fieldText(card, field).toLowerCase().includes(value);
}

/** Plain-English description of a clause, for the "Interpreted as" line. */
export function describeClause(c) {
  const f = c.field;
  const opText = { ':': 'is', '=': 'is', '>': 'is above', '<': 'is below', '>=': 'is at least', '<=': 'is at most' }[c.op] || 'is';
  let text;
  if (!f) text = `any field contains “${c.value}”`;
  else if (NUMERIC_FIELDS.includes(f)) text = `${f} ${opText} ${c.value.replace('-', ' to ')}`;
  else if (f === 'has') text = `has ${c.value}`;
  else if (['color', 'type', 'rarity', 'trigger'].includes(f)) text = `${f} is ${c.value.split(',').join(' or ')}`;
  else text = `${f} contains “${c.value}”`;
  return `${c.negate ? 'NOT ' : ''}${text}`;
}

const asList = (v) => (Array.isArray(v) ? v : v ? String(v).split(',').filter(Boolean) : []);

/** Does the card pass the structured filters? Empty filter = no restriction. */
export function matchesFilters(card, f) {
  const colors = asList(f.colors), types = asList(f.types), levels = asList(f.levels).map(Number),
    rarities = asList(f.rarities), sets = asList(f.sets), triggers = asList(f.triggers),
    series = asList(f.series), traits = asList(f.traits), souls = asList(f.souls).map(Number);
  if (colors.length && !colors.includes(card.color)) return false;
  if (types.length && !types.includes(card.type)) return false;
  if (levels.length && !levels.includes(card.level)) return false;
  if (rarities.length && !rarities.includes(card.rarity)) return false;
  if (sets.length && !sets.includes(card.set)) return false;
  if (series.length && !series.includes(card.series)) return false;
  if (triggers.length && !triggers.every((t) => (card.triggers || []).includes(t))) return false;
  if (traits.length && !traits.every((t) => (card.traits || []).includes(t))) return false;
  if (souls.length && !souls.includes(card.soul)) return false;
  for (const [field, lo, hi] of [['cost', f.costMin, f.costMax], ['power', f.powerMin, f.powerMax]]) {
    const a = lo === '' || lo == null ? null : Number(lo), b = hi === '' || hi == null ? null : Number(hi);
    if ((a !== null && !Number.isNaN(a)) || (b !== null && !Number.isNaN(b))) {
      if (typeof card[field] !== 'number') return false;
      if (a !== null && !Number.isNaN(a) && card[field] < a) return false;
      if (b !== null && !Number.isNaN(b) && card[field] > b) return false;
    }
  }
  return true;
}

const num = (v, fallback = -1) => (typeof v === 'number' ? v : fallback);

export function compareCards(sort) {
  switch (sort) {
    case 'name': return (a, b) => a.name.localeCompare(b.name);
    case 'level': return (a, b) => num(b.level) - num(a.level) || a.number.localeCompare(b.number);
    case 'cost': return (a, b) => num(b.cost) - num(a.cost) || a.number.localeCompare(b.number);
    case 'power': return (a, b) => num(b.power) - num(a.power) || a.number.localeCompare(b.number);
    case 'rarity': return (a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity) || a.number.localeCompare(b.number);
    default: return (a, b) => a.number.localeCompare(b.number, undefined, { numeric: true });
  }
}

/**
 * Search and filter cards.
 * params: { q, colors, types, levels, rarities, sets, series, triggers, traits, sort, page, pageSize }
 */
export function searchCards(cards, params = {}) {
  const clauses = parseQuery(params.q);
  const sort = SORTS[params.sort] ? params.sort : 'number';
  const pageSize = params.pageSize || PAGE_SIZE;
  const filtered = cards.filter((card) => {
    if (!matchesFilters(card, params)) return false;
    return clauses.every((c) => matchesClause(card, c) !== c.negate);
  });
  filtered.sort(compareCards(sort));
  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, parseInt(params.page, 10) || 1), pages);
  return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total, page, pages, pageSize };
}

function range(cards, key) {
  const v = cards.map((c) => c[key]).filter((x) => typeof x === 'number');
  return v.length ? { min: Math.min(...v), max: Math.max(...v) } : null;
}

/** Distinct values with counts, for building filter controls. */
export function buildFacets(cards) {
  const count = (get) => {
    const m = new Map();
    for (const c of cards) for (const v of [].concat(get(c))) if (v !== null && v !== undefined && v !== '') m.set(v, (m.get(v) || 0) + 1);
    return m;
  };
  const sortKeys = (m, cmp) => [...m.entries()].sort(cmp ? (a, b) => cmp(a[0], b[0]) : (a, b) => String(a[0]).localeCompare(String(b[0])))
    .map(([value, n]) => ({ value, count: n }));
  return {
    colors: sortKeys(count((c) => c.color)),
    types: sortKeys(count((c) => c.type), (a, b) => ['Character', 'Event', 'Climax'].indexOf(a) - ['Character', 'Event', 'Climax'].indexOf(b)),
    levels: sortKeys(count((c) => c.level), (a, b) => a - b),
    rarities: sortKeys(count((c) => c.rarity), (a, b) => RARITY_ORDER.indexOf(a) - RARITY_ORDER.indexOf(b)),
    sets: sortKeys(count((c) => c.set)),
    series: sortKeys(count((c) => c.series)),
    triggers: sortKeys(count((c) => c.triggers)),
    traits: sortKeys(count((c) => c.traits)),
    souls: sortKeys(count((c) => (typeof c.soul === 'number' ? c.soul : null)), (a, b) => a - b),
    ranges: {
      cost: range(cards, 'cost'), power: range(cards, 'power'),
    },
  };
}

/** Cards sharing traits or series with `card`, most similar first. */
export function relatedCards(cards, card, limit = 6) {
  return cards
    .filter((c) => c.number !== card.number)
    .map((c) => ({ c, score: (c.series === card.series ? 1 : 0) + c.traits.filter((t) => card.traits.includes(t)).length * 2 + (c.color === card.color ? 0.5 : 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.c.number.localeCompare(b.c.number))
    .slice(0, limit)
    .map((x) => x.c);
}

/** Text search over generic entries ({title/term, summary/definition...}) */
export function filterText(items, q, getText) {
  const terms = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return items;
  return items.filter((it) => { const t = getText(it).toLowerCase(); return terms.every((x) => t.includes(x)); });
}

/** Serialise filter state into URLSearchParams-friendly object (omits defaults). */
export function paramsToQuery(p) {
  const out = {};
  if (p.q) out.q = p.q;
  for (const k of ['colors', 'types', 'levels', 'souls', 'rarities', 'sets', 'series', 'triggers', 'traits']) {
    const l = asList(p[k]);
    if (l.length) out[k] = l.join(',');
  }
  for (const k of ['costMin', 'costMax', 'powerMin', 'powerMax']) if (p[k] !== '' && p[k] != null) out[k] = String(p[k]);
  if (p.sort && p.sort !== 'number') out.sort = p.sort;
  if (p.page && Number(p.page) > 1) out.page = String(p.page);
  if (p.view && p.view !== 'grid') out.view = p.view;
  return out;
}

export function queryToParams(sp) {
  const get = (k) => sp.get(k) || '';
  return {
    q: get('q'),
    colors: asList(get('colors')), types: asList(get('types')), levels: asList(get('levels')), souls: asList(get('souls')),
    costMin: get('costMin'), costMax: get('costMax'), powerMin: get('powerMin'), powerMax: get('powerMax'),
    rarities: asList(get('rarities')), sets: asList(get('sets')), series: asList(get('series')),
    triggers: asList(get('triggers')), traits: asList(get('traits')),
    sort: get('sort') || 'number', page: parseInt(get('page'), 10) || 1, view: get('view') === 'list' ? 'list' : 'grid',
  };
}
