// App shell: auth gate → live data subscriptions → hash routes (feed, day, journey, doctor, us).
import { firebaseConfig } from './config.js';
import * as Data from './data.js';
import { STR, TRACKS } from './i18n.js';
import { renderDigest, receipts } from './digest.js';
import { esc, inlineOnly, plain } from './md.js';

const EMULATOR = ['localhost', '127.0.0.1'].includes(location.hostname) && !new URLSearchParams(location.search).has('prod');
const $ = (sel, root = document) => root.querySelector(sel);
const main = $('#main');

const S = {
  user: null, email: null, lang: 'en', members: {}, overview: null, state: { stage: 'ttc' },
  questions: [], inbox: [], feedback: [], digests: new Map(), feedDone: false, feedLoading: false, route: '',
  unsubs: [], curriculumTotals: null,
};

// ---------- small utilities ----------
const store = {
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
function skeleton() { return '<div class="skeleton" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>'; }
function todayPT() { return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }); }
function applyTheme() {
  const th = store.get('ph.theme') || 'auto';
  if (th === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = th;
}

// ---------- chrome (nav, language, contents) ----------
function setLang(lang, { persist = true } = {}) {
  S.lang = lang === 'ko' ? 'ko' : 'en';
  document.documentElement.lang = S.lang;
  if (persist) store.set('ph.lang', S.lang);
  document.querySelectorAll('.lang-toggle button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === S.lang)));
  const n = t().nav;
  $('#nav').innerHTML = [['feed', '#/'], ['journey', '#/journey'], ['doctor', '#/doctor'], ['us', '#/us']]
    .map(([k, href]) => `<a href="${href}" data-nav="${k}">${esc(n[k])}</a>`).join('');
  markNav();
  $('#foot-note').textContent = t().footer;
  document.title = S.lang === 'ko' ? '부모 되기 · Parenthood' : 'Parenthood';
}

function markNav() {
  const page = S.route.split('/')[0] || 'feed';
  const key = page === 'd' ? 'feed' : page;
  document.querySelectorAll('#nav a').forEach((a) => {
    if (a.dataset.nav === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

function renderContents() {
  const box = $('#contents');
  const days = S.overview || [];
  if (!S.user || !days.length) { box.hidden = true; return; }
  box.hidden = false;
  box.innerHTML = `<span class="h">${esc(t().recent)}</span>${days.slice(0, 10).map((d) =>
    `<a href="#/d/${d.date}" data-date="${d.date}"><span class="n">${d.day}</span>${esc(plain(d.title?.[S.lang] || d.title?.en || ''))}</a>`).join('')}`;
}

let spy;
function scrollSpy() {
  spy?.disconnect();
  if (!('IntersectionObserver' in window)) return;
  spy = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const date = en.target.dataset.date;
      document.querySelectorAll('#contents a').forEach((a) => a.setAttribute('aria-current', String(a.dataset.date === date)));
    }
  }, { rootMargin: '-30% 0px -60% 0px' });
  document.querySelectorAll('article.digest').forEach((a) => spy.observe(a));
}

// ---------- read receipts ----------
let readObs;
function watchReads(root) {
  if (!('IntersectionObserver' in window)) return;
  readObs ||= new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const art = en.target.closest('article.digest');
      readObs.unobserve(en.target);
      const date = art?.dataset.date;
      if (date && !S.members[S.email]?.reads?.[date]) Data.markRead(S.email, date).catch(() => {});
    }
  }, { threshold: 0.5 });
  root.querySelectorAll('.end-mark').forEach((m) => readObs.observe(m));
}

function refreshReceipts() {
  document.querySelectorAll('article.digest').forEach((a) => {
    const r = a.querySelector('.receipts');
    if (r) r.innerHTML = receipts(a.dataset.date, S.lang, S.members);
  });
}

