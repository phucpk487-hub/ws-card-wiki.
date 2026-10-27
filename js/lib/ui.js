// Small HTML-string helpers. All dynamic text MUST pass through esc().
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const COLOR_HEX = {
  Yellow: '#e6b422', Green: '#2fa354', Red: '#d6443a', Blue: '#3a76d4',
  Purple: '#8a56c9', White: '#d9dbe3', Colorless: '#8d909c',
};
const COLOR_DARK = {
  Yellow: '#9c7600', Green: '#1c6a36', Red: '#8d231c', Blue: '#1f4a97',
  Purple: '#583388', White: '#8f93a3', Colorless: '#555865',
};

export const cardHref = (n) => `#/card/${encodeURIComponent(n)}`;
export const setHref = (c) => `#/set/${encodeURIComponent(c)}`;
export const searchHref = (params) => `#/cards?${new URLSearchParams(params).toString()}`;

const hash = (s) => [...String(s)].reduce((h, ch) => (Math.imul(h, 31) + ch.charCodeAt(0)) >>> 0, 7);

export function colorDot(color) {
  return `<span class="dot" style="--c:${COLOR_HEX[color] || '#888'}" title="${esc(color)}"></span>`;
}

export function colorBadge(color) {
  if (!color) return '<span class="muted">Unknown</span>';
  return `<span class="badge color" style="--c:${COLOR_HEX[color] || '#888'}">${colorDot(color)}${esc(color)}</span>`;
}

/**
 * Card art. Uses card.image when present; otherwise draws an original generated
 * placeholder frame (no copyrighted artwork). Aspect ratio is fixed (63:88) and never stretched.
 */
