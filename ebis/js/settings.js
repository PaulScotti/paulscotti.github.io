// Reading settings belong to the device: a phone and a laptop want different type.

const touch = matchMedia('(pointer: coarse)').matches;
const dark = matchMedia('(prefers-color-scheme: dark)');
const defaults = { size: touch ? 18 : 20, leading: 1.55, margin: 1, justify: true, indent: true, notes: true, theme: 'auto', folio: 'pages' };
const listeners = new Set();

export const settings = { ...defaults, ...JSON.parse(localStorage.getItem('ebis.settings') || '{}') };

export function update(changes) {
  Object.assign(settings, changes);
  localStorage.setItem('ebis.settings', JSON.stringify(settings));
  applyTheme();
  listeners.forEach(fn => fn(changes));
}
export const onUpdate = fn => listeners.add(fn);

export function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = settings.theme === 'auto' ? (dark.matches ? 'night' : 'paper') : settings.theme;
  document.querySelector('meta[name="theme-color"]').content = getComputedStyle(root).getPropertyValue('--bg').trim();
}
dark.addEventListener('change', applyTheme);
applyTheme();