// ---------- digest helpers ----------
async function loadDigest(date) {
  if (S.digests.has(date)) return S.digests.get(date);
  const d = await Data.getDigest(date);
  if (d) S.digests.set(date, d);
  return d;
}
function digestEl(d) {
  const latest = S.overview?.[0]?.date === d.date;
  return renderDigest(d, {
    lang: S.lang, isLatest: latest && d.date === todayPT(), me: S.email, members: S.members, questions: S.questions,
    feedback: S.feedback, state: S.state,
    onAddQuestion: (text, sourceDate) => Data.addQuestion(S.email, { text, lang: S.lang, sourceDate }).then(() => toast(t().added.replace('✓ ', ''))).catch(showError),
    onVote: (date, v) => Data.vote(S.email, date, v).then(() => v && toast(t().voteSaved)).catch(showError),
  });
}

// ---------- views ----------
async function viewFeed() {
  S.cleanup?.();
  main.innerHTML = `<div id="feed"></div><div class="feed-status mono" id="feed-status"></div>`;
  const feed = $('#feed');
  const status = $('#feed-status');
  if (S.overview && !S.overview.length) { status.textContent = t().empty; return; }
  feed.innerHTML = skeleton();
  const order = () => (S.overview || []).map((d) => d.date);
  let shown = 0;
  const token = S.route;
  const more = async () => {
    if (S.feedLoading || token !== S.route) return;
    const dates = order();
    if (!dates.length && S.overview === null) return;
    if (shown >= dates.length) { status.textContent = dates.length ? t().end : t().empty; return; }
    S.feedLoading = true;
    status.textContent = t().loadingOlder;
    const batch = dates.slice(shown, shown + 2);
    const docs = await Promise.all(batch.map(loadDigest));
    if (token !== S.route) { S.feedLoading = false; return; }
    if (shown === 0) feed.innerHTML = '';
    for (const d of docs) if (d) feed.appendChild(digestEl(d));
    shown += batch.length;
    S.feedLoading = false;
    status.textContent = shown >= dates.length ? t().end : '';
    watchReads(feed);
    scrollSpy();
    if (shown < dates.length && sentinelVisible()) more();
  };
  const sentinel = document.createElement('div');
  sentinel.style.height = '1px';
  main.appendChild(sentinel);
  const sentinelVisible = () => sentinel.getBoundingClientRect().top < window.innerHeight * 2;
  const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && more(), { rootMargin: '1200px 0px' });
  io.observe(sentinel);
  S.cleanup = () => { io.disconnect(); S.cleanup = null; };
  await more();
}

async function viewDay(date) {
  main.innerHTML = skeleton();
  const d = await loadDigest(date);
  if (!d) { main.innerHTML = `<p class="empty">${esc(t().notFound)}</p><p><a class="btn secondary" href="#/">${esc(t().nav.feed)}</a></p>`; return; }
  main.innerHTML = '';
  main.appendChild(digestEl(d));
  const days = S.overview || [];
  const i = days.findIndex((x) => x.date === date);
  const newer = i > 0 ? days[i - 1] : null;
  const older = i >= 0 && i < days.length - 1 ? days[i + 1] : null;
  const nav = document.createElement('nav');
  nav.className = 'digest-nav';
  nav.innerHTML = `<span>${newer ? `<a href="#/d/${newer.date}">${esc(t().newer)}</a>` : ''}</span><a href="#/journey">${esc(t().allDays)}</a><span>${older ? `<a href="#/d/${older.date}">${esc(t().older)}</a>` : ''}</span>`;
  main.appendChild(nav);
  watchReads(main);
  scrollSpy();
  window.scrollTo(0, 0);
}