export function cardArt(card, { lazy = true } = {}) {
  const climax = card.type === 'Climax';
  const alt = `${card.name} (${card.number})`;
  if (card.image) {
    return `<div class="art ${climax ? 'climax' : ''}"><img src="${esc(card.image)}" alt="${esc(alt)}" ${lazy ? 'loading="lazy"' : ''}></div>`;
  }
  const c1 = COLOR_HEX[card.color] || '#888', c2 = COLOR_DARK[card.color] || '#444';
  const h = hash(card.number);
  const W = climax ? 88 : 63, H = climax ? 63 : 88;
  const shapes = Array.from({ length: 5 }, (_, i) => {
    const x = (h >>> (i * 3)) % W, y = (h >>> (i * 2 + 1)) % H, r = 6 + ((h >>> (i + 2)) % 16);
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff" opacity="${0.06 + (i % 3) * 0.04}"/>`;
  }).join('');
  const lv = card.level !== null && card.level !== undefined
    ? `<circle cx="9" cy="9" r="6.5" fill="#fff" opacity=".92"/><text x="9" y="12" text-anchor="middle" font-size="9" font-weight="700" fill="#222">${card.level}</text>` : '';
  const stats = card.type === 'Character'
    ? `<text x="${W - 4}" y="${H - 4}" text-anchor="end" font-size="6.5" font-weight="700" fill="#fff">${card.power}</text>` : '';
  const title = card.name.length > 20 ? `${card.name.slice(0, 19)}…` : card.name;
  const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}" xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="g${h}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs>
    <rect width="${W}" height="${H}" rx="3.5" fill="url(#g${h})"/>${shapes}
    <rect x="2" y="2" width="${W - 4}" height="${H - 4}" rx="2.5" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".7"/>
    ${lv}
    <rect x="0" y="${H - 20}" width="${W}" height="20" fill="#000" opacity=".38"/>
    <text x="${W / 2}" y="${H - 11}" text-anchor="middle" font-size="5.2" font-weight="600" fill="#fff">${esc(title)}</text>
    <text x="4" y="${H - 4}" font-size="4.4" fill="#fff" opacity=".85">${esc(card.type.toUpperCase())}</text>${stats}
  </svg>`;
  return `<div class="art ${climax ? 'climax' : ''}">${svg}</div>`;
}

export function cardTile(card) {
  const lvl = card.level !== null && card.level !== undefined ? `Lv ${card.level}` : card.type;
  return `<a class="tile" href="${cardHref(card.number)}" aria-label="${esc(card.name)}, ${esc(card.number)}">
    ${cardArt(card)}
    <div class="tile-body">
      <div class="tile-name">${esc(card.name)}</div>
      <div class="tile-meta">${colorDot(card.color)}<span>${esc(card.number)}</span><span class="rar">${esc(card.rarity)}</span></div>
      <div class="tile-meta muted">${esc(lvl)}${card.type === 'Character' ? ` · ${card.power} pw` : ''}</div>
    </div></a>`;
}

export function cardRow(card) {
  return `<tr>
    <td><a href="${cardHref(card.number)}">${esc(card.number)}</a></td>
    <td><a href="${cardHref(card.number)}"><strong>${esc(card.name)}</strong></a></td>
    <td>${colorBadge(card.color)}</td><td>${esc(card.type)}</td>
    <td class="num">${card.level ?? '–'}</td><td class="num">${card.cost ?? '–'}</td><td class="num">${card.power ?? '–'}</td>
    <td class="num">${card.soul ?? '–'}</td><td>${esc(card.rarity)}</td></tr>`;
}

export function skeletonGrid(n = 12) {
  return `<div class="grid" aria-busy="true" aria-label="Loading">${Array.from({ length: n }, () =>
    `<div class="tile skeleton"><div class="art sk"></div><div class="tile-body"><div class="sk line"></div><div class="sk line short"></div></div></div>`).join('')}</div>`;
}

export function skeletonPage() {
  return `<div class="container" aria-busy="true" aria-label="Loading"><div class="sk line title"></div><div class="sk line"></div><div class="sk line short"></div>${skeletonGrid(8)}</div>`;
}

export function emptyState(title, message, actionHtml = '') {
  return `<div class="state empty" role="status"><div class="state-icon" aria-hidden="true">🗂</div><h3>${esc(title)}</h3><p>${esc(message)}</p>${actionHtml}</div>`;
}

export function errorState(message, retry = true) {
  return `<div class="state error" role="alert"><div class="state-icon" aria-hidden="true">⚠</div><h3>Something went wrong</h3><p>${esc(message)}</p>${retry ? '<button class="btn" data-retry>Try again</button>' : ''}</div>`;
}

/** Highlight [AUTO]/[ACT]/[CONT], keywords and bracketed costs in effect text (input is escaped first). */
export function formatEffect(text) {
  return esc(text)
    .replace(/\[(AUTO|ACT|CONT)\]/g, (_, t) => `<span class="ab ab-${t.toLowerCase()}">${t}</span>`)
    .replace(/\b(BACKUP|ASSIST|ENCORE|BRAINSTORM)\b/g, '<span class="kw">$1</span>')
    .replace(/\{([^}]+)\}/g, '<span class="kw combo">$1</span>')
    .replace(/\[([^\]]+)\]/g, '<span class="cost">[$1]</span>');
}

export const TRIGGER_GLYPH = {
  Soul: '★', Pool: '◈', Draw: '✎', 'Come Back': '↩', Shot: '➹', Bounce: '⤒', Gate: '⛩', Standby: '⚑', Treasure: '❖', Choice: '⇄',
};
export function triggerBadge(t) {
  return `<span class="badge trig" title="${esc(t)} trigger"><span aria-hidden="true">${TRIGGER_GLYPH[t] || '•'}</span>${esc(t)}</span>`;
}

export function formatDate(iso) {
  if (!iso) return 'Date unknown';
  try { return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return iso; }
}

export function chip(label, attrs = '', active = false, extra = '') {
  return `<button type="button" class="chip${active ? ' on' : ''}" aria-pressed="${active}" ${attrs}>${extra}${esc(label)}</button>`;
}
