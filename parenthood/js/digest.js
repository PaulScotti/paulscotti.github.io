// Renders one digest (in one language) as an <article>. All text passes through the safe markdown-lite renderer.
import { md, esc, inlineOnly, plain } from './md.js';
import { renderFigure } from './figures.js';
import { STR, TRACKS } from './i18n.js';

export function renderDigest(d, { lang, isLatest, questions, onAddQuestion, replyTo, state }) {
  const t = STR[lang];
  const e = d[lang] || d.en;
  const scope = `d${d.date}`;
  const ctx = { scope };
  const figs = new Map((d.figures || []).map((f) => [f.id, f]));
  const track = TRACKS[d.track];
  const art = document.createElement('article');
  art.className = 'digest';
  art.id = `d-${d.date}`;
  art.dataset.date = d.date;
  art.lang = lang;

  const evidenceBadge = (ev) => {
    if (!ev) return '';
    const cls = ev === 'emerging' ? 'blue' : ev === 'tradition' ? 'peach' : ev === 'expert' ? 'plain' : '';
    return `<span class="badge ${cls}">${esc(t.evidence[ev] || ev)}</span>`;
  };

  let html = `
    <div class="kicker">
      <span class="${isLatest ? 'today' : ''}">${esc(t.day(d.day).toUpperCase())}</span><span>·</span>
      <span>${esc(t.fmtDate(d.date))}</span><span>·</span><span>${esc(t.minRead(d.minutes || 3))}</span>
      ${track ? `<span class="badge plain"><span class="dot" style="background:${track.color}"></span>${esc(track[lang])}</span>` : ''}
    </div>
    <h1 class="title">${inlineOnly(e.title)}</h1>
    <p class="dek">${inlineOnly(e.dek, ctx)}</p>
    <div class="gist"><div class="label">${esc(t.gist)}</div><p>${inlineOnly(e.takeaway, ctx)}</p></div>`;

  html += (e.sections || []).map((s, i) => `
    <section class="sec" data-i="${i}">
      <h2>${inlineOnly(s.heading)} ${evidenceBadge(s.evidence)}</h2>
      <div class="prose">${md(s.body, ctx)}</div>
      ${s.figure && figs.has(s.figure) ? `<div class="fig-slot" data-fig="${esc(s.figure)}"></div>` : ''}
    </section>`).join('');

  if (e.nugget?.text) {
    html += `<blockquote class="nugget"><p>${inlineOnly(e.nugget.text, ctx)}${Number.isInteger(e.nugget.source) ? `<a class="cite" href="#" data-cite="${e.nugget.source}" data-scope="${scope}">${e.nugget.source}</a>` : ''}</p><div class="who">— ${esc(e.nugget.who || '')}</div></blockquote>`;
  }

  html += '<div class="cards">';
  if (e.forUs) html += `<div class="card for-us"><div class="label">${esc(t.forUs)}</div><div class="prose">${md(e.forUs, ctx)}</div></div>`;
  if (e.tryThis) html += `<div class="card try"><div class="label">${esc(t.tryThis)}</div><div class="prose">${md(e.tryThis, ctx)}</div></div>`;
  if (e.talk) html += `<div class="card talk"><div class="label">${esc(t.talk)}</div><div class="prose">${md(e.talk, ctx)}</div></div>`;
  if (e.askDoctor?.length) {
    html += `<div class="card ask"><div class="label">${esc(t.askDoctor)}</div><ul>${e.askDoctor.map((q, i) => {
      const onList = questions.some((x) => x.sourceDate === d.date && (x.text?.en === plain(d.en?.askDoctor?.[i] || '') || x.text?.ko === plain(d.ko?.askDoctor?.[i] || '')));
      return `<li><span>${inlineOnly(q, ctx)}</span><button type="button" class="btn-mini" data-ask="${i}" aria-pressed="${onList}">${esc(onList ? t.added : t.addToList)}</button></li>`;
    }).join('')}</ul></div>`;
  }
  if (d.glossary?.length) {
    const other = lang === 'en' ? 'ko' : 'en';
    html += `<div class="card words"><div class="label">${esc(t.words)}</div><dl>${d.glossary.map((g) => `
      <div><dt>${esc(g[lang])}<span class="sep">↔</span><span class="alt">${esc(g[other])}</span></dt>
      <dd>${esc(lang === 'en' ? g.noteEn || '' : g.noteKo || '')}</dd></div>`).join('')}</dl></div>`;
  }
  html += '</div>';

  if (d.buildsOn?.length) {
    html += `<div class="meta-line"><span class="label">${esc(t.buildsOn)}</span>${d.buildsOn.map((b) => `<a href="#/d/${esc(b)}">${esc(t.fmtDate(b, { weekday: false }))} ↗</a>`).join('')}</div>`;
  }

  if (d.sources?.length) {
    html += `<details class="sources"><summary class="label">${esc(t.sources(d.sources.length))}</summary><ol class="src">${d.sources.map((s, i) => `
      <li id="${scope}-src-${i + 1}"><a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.title)}</a>
      <span class="m">${esc([s.type, s.publisher, s.year].filter(Boolean).join(' · '))}</span></li>`).join('')}</ol></details>`;
  }

  if (replyTo) {
    const subject = `${t.day(d.day)} · ${plain(e.title)}`;
    html += `<div class="dfoot"><span class="q">${esc(t.replyQ)}</span>
      <a class="btn-mini" href="mailto:${esc(replyTo)}?subject=${encodeURIComponent(subject)}">${esc(t.reply)}</a></div>`;
  }
  html += '<div class="end-mark"></div>';

  art.innerHTML = html;

  // figures after the section bodies
  art.querySelectorAll('.fig-slot').forEach((slot) => {
    slot.replaceWith(renderFigure(figs.get(slot.dataset.fig), lang, { ...ctx, state, fmtDate: (x, o) => t.fmtDate(x, o) }));
  });

  // interactions
  art.addEventListener('click', (ev) => {
    const cite = ev.target.closest('a.cite');
    if (cite) {
      ev.preventDefault();
      const det = art.querySelector('details.sources');
      if (det) det.open = true;
      const li = art.querySelector(`#${cite.dataset.scope || scope}-src-${cite.dataset.cite}`);
      if (li) {
        li.scrollIntoView({ behavior: 'smooth', block: 'center' });
        li.classList.add('flash');
        setTimeout(() => li.classList.remove('flash'), 1400);
      }
      return;
    }
    const ask = ev.target.closest('button[data-ask]');
    if (ask && ask.getAttribute('aria-pressed') !== 'true') {
      const i = Number(ask.dataset.ask);
      ask.setAttribute('aria-pressed', 'true');
      ask.textContent = t.added;
      onAddQuestion({ en: plain(d.en?.askDoctor?.[i] || ''), ko: plain(d.ko?.askDoctor?.[i] || '') }, d.date);
      return;
    }
  });
  return art;
}
