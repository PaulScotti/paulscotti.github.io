// App shell: passphrase gate → reader choice → hash routes (feed, day, journey, doctor, us).
import * as Data from './store.js';
import { STR, TRACKS } from './i18n.js';
import { renderDigest } from './digest.js';
import { esc, inlineOnly, plain } from './md.js';

const $ = (sel, root = document) => root.querySelector(sel);
const main = $('#main');
const S = { index: null, lang: 'en', digests: new Map(), route: '', cleanup: null, curriculumTotals: null, journeyQuery: '' };

// ---------- small utilities ----------
const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const t = () => STR[S.lang];
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 1800);
}
const skeleton = () => '<div class="skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>';
const todayPT = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
function applyTheme() {
  const th = ls.get('ph.theme') || 'auto';
  if (th === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = th;
}
const days = () => (S.index?.days || []).filter((d) => d.date <= todayPT());
const readers = () => S.index?.readers || [];
const reader = () => readers().find((r) => r.key === Data.prefs.reader) || null;
const setAuth = (v) => { document.documentElement.dataset.auth = v; };

// ---------- chrome ----------
function setLang(lang, { persist = true } = {}) {
  S.lang = lang === 'ko' ? 'ko' : 'en';
  document.documentElement.lang = S.lang;
  if (persist) ls.set('ph.lang', S.lang);
  document.querySelectorAll('.lang-toggle button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === S.lang)));
  const n = t().nav;
  $('#nav').innerHTML = [['feed', '#/'], ['journey', '#/journey'], ['doctor', '#/doctor'], ['us', '#/us']]
    .map(([k, href]) => `<a href="${href}" data-nav="${k}">${esc(n[k])}</a>`).join('');
  $('#foot-note').textContent = t().footer;
  document.title = S.lang === 'ko' ? '부모 되기 · Parenthood' : 'Parenthood';
  markNav();
}

function markNav() {
  const page = S.route.split('/')[0] || 'feed';
  const key = page === 'd' ? 'feed' : page;
  document.querySelectorAll('#nav a').forEach((a) => (a.dataset.nav === key ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
}

function renderContents() {
  const box = $('#contents');
  const list = days();
  if (!S.index || !list.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<span class="h">${esc(t().recent)}</span>${list.slice(0, 10).map((d) =>
    `<a href="#/d/${d.date}" data-date="${d.date}"><span class="n">${d.day}</span>${esc(plain(d.title?.[S.lang] || d.title?.en || ''))}</a>`).join('')}`;
}

let spy;
function scrollSpy() {
  spy?.disconnect();
  if (!('IntersectionObserver' in window)) return;
  spy = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) document.querySelectorAll('#contents a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.date === en.target.dataset.date)));
    }
  }, { rootMargin: '-30% 0px -60% 0px' });
  document.querySelectorAll('article.digest').forEach((a) => spy.observe(a));
}

// ---------- digests ----------
async function loadDigest(date) {
  if (S.digests.has(date)) return S.digests.get(date);
  const d = await Data.digest(date);
  if (d) S.digests.set(date, d);
  return d;
}

function digestEl(d) {
  return renderDigest(d, {
    lang: S.lang,
    isLatest: d.date === todayPT(),
    questions: Data.questions.all(),
    replyTo: S.index?.replyTo || '',
    state: S.index?.stage,
    onAddQuestion: (text, sourceDate) => { Data.questions.add({ text, lang: S.lang, sourceDate }); toast(t().added.replace('✓ ', '')); },
  });
}

// ---------- views ----------
async function viewFeed() {
  main.innerHTML = `<div id="feed">${skeleton()}</div><div class="feed-status mono" id="feed-status"></div>`;
  const feed = $('#feed');
  const status = $('#feed-status');
  const dates = days().map((d) => d.date);
  if (!dates.length) { feed.innerHTML = ''; status.textContent = t().empty; return; }
  let shown = 0;
  let loading = false;
  const token = S.route;
  const sentinel = document.createElement('div');
  sentinel.style.height = '1px';
  main.appendChild(sentinel);
  const more = async () => {
    if (loading || token !== S.route || shown >= dates.length) return;
    loading = true;
    status.textContent = t().loadingOlder;
    const batch = dates.slice(shown, shown + 2);
    try {
      const docs = await Promise.all(batch.map(loadDigest));
      if (token !== S.route) return;
      if (shown === 0) feed.innerHTML = '';
      for (const d of docs) if (d) feed.appendChild(digestEl(d));
      shown += batch.length;
      status.textContent = shown >= dates.length ? t().end : '';
      scrollSpy();
    } catch (e) {
      status.textContent = t().offline;
      console.error(e);
    } finally {
      loading = false;
    }
    if (shown < dates.length && sentinel.getBoundingClientRect().top < window.innerHeight * 2) more();
  };
  const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && more(), { rootMargin: '1200px 0px' });
  io.observe(sentinel);
  S.cleanup = () => { io.disconnect(); S.cleanup = null; };
  await more();
}

async function viewDay(date) {
  main.innerHTML = skeleton();
  let d;
  try { d = await loadDigest(date); } catch { main.innerHTML = `<p class="empty">${esc(t().offline)}</p>`; return; }
  if (!d) { main.innerHTML = `<p class="empty">${esc(t().notFound)}</p><p><a class="btn secondary" href="#/">${esc(t().nav.feed)}</a></p>`; return; }
  main.innerHTML = '';
  main.appendChild(digestEl(d));
  const list = days();
  const i = list.findIndex((x) => x.date === date);
  const newer = i > 0 ? list[i - 1] : null;
  const older = i >= 0 && i < list.length - 1 ? list[i + 1] : null;
  const nav = document.createElement('nav');
  nav.className = 'digest-nav';
  nav.innerHTML = `<span>${newer ? `<a href="#/d/${newer.date}">${esc(t().newer)}</a>` : ''}</span><a href="#/journey">${esc(t().allDays)}</a><span>${older ? `<a href="#/d/${older.date}">${esc(t().older)}</a>` : ''}</span>`;
  main.appendChild(nav);
  scrollSpy();
  window.scrollTo(0, 0);
}

function viewJourney(sub = 'timeline') {
  const T = t().journey;
  const list = days();
  const lang = S.lang;
  const tracksSeen = new Set(list.map((d) => d.track));
  const glossary = [];
  for (const d of list) for (const g of d.glossary || []) if (!glossary.some((x) => x.en.toLowerCase() === g.en.toLowerCase())) glossary.push({ ...g, date: d.date, day: d.day });
  const totals = S.curriculumTotals || {};
  const covered = {};
  for (const d of list) covered[d.track] = (covered[d.track] || 0) + 1;
  const kmap = Object.entries(TRACKS).map(([id, tr]) => {
    const n = covered[id] || 0;
    const tot = Math.max(totals[id] || n || 1, n);
    return `<div class="row"><span class="name"><span class="dot" style="background:${tr.color}"></span><span>${esc(tr[lang])}</span></span>
      <span class="track"><span class="fill" style="width:${((n / tot) * 100).toFixed(1)}%;background:${tr.color}"></span></span>
      <span class="n">${n}/${tot}</span></div>`;
  }).join('');

  main.innerHTML = `
    <div class="page-head"><h1>${esc(T.title)}</h1><span class="badge">${esc(t().day(list[0]?.day || 0).toUpperCase())}</span></div>
    <p class="lead">${esc(T.intro)}</p>
    <div class="stats-row"><span><b>${list.length}</b> ${esc(T.days(list.length).replace(/^\d+\s*/, ''))}</span><span><b>${tracksSeen.size}</b> ${esc(T.themes(tracksSeen.size).replace(/^\d+\s*/, ''))}</span><span><b>${glossary.length}</b> ${esc(T.words(glossary.length).replace(/^\d+\s*/, ''))}</span></div>
    <div class="kmap"><div class="label" style="margin-bottom:8px">${esc(T.map)} · ${esc(T.topics)}</div>${kmap}
      <div class="axis"><span></span><span><i>0</i><i>50%</i><i>100%</i></span><span></span></div></div>
    <div class="seg" role="group">${['timeline', 'themes', 'words'].map((k) => `<button type="button" data-sub="${k}" aria-pressed="${sub === k}">${esc(T.views[k])}</button>`).join('')}</div>
    <input id="jsearch" class="search" type="search" placeholder="${esc(T.search)}" value="${esc(S.journeyQuery)}" autocomplete="off">
    <div id="jbody"></div>`;
  main.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { location.hash = `#/journey/${b.dataset.sub}`; }));
  const input = $('#jsearch');
  input.addEventListener('input', () => { S.journeyQuery = input.value; body(); });
  body();

  function body() {
    const q = S.journeyQuery.toLowerCase();
    const match = (d) => !q || [d.title?.en, d.title?.ko, d.takeaway?.en, d.takeaway?.ko].some((x) => (x || '').toLowerCase().includes(q));
    const row = (d) => {
      const tr = TRACKS[d.track];
      return `<a class="tl-row" href="#/d/${d.date}"><div>
        <div class="m"><span>${esc(t().day(d.day).toUpperCase())}</span><span>${esc(t().fmtDate(d.date, { weekday: false }))}</span>${tr ? `<span class="badge plain"><span class="dot" style="background:${tr.color}"></span>${esc(tr[lang])}</span>` : ''}</div>
        <div class="t">${inlineOnly(d.takeaway?.[lang] || d.takeaway?.en || '')}</div>
        <div class="tt">${inlineOnly(d.title?.[lang] || d.title?.en || '')}</div></div><span class="arrow">↗</span></a>`;
    };
    let html = '';
    if (sub === 'themes') {
      html = Object.entries(TRACKS).map(([id, tr]) => {
        const items = list.filter((d) => d.track === id && match(d)).slice().reverse();
        return items.length ? `<div class="theme-block"><h2><span class="dot" style="background:${tr.color}"></span>${esc(tr[lang])} <span class="c">${items.length}</span></h2>${items.map(row).join('')}</div>` : '';
      }).join('');
    } else if (sub === 'words') {
      const other = lang === 'en' ? 'ko' : 'en';
      html = glossary.filter((g) => !q || [g.en, g.ko, g.noteEn, g.noteKo].some((x) => (x || '').toLowerCase().includes(q)))
        .sort((a, b) => a[lang].localeCompare(b[lang], lang))
        .map((g) => `<div class="gloss-row"><div class="p">${esc(g[lang])} <span class="mono muted">↔</span> <span class="alt">${esc(g[other])}</span></div>
          <div class="n">${esc(lang === 'en' ? g.noteEn || '' : g.noteKo || '')}</div><div class="d"><a href="#/d/${g.date}">${esc(T.fromDay(g.day))}</a></div></div>`).join('');
    } else {
      let lastMonth = '';
      html = list.filter(match).map((d) => {
        const m = d.date.slice(0, 7);
        const head = m !== lastMonth ? `<div class="label month">${esc(t().fmtMonth(d.date))}</div>` : '';
        lastMonth = m;
        return head + row(d);
      }).join('');
    }
    $('#jbody').innerHTML = html || `<p class="empty">${esc(list.length ? T.noMatch : t().empty)}</p>`;
  }
}

function viewDoctor() {
  const T = t().doctor;
  const lang = S.lang;
  const other = lang === 'en' ? 'ko' : 'en';
  const qs = Data.questions.all();
  const open = qs.filter((q) => !q.done);
  const done = qs.filter((q) => q.done);
  const dayOf = (date) => (S.index?.days || []).find((d) => d.date === date)?.day;
  const item = (q) => {
    const n = dayOf(q.sourceDate);
    return `<li class="q-item${q.done ? ' done' : ''}" data-id="${esc(q.id)}">
      <input type="checkbox" ${q.done ? 'checked' : ''} aria-label="done">
      <div><div class="t">${esc(q.text?.[lang] || q.text?.[other] || '')}</div><div class="m">${q.sourceDate && n ? `<a href="#/d/${esc(q.sourceDate)}">${esc(T.fromDay(n))}</a>` : ''}</div></div>
      <button type="button" class="x" aria-label="${esc(T.remove)}">×</button></li>`;
  };
  main.innerHTML = `
    <div class="page-head"><h1>${esc(T.title)}</h1><span class="badge">${open.length}</span></div>
    <p class="lead">${esc(T.intro)}</p>
    <form class="q-add"><input name="q" placeholder="${esc(T.placeholder)}" maxlength="600" autocomplete="off"><button class="btn" type="submit">${esc(T.add)}</button></form>
    <div class="q-tools"><button type="button" class="btn-mini" data-copy="en">${esc(T.copyEn)}</button><button type="button" class="btn-mini" data-copy="ko">${esc(T.copyKo)}</button></div>
    <div class="label" style="margin-bottom:6px">${esc(T.open)}</div>
    ${open.length ? `<ul class="q-list">${open.map(item).join('')}</ul>` : `<p class="empty">${esc(T.empty)}</p>`}
    ${done.length ? `<details><summary class="label done-sum">${esc(T.done(done.length))}</summary><ul class="q-list">${done.map(item).join('')}</ul></details>` : ''}`;
  main.querySelector('form').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = ev.target.q.value.trim();
    if (!v) return;
    Data.questions.add({ text: { [lang]: v }, lang, sourceDate: null });
    viewDoctor();
  });
  main.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const L = b.dataset.copy;
    const lines = open.map((q, i) => `${i + 1}. ${q.text?.[L] || q.text?.[L === 'en' ? 'ko' : 'en'] || ''}`);
    try { await navigator.clipboard.writeText(lines.join('\n')); toast(T.copied); } catch { toast('—'); }
  }));
  main.querySelectorAll('.q-item').forEach((li) => {
    const id = li.dataset.id;
    li.querySelector('input').addEventListener('change', (e) => { Data.questions.update(id, { done: e.target.checked }); viewDoctor(); });
    li.querySelector('.x').addEventListener('click', () => { Data.questions.remove(id); viewDoctor(); });
  });
}

