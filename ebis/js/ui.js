// Sheets, popovers, the picture viewer and toasts, shared by the library and the reader.
// Each is a layer: the back gesture closes it before it leaves the page.

export const $ = id => document.getElementById(id);
export const template = id => $(id).content.cloneNode(true);
export const escape = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const sheet = $('sheet'), backdrop = $('backdrop'), pop = $('pop'), picture = $('lightbox'), toastEl = $('toast');
const layers = [sheet, backdrop, pop, picture];
let toastTimer = 0;

export const layerOpen = () => layers.some(l => !l.hidden);

function show(...shown) {
  if (!layerOpen()) history.pushState({ layer: true }, '');
  for (const l of layers) l.hidden = !shown.includes(l);
}

export function closeLayers(silent) {
  if (!layerOpen()) return;
  for (const l of layers) l.hidden = true;
  if (!silent && history.state?.layer) history.back();
}

export function openSheet(title, body) {
  $('sheet-title').textContent = title;
  $('sheet-body').replaceChildren(body);
  show(sheet, backdrop);
  $('sheet-body').scrollTop = 0;
}

export function popover(content, actions) {
  const row = document.createElement('div');
  row.className = 'actions';
  for (const [label, fn] of actions) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => { closeLayers(); fn(); };
    row.append(b);
  }
  pop.replaceChildren(content, row);
  show(pop);
}

export function lightbox(src) {
  picture.firstElementChild.src = src;
  show(picture);
}

addEventListener('popstate', () => closeLayers(true));
backdrop.onclick = picture.onclick = $('sheet-close').onclick = () => closeLayers();

export function toast(message, action) {
  toastEl.replaceChildren(message);
  if (action) {
    const b = document.createElement('button');
    b.textContent = action[0];
    b.onclick = () => { toastEl.classList.remove('on'); action[1](); };
    toastEl.append(b);
  }
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), action ? 6000 : 3200);
}