function viewJourney(sub = 'timeline') {
  const T = t().journey;
  const days = S.overview || [];
  const lang = S.lang;
  const tracksSeen = new Set(days.map((d) => d.track));
  const glossary = [];
  for (const d of days) for (const g of d.glossary || []) if (!glossary.some((x) => x.en.toLowerCase() === g.en.toLowerCase())) glossary.push({ ...g, date: d.date, day: d.day });

  const totals = S.curriculumTotals || {};
  const covered = {};
  for (const d of days) covered[d.track] = (covered[d.track] || 0) + 1;
  const kmap = Object.entries(TRACKS).map(([id, tr]) => {
    const n = covered[id] || 0;
    const tot = Math.max(totals[id] || n || 1, n);
    return `<div class="row"><span class="name"><span class="dot" style="background:${tr.color}"></span><span>${esc(tr[lang])}</span></span>
      <span class="track"><span class="fill" style="width:${((n / tot) * 100).toFixed(1)}%;background:${tr.color}"></span></span>
      <span class="n">${n}/${tot}</span></div>`;
  }).join('');

  main.innerHTML = `
    <div class="page-head"><h1>${esc(T.title)}</h1><span class="badge">${esc(t().day(days[0]?.day || 0).toUpperCase())}</span></div>
    <p class="lead">${esc(T.intro)}</p>
    <div class="stats-row"><span><b>${days.length}</b> ${esc(T.days(days.length).replace(/^\d+\s*/, ''))}</span><span><b>${tracksSeen.size}</b> ${esc(T.themes(tracksSeen.size).replace(/^\d+\s*/, ''))}</span><span><b>${glossary.length}</b> ${esc(T.words(glossary.length).replace(/^\d+\s*/, ''))}</span></div>
    <div class="kmap"><div class="label" style="margin-bottom:8px">${esc(T.map)} · ${esc(T.topics)}</div>${kmap}
      <div class="axis"><span></span><span><i>0</i><i>50%</i><i>100%</i></span><span></span></div></div>
    <div class="seg" role="group">${['timeline', 'themes', 'words'].map((k) => `<button type="button" data-sub="${k}" aria-pressed="${sub === k}">${esc(T.views[k])}</button>`).join('')}</div>
    <input id="jsearch" class="search" type="search" placeholder="${esc(T.search)}" value="${esc(S.journeyQuery || '')}" autocomplete="off">
    <div id="jbody"></div>`;
  main.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { location.hash = `#/journey/${b.dataset.sub}`; }));
  const input = $('#jsearch');
  input.addEventListener('input', () => { S.journeyQuery = input.value; body(); });
  body();

  function body() {
    const q = (S.journeyQuery || '').toLowerCase();
    const match = (d) => !q || [d.title?.en, d.title?.ko, d.takeaway?.en, d.takeaway?.ko].some((x) => (x || '').toLowerCase().includes(q));
    const row = (d) => {
      const tr = TRACKS[d.track];
      return `<a class="tl-row" href="#/d/${d.date}"><div>
        <div class="m"><span>${esc(t().day(d.day).toUpperCase())}</span><span>${esc(t().fmtDate(d.date, { weekday: false }))}</span>${tr ? `<span class="badge plain"><span class="dot" style="background:${tr.color}"></span>${esc(tr[lang])}</span>` : ''}</div>
        <div class="t">${inlineOnly(d.takeaway?.[lang] || d.takeaway?.en || '')}</div>
        <div class="tt">${inlineOnly(d.title?.[lang] || d.title?.en || '')}</div></div><span class="arrow">↗</span></a>`;
    };
    const none = `<p class="empty">${esc(days.length ? T.noMatch : t().empty)}</p>`;
    let html = '';
    if (sub === 'themes') {
      html = Object.entries(TRACKS).map(([id, tr]) => {
        const list = days.filter((d) => d.track === id && match(d)).slice().reverse();
        if (!list.length) return '';
        return `<div class="theme-block"><h2><span class="dot" style="background:${tr.color}"></span>${esc(tr[lang])} <span class="c">${list.length}</span></h2>${list.map(row).join('')}</div>`;
      }).join('');
    } else if (sub === 'words') {
      const other = lang === 'en' ? 'ko' : 'en';
      html = glossary.filter((g) => !q || [g.en, g.ko, g.noteEn, g.noteKo].some((x) => (x || '').toLowerCase().includes(q)))
        .sort((a, b) => a[lang].localeCompare(b[lang], lang))
        .map((g) => `<div class="gloss-row"><div class="p">${esc(g[lang])} <span class="mono muted">↔</span> <span class="alt">${esc(g[other])}</span></div>
          <div class="n">${esc(lang === 'en' ? g.noteEn || '' : g.noteKo || '')}</div><div class="d"><a href="#/d/${g.date}">${esc(T.fromDay(g.day))}</a></div></div>`).join('');
    } else {
      let lastMonth = '';
      html = days.filter(match).map((d) => {
        const m = d.date.slice(0, 7);
        const head = m !== lastMonth ? `<div class="label month">${esc(t().fmtMonth(d.date))}</div>` : '';
        lastMonth = m;
        return head + row(d);
      }).join('');
    }
    $('#jbody').innerHTML = html || none;
  }
}

