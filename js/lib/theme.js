// Light/dark theme. Stored preference is optional: storage can throw (private mode).
const KEY = 'wsw-theme';

function stored() { try { return localStorage.getItem(KEY); } catch { return null; } }
function save(v) { try { localStorage.setItem(KEY, v); } catch { /* ignore */ } }

export function currentTheme() {
  const s = stored();
  if (s === 'light' || s === 'dark') return s;
  return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#14161c' : '#f6f7fa');
}

export function initTheme(button) {
  applyTheme(currentTheme());
  const sync = () => {
    const t = document.documentElement.dataset.theme;
    button.setAttribute('aria-label', t === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
    button.setAttribute('aria-pressed', String(t === 'dark'));
    button.textContent = t === 'dark' ? '☀' : '☾';
  };
  sync();
  button.addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    applyTheme(next); save(next); sync();
  });
}
