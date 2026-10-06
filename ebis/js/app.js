// ebis: the library, adding to it, and moving between the library and open books.

import * as store from './store.js';
import * as reader from './reader.js';
import { importFile, importPage, importURL } from './sources.js';
import { $, template, escape, openSheet, closeLayers, toast } from './ui.js';

const shelf = $('shelf');
const pending = new Map(); // imports in progress: key → { title, progress }
const PAINTS = [['#2f4a6d', '#efe6d2'], ['#2f5a4c', '#efe6d2'], ['#8e3b28', '#f6ead8'], ['#b9853a', '#fbf6ea'],
  ['#e6dcc3', '#3a2e1f'], ['#4a4e55', '#ece6da'], ['#23211e', '#e8e0cf'], ['#d8c8a8', '#2f281f']];
let filter = 'all', query = '', queue = Promise.resolve();

async function route() {
  $('lock').hidden = store.unlocked();
  if (!store.unlocked()) { // ebis opens once its password has been typed on this device
    $('library').hidden = true;
    return reader.hide();
  }
  if (location.hash === '#/shared') { // something shared from another app on Android
    history.replaceState(null, '', location.pathname);
    receiveShared();
  }
  if (location.hash === '#/clip') { // the "Save to Ebis" bookmarklet has a page for the library
    history.replaceState(null, '', location.pathname);
    receiveClip();
  }
  const id = location.hash.match(/^#\/read\/(.+)$/)?.[1];
  if (id) {
    $('library').hidden = true;
    try {
      await reader.open(id);
    } catch (e) {
      toast(e.message);
      location.replace('#/');
    }
  } else {
    reader.hide();
    $('library').hidden = false;
    draw();
  }
}

// The shelf.

function draw() {
  const books = store.all('book')
    .filter(b => filter === 'all' || b.kind === filter)
    .filter(b => !query || `${b.title} ${b.author} ${b.site}`.toLowerCase().includes(query))
    .sort((a, b) => lastRead(b) - lastRead(a));
  shelf.replaceChildren(...[...pending].map(([key, p]) => item({ id: key, title: p.title, busy: p.progress }, true)), ...books.map(b => item(b)));
  $('empty').hidden = !!(books.length || pending.size || query || filter !== 'all');
}
const lastRead = b => store.get('pos', b.id)?.at || b.added;

function item(b, busy) {
  const li = document.createElement('li');
  li.className = busy ? 'item busy' : 'item';
  li.dataset.id = b.id;
  const pct = busy ? b.busy : store.get('pos', b.id)?.pct || 0;
  const [paint, ink] = PAINTS[[...b.title].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % PAINTS.length];
  li.innerHTML = `<div class="cover" style="--paint:${paint};--paint-ink:${ink}">${b.cover ? `<img src="${b.cover}" alt="">`
    : `<div class="typeset">${b.site ? `<span class="site">${escape(b.site)}</span>` : ''}<span class="name">${escape(b.title)}</span><span class="author">${escape(b.author || '')}</span><svg aria-hidden="true"><use href="#ibis"/></svg></div>`}
    ${pct ? `<div class="progress"><i style="width:${(pct * 100).toFixed(1)}%"></i></div>` : ''}</div>
    <div class="meta"><span class="title">${escape(b.title)}</span><span class="by">${escape(busy ? 'Adding…' : b.author || b.site)}</span></div>`;
  if (!busy) {
    li.onclick = () => { location.hash = `#/read/${b.id}`; };
    li.oncontextmenu = e => { e.preventDefault(); manage(b); };
  }
  return li;
}

$('find').oninput = e => { query = e.target.value.trim().toLowerCase(); draw(); };
for (const b of document.querySelectorAll('.filters button')) {
  b.onclick = () => {
    filter = b.dataset.filter;
    document.querySelectorAll('.filters button').forEach(x => x.setAttribute('aria-pressed', x === b));
    draw();
  };
}

function manage(b) {
  const box = document.createElement('div');
  const when = new Date(b.added).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  box.innerHTML = `<p>${escape(b.author || b.site)}</p>
    <p class="quiet">${escape(b.format.toUpperCase())} · ${b.words.toLocaleString()} words · added ${when}</p>
    ${/^https?:/.test(b.source) ? `<p><a href="${escape(b.source)}" target="_blank" rel="noopener">Original page</a></p>` : ''}
    <div class="actions"><button id="m-open">Read</button><button id="m-remove">Remove from library</button></div>`;
  openSheet(b.title, box);
  $('m-open').onclick = () => { closeLayers(); location.hash = `#/read/${b.id}`; };
  $('m-remove').onclick = async () => {
    closeLayers();
    reader.closeTab(b.id);
    await store.removeBook(b.id);
    toast(`Removed “${b.title}”.`);
  };
}

// Adding books and articles: the Add sheet, dropping files, pasting, sharing from Android.

$('add').onclick = () => {
  openSheet('Add to your library', template('t-add'));
  $('add-file').onchange = e => { closeLayers(); addFiles(e.target.files); };
  $('add-url').onsubmit = e => {
    e.preventDefault();
    closeLayers();
    addURL(new FormData(e.target).get('url'));
  };
  $('clip').href = bookmarklet;
  $('clip').onclick = e => { e.preventDefault(); toast('Drag it to your bookmarks bar.'); }; // clicked here, it would save ebis
};

// Whatever is added is read by the newest ebis. When a newer version is out than the one running
// (installed or still downloading), what was added waits where shares wait while ebis restarts
// into it, and is added there.
let restarting = false;
async function receive(items) {
  const newer = await newerVersion();
  if (newer) {
    restarting = true;
    toast('Updating ebis first…');
    restarting = await installed(newer); // a download can fail, and this version adds it then
    if (restarting) {
      await keep(items);
      await queue; // what is being added already is finished first
      history.replaceState(null, '', '#/shared');
      return newer.postMessage('update'); // it takes over, and the page reloads into it
    }
  }
  items.forEach(add);
}

// A file, a link, or a page as a browser showed it.
function add({ file, url, html }) {
  const title = file?.name ?? url.replace(/^https?:\/\/(www\.)?/, '');
  const opts = { fetchPage: store.fetchPage, fetcher: store.fetchBlob };
  const run = progress => file ? importFile(file, { ...opts, progress })
    : html ? importPage(html, url, { ...opts, progress }) : importURL(url, { ...opts, progress });
  const key = `pending-${crypto.randomUUID()}`;
  pending.set(key, { title, progress: 0.02 });
  draw();
  queue = queue.then(async () => {
    try {
      const { record, zip } = await run(p => {
        pending.get(key).progress = p;
        shelf.querySelector(`[data-id="${key}"] .progress i`)?.style.setProperty('width', `${p * 100}%`);
      });
      const id = await store.addBook(record, zip);
      toast(`Added “${record.title}”.`, ['Read', () => { location.hash = `#/read/${id}`; }]);
    } catch (e) {
      toast(`Couldn’t add ${title}. ${e.message}`);
    } finally {
      pending.delete(key);
      draw();
    }
  });
}
const addFiles = files => receive([...files].map(file => ({ file })));
const addURL = url => receive([{ url }]);

let drags = 0;
addEventListener('dragenter', e => { if (e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('text/uri-list')) drags++, $('drop').hidden = false; });
addEventListener('dragleave', () => { if (--drags <= 0) drags = 0, $('drop').hidden = true; });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => {
  e.preventDefault();
  drags = 0;
  $('drop').hidden = true;
  const url = e.dataTransfer.getData('text/uri-list').split('\n').find(u => /^https?:/.test(u));
  if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  else if (url) addURL(url.trim());
});
addEventListener('paste', e => {
  if ($('library').hidden || e.target.closest?.('input, textarea')) return;
  const text = e.clipboardData.getData('text').trim();
  if (e.clipboardData.files.length) addFiles(e.clipboardData.files);
  else if (/^https?:\/\/\S+$/.test(text)) addURL(text);
});