function viewDoctor() {
  const T = t().doctor;
  const lang = S.lang;
  const other = lang === 'en' ? 'ko' : 'en';
  const qs = S.questions.slice().sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0));
  const open = qs.filter((q) => !q.done);
  const done = qs.filter((q) => q.done);
  const dayOf = (date) => (S.overview || []).find((d) => d.date === date)?.day;
  const nameOf = (email) => S.members[email]?.name?.[lang] || '';
  const item = (q) => {
    const text = q.text?.[lang] || q.text?.[other] || '';
    const n = dayOf(q.sourceDate);
    return `<li class="q-item${q.done ? ' done' : ''}" data-id="${esc(q.id)}">
      <input type="checkbox" ${q.done ? 'checked' : ''} aria-label="done">
      <div><div class="t">${esc(text)}</div><div class="m">${q.sourceDate && n ? `<a href="#/d/${esc(q.sourceDate)}">${esc(T.fromDay(n))}</a>` : ''}${q.by && q.by !== S.email ? ` ${esc(T.by(nameOf(q.by)))}` : ''}</div></div>
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
    Data.addQuestion(S.email, { text: { [lang]: v }, lang, sourceDate: null }).catch(showError);
    ev.target.reset();
  });
  main.querySelectorAll('[data-copy]').forEach((b) => b.addEventListener('click', async () => {
    const L = b.dataset.copy;
    const lines = open.map((q, i) => `${i + 1}. ${q.text?.[L] || q.text?.[L === 'en' ? 'ko' : 'en'] || ''}`);
    try { await navigator.clipboard.writeText(lines.join('\n')); toast(T.copied); } catch { toast('—'); }
  }));
  main.querySelectorAll('.q-item').forEach((li) => {
    const id = li.dataset.id;
    li.querySelector('input').addEventListener('change', (e) => Data.setQuestionDone(S.email, id, e.target.checked).catch(showError));
    li.querySelector('.x').addEventListener('click', () => Data.deleteQuestion(id).catch(showError));
  });
}

function viewUs() {
  const T = t().us;
  const lang = S.lang;
  const st = S.state || { stage: 'ttc' };
  const draft = S.stageDraft || { ...st };
  const kind = S.inboxKind || 'note';
  const dayOf = (date) => (S.overview || []).find((d) => d.date === date)?.day;
  let readout = '';
  if (draft.stage === 'pregnant' && (draft.lmp || draft.due)) {
    const lmp = draft.lmp || new Date(Date.parse(`${draft.due}T12:00:00Z`) - 280 * 864e5).toISOString().slice(0, 10);
    const days = Math.round((Date.parse(`${todayPT()}T12:00:00Z`) - Date.parse(`${lmp}T12:00:00Z`)) / 864e5);
    const due = draft.due || new Date(Date.parse(`${lmp}T12:00:00Z`) + 280 * 864e5).toISOString().slice(0, 10);
    if (days >= 0 && days < 300) readout = T.week(Math.floor(days / 7), days % 7, t().fmtDate(due, { weekday: false, year: true }));
  } else if (draft.stage === 'born' && draft.birth) {
    const days = Math.round((Date.parse(`${todayPT()}T12:00:00Z`) - Date.parse(`${draft.birth}T12:00:00Z`)) / 864e5);
    if (days >= 0) readout = T.babyAge(Math.floor(days / 7));
  }
  const inbox = S.inbox.slice().sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0)).slice(0, 12);
  const theme = store.get('ph.theme') || 'auto';
  main.innerHTML = `
    <div class="page-head"><h1>${esc(T.title)}</h1></div>
    <section class="block"><span class="label">${esc(T.stage)}</span><p class="help">${esc(T.stageHelp)}</p>
      <div class="stage-seg" role="group">${['ttc', 'pregnant', 'born'].map((s) => `<button type="button" data-stage="${s}" aria-pressed="${draft.stage === s}">${esc(T.stages[s])}</button>`).join('')}</div>
      ${draft.stage === 'pregnant' ? `<div class="field"><label for="lmp">${esc(T.lmp)}</label><input id="lmp" type="date" value="${esc(draft.lmp || '')}"></div>
        <div class="field"><label for="due">${esc(T.due)}</label><input id="due" type="date" value="${esc(draft.due || '')}"></div>` : ''}
      ${draft.stage === 'born' ? `<div class="field"><label for="birth">${esc(T.birth)}</label><input id="birth" type="date" value="${esc(draft.birth || '')}"></div>` : ''}
      ${readout ? `<div class="stage-readout">${esc(readout)}</div>` : ''}
      <div class="row-actions"><button class="btn" type="button" id="save-stage">${esc(T.save)}</button></div>
    </section>
    <section class="block"><span class="label">${esc(T.inbox)}</span><p class="help">${esc(T.inboxHelp)}</p>
      <div class="kind-seg" role="group">${['note', 'request'].map((k) => `<button type="button" data-kind="${k}" aria-pressed="${kind === k}">${esc(T.kinds[k])}</button>`).join('')}</div>
      <textarea class="box" id="inbox-text" maxlength="2000" placeholder="${esc(T.placeholder[kind])}" style="margin-top:10px">${esc(S.inboxDraft || '')}</textarea>
      <div class="row-actions"><button class="btn" type="button" id="send-inbox">${esc(T.send)}</button></div>
      ${inbox.length ? `<ul class="inbox-list">${inbox.map((m) => {
        const text = (lang === 'en' ? m.text_en : m.text_ko) || m.text;
        const n = dayOf(m.coveredBy);
        const status = m.status === 'covered' ? `<span class="ok">✓ ${esc(n ? T.covered(n) : T.coveredOn(m.coveredBy || ''))}</span>` : `<span>${esc(T.queued)}</span>`;
        return `<li data-id="${esc(m.id)}"><div class="t">${esc(text)}</div><div class="m"><span>${esc(T.kinds[m.kind] || '')}</span>${status}${m.by === S.email && m.status === 'open' ? `<button type="button" class="rm">${esc(T.remove)}</button>` : ''}</div></li>`;
      }).join('')}</ul>` : ''}
    </section>
    <section class="block"><span class="label">${esc(T.prefs)}</span>
      <div class="field"><label>${esc(T.language)}</label><div class="stage-seg" role="group">
        <button type="button" data-l="en" aria-pressed="${lang === 'en'}">English</button><button type="button" data-l="ko" aria-pressed="${lang === 'ko'}">한국어</button></div></div>
      <div class="field"><label>${esc(T.theme)}</label><div class="stage-seg" role="group">${['auto', 'light', 'dark'].map((k) => `<button type="button" data-theme="${k}" aria-pressed="${theme === k}">${esc(T.themes[k])}</button>`).join('')}</div></div>
    </section>
    <section class="block"><span class="label">${esc(T.how)}</span><div class="prose-small" style="margin-top:10px">${T.howBody.map((p) => `<p>${esc(p)}</p>`).join('')}<p class="muted">${esc(T.disclaimer)}</p></div></section>
    <section class="block"><div class="row-actions"><button class="btn secondary" type="button" id="export">${esc(T.export)}</button><button class="btn secondary" type="button" id="signout">${esc(t().signOut)}</button></div>
      <p class="help mono" style="margin-top:12px">${esc(T.signedInAs(S.email))}</p></section>`;

  main.querySelectorAll('[data-stage]').forEach((b) => b.addEventListener('click', () => { S.stageDraft = { ...draft, stage: b.dataset.stage }; viewUs(); }));
  for (const id of ['lmp', 'due', 'birth']) {
    const el = $(`#${id}`);
    if (el) el.addEventListener('change', () => { S.stageDraft = { ...draft, [id]: el.value }; viewUs(); });
  }
  $('#save-stage').addEventListener('click', async () => {
    try {
      await Data.saveState(S.email, S.stageDraft || draft);
      S.stageDraft = null;
      toast(T.saved);
    } catch (e) { showError(e); }
  });
  main.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => { S.inboxDraft = $('#inbox-text').value; S.inboxKind = b.dataset.kind; viewUs(); }));
  $('#inbox-text').addEventListener('input', (e) => { S.inboxDraft = e.target.value; });
  $('#send-inbox').addEventListener('click', async () => {
    const text = $('#inbox-text').value.trim();
    if (!text) return;
    try {
      await Data.addInbox(S.email, { kind, text, lang: /[가-힣]/.test(text) ? 'ko' : 'en' });
      S.inboxDraft = '';
      toast('✓');
    } catch (e) { showError(e); }
  });
  main.querySelectorAll('.inbox-list .rm').forEach((b) => b.addEventListener('click', () => Data.deleteInbox(b.closest('li').dataset.id).catch(showError)));
  main.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.l); rerender(); }));
  main.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => { store.set('ph.theme', b.dataset.theme); applyTheme(); viewUs(); }));
  $('#export').addEventListener('click', async () => {
    const data = await Data.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `parenthood-${todayPT()}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  });
  $('#signout').addEventListener('click', () => Data.signOut());
}

// ---------- gates ----------
const G_LOGO = '<svg class="gsvg" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>';

function viewSignIn(errorMsg = '') {
  const en = STR.en;
  const ko = STR.ko;
  main.innerHTML = `<div class="gate">
    <h1>${esc(en.signInTitle)} <span class="muted ko">· ${esc(ko.signInTitle)}</span></h1>
    <p>${esc(en.signInBody)}</p><p class="ko">${esc(ko.signInBody)}</p>
    <button class="btn" type="button" id="signin">${G_LOGO}<span>${esc(en.signIn)} · ${esc(ko.signIn)}</span></button>
    ${errorMsg ? `<div class="error-box">${esc(errorMsg)}</div>` : ''}
    <p class="fine">${esc(en.privateNote)}<br><span class="ko">${esc(ko.privateNote)}</span></p></div>`;
  $('#signin').addEventListener('click', async (ev) => {
    const b = ev.currentTarget;
    b.disabled = true;
    b.querySelector('span').textContent = `${en.signingIn}`;
    try { await Data.signIn(); } catch (e) { viewSignIn(e.message || String(e)); return; }
    b.disabled = false;
    b.querySelector('span').textContent = `${en.signIn} · ${ko.signIn}`;
  });
}

function viewNoAccess(email) {
  const en = STR.en;
  const ko = STR.ko;
  main.innerHTML = `<div class="gate"><h1>${esc(en.noAccessTitle)} <span class="muted ko">· ${esc(ko.noAccessTitle)}</span></h1>
    <p>${esc(en.noAccess(email))}</p><p class="ko">${esc(ko.noAccess(email))}</p>
    <button class="btn secondary" type="button" id="other">${esc(en.tryOther)} · ${esc(ko.tryOther)}</button></div>`;
  $('#other').addEventListener('click', async () => { await Data.signOut(); });
}

function viewSetup() {
  main.innerHTML = `<div class="gate"><h1>${esc(STR.en.setupTitle)} <span class="muted ko">· ${esc(STR.ko.setupTitle)}</span></h1>
    <p>${esc(STR.en.setupBody)}</p><p class="ko">${esc(STR.ko.setupBody)}</p></div>`;
}

function showError(e) {
  console.error(e);
  toast(`${t().loadError} (${e.code || e.message || e})`);
}

// ---------- routing ----------
/** Re-render for live data updates, but never while someone is typing in a field on the page. */
function softRerender() {
  const a = document.activeElement;
  if (a && main.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return;
  rerender();
}

function rerender() {
  const [page, arg] = S.route.split('/');
  if (!S.user) return;
  S.cleanup?.();
  markNav();
  renderContents();
  if (page === 'd' && arg) {
    if (S.overview?.[0]?.date === arg) return viewFeed();
    return viewDay(arg);
  }
  if (page === 'journey') return viewJourney(arg || 'timeline');
  if (page === 'doctor') return viewDoctor();
  if (page === 'us') return viewUs();
  return viewFeed();
}

function onRoute() {
  const next = location.hash.replace(/^#\/?/, '');
  const pageChanged = next.split('/')[0] !== S.route.split('/')[0] || next.startsWith('d/');
  S.route = next;
  if (pageChanged) window.scrollTo(0, 0);
  rerender();
}

// ---------- boot ----------
async function start() {
  applyTheme();
  const saved = store.get('ph.lang');
  setLang(saved || (navigator.language?.startsWith('ko') ? 'ko' : 'en'), { persist: false });
  document.querySelectorAll('.lang-toggle button').forEach((b) => b.addEventListener('click', () => { setLang(b.dataset.lang); rerender(); }));
  S.route = location.hash.replace(/^#\/?/, '');
  window.addEventListener('hashchange', onRoute);

  const config = EMULATOR
    ? { apiKey: 'demo-key', authDomain: 'demo-parenthood.firebaseapp.com', projectId: 'demo-parenthood', appId: '1:000000000000:web:demo' }
    : firebaseConfig;
  if (!config) { viewSetup(); return; }
  Data.init(config, { emulator: EMULATOR });
  fetch('pipeline/curriculum.json').then((r) => r.json()).then((c) => {
    S.curriculumTotals = {};
    for (const u of c.units) S.curriculumTotals[u.track] = (S.curriculumTotals[u.track] || 0) + 1;
    if (S.route.startsWith('journey')) rerender();
  }).catch(() => {});

  const pendingError = Data.redirectError();
  Data.onUser(async (user) => {
    S.unsubs.forEach((u) => u());
    S.unsubs = [];
    S.digests.clear();
    S.overview = null;
    if (!user) {
      S.user = null;
      document.documentElement.dataset.auth = 'out';
      $('#contents').hidden = true;
      viewSignIn(await pendingError);
      return;
    }
    const email = (user.email || '').toLowerCase();
    main.innerHTML = skeleton();
    let member = null;
    try {
      member = await Data.getMember(email);
    } catch (e) {
      if (e.code === 'permission-denied') { S.user = null; document.documentElement.dataset.auth = 'out'; viewNoAccess(email); return; }
      main.innerHTML = `<div class="error-box">${esc(t().loadError)} (${esc(e.code || e.message)})</div>`;
      return;
    }
    if (!member) { S.user = null; document.documentElement.dataset.auth = 'out'; viewNoAccess(email); return; }
    S.user = user;
    S.email = email;
    document.documentElement.dataset.auth = 'in';
    if (!store.get('ph.lang')) setLang(member.lang || 'en', { persist: false });
    S.unsubs.push(
      Data.watchOverview((days) => {
        const first = S.overview === null;
        const newest = days[0]?.date !== S.overview?.[0]?.date;
        S.overview = days;
        renderContents();
        const page = S.route.split('/')[0];
        if (first || page === 'journey' || (page === '' && newest)) rerender();
      }, (e) => showError(e)),
      Data.watchMembers((m) => { S.members = m; refreshReceipts(); }),
      Data.watchState((s) => { S.state = s; if (S.route === 'us' && !S.stageDraft) softRerender(); }),
      Data.watchQuestions((q) => { S.questions = q; if (S.route === 'doctor') softRerender(); }),
      Data.watchInbox((x) => { S.inbox = x; if (S.route === 'us') softRerender(); }),
      Data.watchFeedback((f) => { S.feedback = f; }),
    );
    rerender();
  });
}

start().catch((e) => {
  console.error(e);
  main.innerHTML = `<div class="error-box">${esc(STR.en.loadError)}</div>`;
});
