// Accent colour choice (separate from light/dark). Stored per device; storage can throw, so every access is guarded.
const KEY = 'wsw-accent';
export const ACCENTS = [
  { id: 'ruby', name: 'Ruby', swatch: '#a8321f' },
  { id: 'ocean', name: 'Ocean', swatch: '#1f5fa8' },
  { id: 'forest', name: 'Forest', swatch: '#2e6b3a' },
  { id: 'violet', name: 'Violet', swatch: '#6a3fa0' },
  { id: 'amber', name: 'Amber', swatch: '#8f5200' },
  { id: 'rose', name: 'Rose', swatch: '#b02a5c' },
];
export const isAccent = (id) => ACCENTS.some((a) => a.id === id);
export function currentAccent() { try { const s = localStorage.getItem(KEY); return isAccent(s) ? s : 'ruby'; } catch { return 'ruby'; } }
export function applyAccent(id) { document.documentElement.dataset.accent = isAccent(id) ? id : 'ruby'; }

export function initAccent(button) {
  applyAccent(currentAccent());
  const pop = document.createElement('div');
  pop.id = 'accent-pop'; pop.className = 'accent-pop'; pop.hidden = true; pop.setAttribute('role', 'group'); pop.setAttribute('aria-label', 'Accent colour');
  button.after(pop);
  const draw = () => {
    const cur = document.documentElement.dataset.accent;
    pop.innerHTML = ACCENTS.map((a) => `<button type="button" class="swatch" data-accent="${a.id}" style="--sw:${a.swatch}" aria-pressed="${a.id === cur}" aria-label="${a.name}" title="${a.name}"></button>`).join('');
  };
  const close = () => { pop.hidden = true; button.setAttribute('aria-expanded', 'false'); };
  button.setAttribute('aria-expanded', 'false'); button.setAttribute('aria-controls', 'accent-pop');
  button.addEventListener('click', () => { if (pop.hidden) { draw(); pop.hidden = false; button.setAttribute('aria-expanded', 'true'); } else close(); });
  pop.addEventListener('click', (e) => {
    const b = e.target.closest('[data-accent]'); if (!b) return;
    applyAccent(b.dataset.accent); try { localStorage.setItem(KEY, b.dataset.accent); } catch { /* ignore */ }
    draw();
  });
  document.addEventListener('click', (e) => { if (!pop.hidden && !pop.contains(e.target) && !button.contains(e.target)) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { close(); button.focus(); } });
}