// What waits in a cache until ebis picks it up: what Android shares (the service worker keeps
// it there), and what was added just before a restart into a new version.
async function receiveShared() {
  const cache = await caches.open('ebis-shared');
  const items = [];
  for (const req of await cache.keys()) {
    const res = await cache.match(req);
    const name = decodeURIComponent(res.headers.get('x-name') || ''), page = res.headers.get('x-url');
    if (name) items.push({ file: new File([await res.blob()], name, { type: res.headers.get('content-type') }) });
    else if (page) items.push({ url: page, html: await res.text() });
    else {
      const url = (await res.text()).match(/https?:\/\/\S+/)?.[0];
      if (url) items.push({ url });
    }
    await cache.delete(req);
  }
  if (items.length) receive(items);
}
async function keep(items) {
  const cache = await caches.open('ebis-shared');
  for (const { file, url, html } of items) {
    await cache.put(`shared/${crypto.randomUUID()}`, file
      ? new Response(file, { headers: { 'x-name': encodeURIComponent(file.name), 'content-type': file.type || 'application/octet-stream' } })
      : new Response(html ?? url, { headers: html ? { 'x-url': url } : {} }));
  }
}

// The "Save to Ebis" bookmarklet, dragged from the Add sheet, runs on the page being read (one a
// paywall shows to a subscriber): it opens ebis at #/clip and, once ebis says it's ready, hands
// it the page as the browser shows it, to ebis's own address alone. It is made from this function,
// pointed at wherever this copy of ebis is served.
const clip = (app, origin) => {
  const ebis = open(`${app}#/clip`, 'ebis-clip');
  addEventListener('message', function ready(e) {
    if (e.source !== ebis || e.origin !== origin || e.data?.type !== 'ebis-clip-ready') return;
    removeEventListener('message', ready);
    ebis.postMessage({ type: 'ebis-clip', url: location.href, html: document.documentElement.outerHTML }, origin);
  });
};
const bookmarklet = `javascript:${encodeURIComponent(`(${clip})(${JSON.stringify(location.origin + location.pathname)}, ${JSON.stringify(location.origin)})`)}`;

