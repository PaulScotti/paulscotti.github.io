// Sheets, popovers and toasts, shared by the library and the reader.
// On a phone, the back gesture closes whatever is open before it leaves the page.

export const $ = id => document.getElementById(id);
export const template = id => $(id).content.cloneNode(true);
export const escape = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const sheet = $('sheet'), backdrop = $('backdrop'), pop = $('pop'), toastEl = $('toast');
let onSheetClose = null, toastTimer = 0;

export function openSheet(title, body, onClose) {
  if (sheet.hidden && pop.hidden) history.pushState({ layer: true }, '');
  closeLayers(true);
  $('sheet-title').textContent = title;
  $('sheet-body').replaceChildren(body);
  $('sheet-body').scrollTop = 0;
  sheet.hidden = backdrop.hidden = false;
  onSheetClose = onClose;
  return sheet;
}

export function popover(content, actions = []) {
  if (sheet.hidden && pop.hidden) history.pushState({ layer: true }, '');
  closeLayers(true);
  pop.replaceChildren(content);
  if (actions.length) {
    const row = document.createElement('div');
    row.className = 'actions';
    for (const [label, fn] of actions) {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = () => { closeLayers(); fn(); };
      row.append(b);
    }
    pop.append(row);
  }
  pop.hidden = false;
}

export const layerOpen = () => !sheet.hidden || !pop.hidden;

export function closeLayers(silent) {
  if (!layerOpen()) return;
  sheet.hidden = backdrop.hidden = pop.hidden = true;
  const fn = onSheetClose;
  onSheetClose = null;
  fn?.();
  if (!silent && history.state?.layer) history.back();
}

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