function stageLine(st) {
  const T = t().us;
  if (!st) return '';
  if (st.stage === 'pregnant' && (st.lmp || st.due)) {
    const lmp = st.lmp || new Date(Date.parse(`${st.due}T12:00:00Z`) - 280 * 864e5).toISOString().slice(0, 10);
    const n = Math.round((Date.parse(`${todayPT()}T12:00:00Z`) - Date.parse(`${lmp}T12:00:00Z`)) / 864e5);
    const due = st.due || new Date(Date.parse(`${lmp}T12:00:00Z`) + 280 * 864e5).toISOString().slice(0, 10);
    if (n >= 0 && n < 300) return T.week(Math.floor(n / 7), n % 7, t().fmtDate(due, { weekday: false, year: true }));
  }
  if (st.stage === 'born' && st.birth) {
    const n = Math.round((Date.parse(`${todayPT()}T12:00:00Z`) - Date.parse(`${st.birth}T12:00:00Z`)) / 864e5);
    if (n >= 0) return T.babyAge(Math.floor(n / 7));
  }
  return '';
}

function viewUs() {
  const T = t().us;
  const lang = S.lang;
  const st = S.index?.stage || { stage: 'ttc' };
  const r = reader();
  const theme = ls.get('ph.theme') || 'auto';
  const replyTo = S.index?.replyTo || '';
  const line = stageLine(st);
  main.innerHTML = `
    <div class="page-head"><h1>${esc(T.title)}</h1></div>
    <section class="block"><span class="label">${esc(T.reader)}</span>
      <div class="row-actions"><span class="us-reader">${esc(r?.name?.[lang] || '—')}</span><button class="btn-mini" type="button" id="switch-reader">${esc(T.switchReader)}</button></div></section>
    <section class="block"><span class="label">${esc(T.stage)}</span>
      <p class="us-stage">${esc(T.stages[st.stage] || T.stages.ttc)}${line ? ` · <span class="mono">${esc(line)}</span>` : ''}</p>
      <p class="help">${esc(T.stageHelp)}</p></section>
    ${replyTo ? `<section class="block"><span class="label">${esc(T.tell)}</span><p class="help">${esc(T.tellHelp(replyTo))}</p>
      <a class="btn" href="mailto:${esc(replyTo)}?subject=${encodeURIComponent(T.tellSubject)}">${esc(T.tellBtn)}</a></section>` : ''}
    <section class="block"><span class="label">${esc(T.prefs)}</span>
      <div class="field"><label>${esc(T.language)}</label><div class="stage-seg" role="group">
        <button type="button" data-l="en" aria-pressed="${lang === 'en'}">English</button><button type="button" data-l="ko" aria-pressed="${lang === 'ko'}">한국어</button></div></div>
      <div class="field"><label>${esc(T.theme)}</label><div class="stage-seg" role="group">${['auto', 'light', 'dark'].map((k) => `<button type="button" data-theme="${k}" aria-pressed="${theme === k}">${esc(T.themes[k])}</button>`).join('')}</div></div>
    </section>
    <section class="block"><span class="label">${esc(T.how)}</span><div class="prose-small" style="margin-top:10px">${T.howBody.map((p) => `<p>${esc(p)}</p>`).join('')}<p class="muted">${esc(T.disclaimer)}</p></div></section>
    <section class="block"><div class="row-actions"><button class="btn secondary" type="button" id="export">${esc(T.export)}</button><button class="btn secondary" type="button" id="lock">${esc(T.lock)}</button></div>
      <p class="help" style="margin-top:10px">${esc(T.lockHelp)}</p></section>`;
  $('#switch-reader').addEventListener('click', () => viewWho());
  main.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.l); rerender(); }));
  main.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => { ls.set('ph.theme', b.dataset.theme); applyTheme(); viewUs(); }));
  $('#export').addEventListener('click', async () => {
    const data = await Data.exportAll(S.index);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `parenthood-${todayPT()}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('#lock').addEventListener('click', async () => {
    await Data.lock();
    S.index = null;
    S.digests.clear();
    viewUnlock();
  });
}

// ---------- gates ----------
function viewUnlock(error = '') {
  setAuth('out');
  $('#contents').hidden = true;
  const en = STR.en;
  const ko = STR.ko;
  main.innerHTML = `<div class="gate">
    <h1>${esc(en.unlockTitle)} <span class="muted ko">· ${esc(ko.unlockTitle)}</span></h1>
    <p>${esc(en.unlockBody)}</p><p class="ko">${esc(ko.unlockBody)}</p>
    <form id="unlock" class="unlock-form" autocomplete="on">
      <input type="text" name="username" autocomplete="username" value="parenthood" hidden>
      <label for="pass" class="label">${esc(en.passphrase)} · ${esc(ko.passphrase)}</label>
      <input id="pass" name="password" type="password" autocomplete="current-password" autocapitalize="none" autocorrect="off" spellcheck="false" required>
      <button class="btn" type="submit">${esc(en.unlock)} · ${esc(ko.unlock)}</button>
    </form>
    ${error ? `<div class="error-box">${esc(en.wrong)}<br><span class="ko">${esc(ko.wrong)}</span></div>` : ''}
    <p class="fine">${esc(en.unlockNote)}<br><span class="ko">${esc(ko.unlockNote)}</span></p></div>`;
  const form = $('#unlock');
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = `${en.unlocking}`;
    try {
      S.index = await Data.unlock(form.password.value);
    } catch (e) {
      if (e.message === 'wrong-passphrase') { viewUnlock('wrong'); return; }
      main.innerHTML = `<div class="error-box">${esc(en.offline)}<br><span class="ko">${esc(ko.offline)}</span></div>`;
      return;
    }
    if (reader()) enterApp();
    else viewWho();
  });
  $('#pass').focus();
}

function viewWho() {
  setAuth('out');
  $('#contents').hidden = true;
  const en = STR.en;
  const ko = STR.ko;
  main.innerHTML = `<div class="gate">
    <h1>${esc(en.whoTitle)} <span class="muted ko">· ${esc(ko.whoTitle)}</span></h1>
    <p>${esc(en.whoBody)}</p><p class="ko">${esc(ko.whoBody)}</p>
    <div class="who">${readers().map((r) => `<button type="button" class="btn secondary who-btn" data-key="${esc(r.key)}">${esc(r.name?.[r.lang] || r.key)} · ${r.lang === 'ko' ? '한국어' : 'English'}</button>`).join('')}</div></div>`;
  main.querySelectorAll('.who-btn').forEach((b) => b.addEventListener('click', () => {
    Data.prefs.reader = b.dataset.key;
    const r = reader();
    if (r) setLang(r.lang);
    enterApp();
  }));
}

function viewSetup() {
  setAuth('out');
  main.innerHTML = `<div class="gate"><h1>${esc(STR.en.setupTitle)} <span class="muted ko">· ${esc(STR.ko.setupTitle)}</span></h1>
    <p>${esc(STR.en.setupBody)}</p><p class="ko">${esc(STR.ko.setupBody)}</p></div>`;
}

function enterApp() {
  setAuth('in');
  if (!ls.get('ph.lang') && reader()) setLang(reader().lang, { persist: false });
  S.route = location.hash.replace(/^#\/?/, '');
  rerender();
}

// ---------- routing ----------
function rerender() {
  if (!S.index || document.documentElement.dataset.auth !== 'in') return;
  const [page, arg] = S.route.split('/');
  S.cleanup?.();
  markNav();
  renderContents();
  if (page === 'd' && arg) return arg === days()[0]?.date ? viewFeed() : viewDay(arg);
  if (page === 'journey') return viewJourney(arg || 'timeline');
  if (page === 'doctor') return viewDoctor();
  if (page === 'us') return viewUs();
  return viewFeed();
}

window.addEventListener('hashchange', () => {
  const next = location.hash.replace(/^#\/?/, '');
  if (next.split('/')[0] !== S.route.split('/')[0] || next.startsWith('d/')) window.scrollTo(0, 0);
  S.route = next;
  rerender();
});

// Refresh the day list when the app comes back to the foreground (new digests arrive each morning).
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !S.index) return;
  try {
    const fresh = await Data.index();
    if (!fresh) return;
    const changed = fresh.days?.[0]?.date !== S.index.days?.[0]?.date;
    S.index = fresh;
    if (changed) rerender();
  } catch { /* offline: keep what we have */ }
});

// ---------- boot ----------
async function start() {
  applyTheme();
  const saved = ls.get('ph.lang');
  setLang(saved || (navigator.language?.startsWith('ko') ? 'ko' : 'en'), { persist: false });
  document.querySelectorAll('.lang-toggle button').forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.lang); rerender(); }));
  S.route = location.hash.replace(/^#\/?/, '');
  fetch('pipeline/curriculum.json').then((r) => r.json()).then((c) => {
    S.curriculumTotals = {};
    for (const u of c.units) S.curriculumTotals[u.track] = (S.curriculumTotals[u.track] || 0) + 1;
    if (S.route.startsWith('journey')) rerender();
  }).catch(() => {});

  let keyinfo;
  try {
    keyinfo = await Data.init();
  } catch {
    main.innerHTML = `<div class="error-box">${esc(STR.en.offline)}<br><span class="ko">${esc(STR.ko.offline)}</span></div>`;
    return;
  }
  if (!keyinfo) { viewSetup(); return; }
  S.index = await Data.resume();
  if (!S.index) { viewUnlock(); return; }
  if (reader()) enterApp();
  else viewWho();
}

start().catch((e) => {
  console.error(e);
  main.innerHTML = `<div class="error-box">${esc(STR.en.loadError)}</div>`;
});