// The page that opened ebis at #/clip can be anywhere, so the ready word goes to any origin;
// the page itself comes from that window alone.
function receiveClip() {
  const page = window.opener;
  const lost = () => toast('The page didn’t arrive. Drag “Save to Ebis” to your bookmarks bar again.');
  if (!page) return lost();
  toast('Waiting for the page…');
  const giveUp = setTimeout(() => { removeEventListener('message', hear); lost(); }, 15000);
  addEventListener('message', hear);
  page.postMessage({ type: 'ebis-clip-ready' }, '*');
  function hear(e) {
    const { type, html, url } = e.data ?? {};
    if (e.source !== page || type !== 'ebis-clip' || typeof html !== 'string' || typeof url !== 'string') return;
    clearTimeout(giveUp);
    removeEventListener('message', hear);
    receive([{ url, html }]);
  }
}

// The password, typed once on each device.

$('lock').onsubmit = async e => {
  e.preventDefault();
  e.target.inert = true;
  try {
    await store.unlock(new FormData(e.target).get('password'));
    e.target.reset();
    route();
    store.sync();
  } catch (err) {
    toast(err.message);
  } finally {
    e.target.inert = false;
  }
};

// The sync dot says whether this device is in step with the others, and opens the details.

$('sync').onclick = () => {
  openSheet('Library sync', template('t-sync'));
  showSync();
  $('sync-now').onclick = () => store.sync();
};

function showSync() {
  const { at, error } = store.syncStatus();
  $('sync').className = `sync${error ? ' stale' : at ? ' synced' : ''}`;
  const status = $('sync-status'); // there while the sync sheet is open
  if (status) status.textContent = error ? `Not synced: ${error}`
    : at ? `Synced at ${new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : 'Syncing…';
}

// Start.

// A new version installs in the background and waits; ebis offers to restart into it, and goes
// there itself before adding anything (see receive). It looks for one whenever it comes back to
// the screen, too: a phone keeps ebis open for days. (In development, served over plain http,
// ebis runs without its service worker.)
const registration = location.protocol === 'https:' && navigator.serviceWorker
  ? navigator.serviceWorker.register('sw.js').catch(() => null) : Promise.resolve(null);
registration.then(reg => {
  if (!reg) return;
  const offer = worker => worker && navigator.serviceWorker.controller && !restarting && toast('ebis has been updated.', ['Restart', () => worker.postMessage('update')]);
  offer(reg.waiting);
  reg.addEventListener('updatefound', () => reg.installing.addEventListener('statechange', e => e.target.state === 'installed' && offer(e.target)));
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload());
  addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reg.update().catch(() => {}));
});
async function newerVersion() { // than the one running, which on a first visit is the newest
  const reg = await registration;
  await reg?.update().catch(() => {}); // offline, there's no knowing
  return navigator.serviceWorker?.controller && (reg?.installing || reg?.waiting) || null;
}
function installed(worker) {
  return new Promise(resolve => {
    const check = () => worker.state === 'redundant' ? resolve(false) : worker.state !== 'installing' && resolve(true);
    check();
    worker.addEventListener('statechange', check);
  });
}

await store.ready;
addEventListener('hashchange', route);
route();
store.sync();
store.onChange(change => {
  if (change.locked) route();
  if ('syncing' in change) {
    showSync();
    $('sync').classList.toggle('busy', change.syncing);
  }
  if (!$('library').hidden && (change.kind === 'book' || change.kind === 'pos')) draw();
});
showSync();
