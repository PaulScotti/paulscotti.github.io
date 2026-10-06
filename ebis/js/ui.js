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
  unpeek();
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
  unpeek();
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

// A peek floats a note beside the link that named it, with no actions and no history entry;
// it stays while the pointer or focus rests on the link or the note itself.
export function peek(content, anchor) {
  pop.replaceChildren(content);
  pop.classList.add('peek');
  pop.hidden = false;
  const r = anchor.getBoundingClientRect();
  const half = pop.offsetWidth / 2 + 12;
  pop.style.left = `${Math.min(Math.max(r.left + r.width / 2, half), innerWidth - half)}px`;
  if (r.top > innerHeight * 0.5) {
    pop.style.top = 'auto';
    pop.style.bottom = `${innerHeight - r.top + 10}px`;
  } else {
    pop.style.top = `${r.bottom + 10}px`;
    pop.style.bottom = 'auto';
  }
}
export function unpeek() {
  if (!pop.classList.contains('peek')) return;
  pop.classList.remove('peek');
  pop.hidden = true;
  pop.style.left = pop.style.top = pop.style.bottom = '';
}

// A picture full screen. A touch opens it and its click follows, landing on the picture now
// shown; only a tap that begins on the picture closes it.
let touched = false;
export function lightbox(img) {
  Object.assign(picture.firstElementChild, { src: img.src, className: img.className }); // shown as on the page
  touched = false;
  show(picture);
}
picture.onpointerdown = () => { touched = true; };
picture.onclick = () => touched && closeLayers();

addEventListener('popstate', () => closeLayers(true));
backdrop.onclick = $('sheet-close').onclick = () => closeLayers();

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
