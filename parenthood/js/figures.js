// Figure renderers: data charts, comparisons, quizzes, timelines, images, sanitized SVG, and interactive widgets.
import { esc, inlineOnly } from './md.js';

const L = (x, lang) => (x && typeof x === 'object' ? x[lang] ?? x.en ?? '' : x ?? '');
const fmtNum = (n) => (Number.isInteger(n) ? String(n) : String(Math.round(n * 10) / 10));
const COLORS = ['var(--green-bar)', 'var(--blue)', 'var(--peach-ink)', 'var(--rose)'];

export function renderFigure(f, lang, ctx = {}) {
  const el = document.createElement('figure');
  el.className = `fig fig-${f.type}`;
  el.dataset.fig = f.id;
  const title = f.title ? `<div class="fig-title">${esc(L(f.title, lang))}</div>` : '';
  const srcRef = Number.isInteger(f.source)
    ? ` <a class="cite srcref" href="#" data-cite="${f.source}" data-scope="${esc(ctx.scope || '')}">${f.source}</a>` : '';
  const cap = f.caption || srcRef ? `<figcaption class="fig-cap">${inlineOnly(L(f.caption, lang))}${srcRef}</figcaption>` : '';
  try {
    switch (f.type) {
      case 'bars': el.innerHTML = title + bars(f, lang) + cap; break;
      case 'line': el.innerHTML = title + '<div class="chart"></div>' + cap; mountResponsive(el.querySelector('.chart'), (w) => lineSVG(f, lang, w)); break;
      case 'stats': el.innerHTML = title + stats(f, lang) + cap; break;
      case 'compare': el.classList.add('compare-fig'); el.innerHTML = title + compare(f, lang) + cap; break;
      case 'quiz': el.innerHTML = title + quizShell(f, lang) + cap; wireQuiz(el, f, lang); break;
      case 'steps': el.innerHTML = title + steps(f, lang) + cap; break;
      case 'table': el.innerHTML = title + table(f, lang) + cap; break;
      case 'image': el.innerHTML = image(f, lang) + cap; break;
      case 'svg': el.classList.add('svg-fig'); el.innerHTML = title + '<div class="svg-host"></div>' + cap; mountSVG(el.querySelector('.svg-host'), L(f.svg, lang)); break;
      case 'widget': el.classList.add('widget'); el.innerHTML = title + '<div class="w"></div>' + cap; mountWidget(el.querySelector('.w'), f, lang, ctx); break;
      default: return document.createComment(`unknown figure ${f.type}`);
    }
  } catch (e) {
    console.warn('figure failed', f.id, e);
    return document.createComment(`figure ${f.id} failed`);
  }
  return el;
}

function bars(f, lang) {
  const unit = f.unit || '';
  const max = f.max ?? Math.max(...f.rows.map((r) => r.value)) * 1.08;
  const rows = f.rows.map((r) => {
    const pct = Math.max(0, Math.min(100, (r.value / max) * 100));
    return `<div class="row${r.highlight ? ' hl' : ''}"><span class="l">${esc(L(r.label, lang))}</span>` +
      `<span class="v">${esc(fmtNum(r.value))}${esc(unit)}</span>` +
      `<span class="track"><span class="fill" style="width:${pct.toFixed(1)}%"></span></span></div>`;
  }).join('');
  return `<div class="bars">${rows}<div class="axis"><span></span><span></span><span><i>0</i><i>${esc(fmtNum(max / 2))}${esc(unit)}</i><i>${esc(fmtNum(max))}${esc(unit)}</i></span></div></div>`;
}

function stats(f, lang) {
  return `<div class="stats">${f.items.map((it) => `<div class="it"><div class="v">${esc(L(it.value, lang))}</div><div class="l">${inlineOnly(L(it.label, lang))}</div></div>`).join('')}</div>`;
}

function compare(f, lang) {
  return `<div class="compare">${f.columns.map((c) => `<div class="col"><div class="label">${esc(L(c.title, lang))}</div><ul>${c.items.map((it) => `<li>${inlineOnly(L(it, lang))}</li>`).join('')}</ul></div>`).join('')}</div>`;
}

function steps(f, lang) {
  return `<div class="steps"><ol>${f.items.map((it) => `<li><span class="k">${esc(L(it.label, lang))}</span><span class="t">${inlineOnly(L(it.text, lang))}</span></li>`).join('')}</ol></div>`;
}

function table(f, lang) {
  const heat = f.heat || [];
  const head = `<tr>${f.columns.map((c) => `<th>${esc(L(c, lang))}</th>`).join('')}</tr>`;
  const body = f.rows.map((r, i) => `<tr>${r.map((c, j) => {
    const h = heat[i]?.[j];
    if (typeof h === 'number') {
      const bg = h > 0.66 ? 'var(--peach-3)' : h > 0.33 ? 'var(--peach-2)' : h > 0 ? 'var(--peach-1)' : 'transparent';
      return `<td class="heat" style="background:${bg}">${esc(L(c, lang))}</td>`;
    }
    return `<td>${inlineOnly(L(c, lang))}</td>`;
  }).join('')}</tr>`).join('');
  return `<div class="tbl-wrap"><table class="tbl"><thead>${head}</thead><tbody>${body}</tbody></table></div>`;
}

function image(f, lang) {
  let ok = false;
  try { ok = new URL(f.src).host === 'upload.wikimedia.org'; } catch { ok = false; }
  if (!ok) return '';
  const credit = f.link ? `<a href="${esc(f.link)}" target="_blank" rel="noopener noreferrer">${esc(f.credit || '')}</a>` : esc(f.credit || '');
  return `<img src="${esc(f.src)}" alt="${esc(L(f.alt, lang))}" loading="lazy" decoding="async" referrerpolicy="no-referrer"><div class="credit">${credit}</div>`;
}

function quizShell(f, lang) {
  const keys = 'ABCDE';
  return `<div class="quiz"><p class="q">${inlineOnly(L(f.question, lang))}</p><div class="opts">${f.options.map((o, i) =>
    `<button type="button" class="opt" data-i="${i}"><span class="k">${keys[i]}</span><span>${inlineOnly(L(o, lang))}</span></button>`).join('')}</div><div class="explain" hidden>${inlineOnly(L(f.explain, lang))}</div></div>`;
}

function wireQuiz(el, f) {
  el.querySelectorAll('button.opt').forEach((b) => b.addEventListener('click', () => {
    const i = Number(b.dataset.i);
    el.querySelectorAll('button.opt').forEach((x) => {
      const j = Number(x.dataset.i);
      x.classList.toggle('right', j === f.answer);
      x.classList.toggle('wrong', j === i && i !== f.answer);
      x.setAttribute('aria-pressed', String(j === i));
    });
    el.querySelector('.explain').hidden = false;
  }));
}

// ---------- responsive SVG line chart ----------
function mountResponsive(host, draw) {
  let last = 0;
  const render = () => {
    const w = Math.round(host.clientWidth || 320);
    if (Math.abs(w - last) < 4) return;
    last = w;
    host.innerHTML = draw(w);
  };
  requestAnimationFrame(render);
  if ('ResizeObserver' in window) new ResizeObserver(render).observe(host);
}

function niceTicks(min, max, n = 5) {
  const span = max - min;
  const step0 = span / n;
  const mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || step0;
  const out = [];
  for (let v = Math.ceil(min / step) * step; v <= max + 1e-9; v += step) out.push(Number(v.toFixed(6)));
  return out;
}

function lineSVG(f, lang, W) {
  const H = Math.max(200, Math.min(300, Math.round(W * 0.52)));
  const m = { l: 40, r: 12, t: 18, b: 38 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;
  const { x, y } = f;
  const sx = (v) => m.l + ((v - x.min) / (x.max - x.min)) * iw;
  const sy = (v) => m.t + ih - ((v - y.min) / (y.max - y.min)) * ih;
  const yt = niceTicks(y.min, y.max, 4);
  const xt = x.ticks || niceTicks(x.min, x.max, Math.max(3, Math.min(8, Math.floor(iw / 60))));
  const unit = y.unit || '';
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(L(f.title, lang) || 'chart')}" xmlns="http://www.w3.org/2000/svg">`;
  for (const b of f.bands || []) {
    const x0 = sx(Math.max(b.from, x.min));
    const x1 = sx(Math.min(b.to, x.max));
    s += `<rect x="${x0}" y="${m.t}" width="${Math.max(1, x1 - x0)}" height="${ih}" style="fill:var(--green-tint)"/>`;
    if (b.label) s += `<text x="${(x0 + x1) / 2}" y="${m.t + 12}" text-anchor="middle" font-size="10" style="fill:var(--green)">${esc(L(b.label, lang))}</text>`;
  }
  for (const v of yt) {
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${sy(v)}" y2="${sy(v)}" style="stroke:var(--line-soft)" stroke-width="1"/>`;
    s += `<text x="${m.l - 6}" y="${sy(v) + 3.5}" text-anchor="end" font-size="10">${esc(fmtNum(v))}${esc(unit)}</text>`;
  }
  s += `<line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}" style="stroke:var(--line)"/>`;
  for (const v of xt) {
    s += `<line x1="${sx(v)}" x2="${sx(v)}" y1="${m.t + ih}" y2="${m.t + ih + 4}" style="stroke:var(--line)"/>`;
    s += `<text x="${sx(v)}" y="${m.t + ih + 16}" text-anchor="middle" font-size="10">${esc(fmtNum(v))}</text>`;
  }
  if (x.label) s += `<text x="${m.l + iw / 2}" y="${H - 4}" text-anchor="middle" font-size="10.5">${esc(L(x.label, lang))}</text>`;
  if (y.label) s += `<text x="${m.l}" y="${10}" text-anchor="start" font-size="10.5">${esc(L(y.label, lang))}</text>`;
  f.series.forEach((ser, i) => {
    const c = COLORS[i % COLORS.length];
    const pts = ser.points.filter(([px]) => px >= x.min && px <= x.max);
    s += `<path d="${pts.map(([px, py], k) => `${k ? 'L' : 'M'}${sx(px).toFixed(1)},${sy(py).toFixed(1)}`).join('')}" fill="none" style="stroke:${c}" stroke-width="2" stroke-linejoin="round"/>`;
    for (const [px, py] of pts) s += `<circle cx="${sx(px).toFixed(1)}" cy="${sy(py).toFixed(1)}" r="3" style="fill:${c}"><title>${esc(fmtNum(px))}: ${esc(fmtNum(py))}${esc(unit)}</title></circle>`;
  });
  s += '</svg>';
  if (f.series.length > 1) {
    s += `<div class="legend">${f.series.map((ser, i) => `<span><i style="background:${COLORS[i % COLORS.length]}"></i>${esc(L(ser.name, lang))}</span>`).join('')}</div>`;
  }
  return s;
}

// ---------- sanitized SVG ----------
let purifyPromise;
function mountSVG(host, svg) {
  purifyPromise ||= import('https://cdn.jsdelivr.net/npm/dompurify@3.4.16/dist/purify.es.mjs').then((m) => m.default);
  purifyPromise.then((DOMPurify) => {
    host.innerHTML = DOMPurify.sanitize(String(svg || ''), {
      USE_PROFILES: { svg: true, svgFilters: true },
      FORBID_TAGS: ['foreignObject', 'image', 'script', 'style', 'use', 'a'],
      FORBID_ATTR: ['href', 'xlink:href'],
    });
    const el = host.querySelector('svg');
    if (el) { el.removeAttribute('width'); el.removeAttribute('height'); el.setAttribute('role', 'img'); }
  }).catch(() => { host.textContent = ''; });
}

// ---------- widgets ----------
function mountWidget(host, f, lang, ctx) {
  if (f.widget === 'fertile-window') return fertileWindow(host, f.params || {}, lang);
  if (f.widget === 'due-date') return dueDate(host, f.params || {}, lang, ctx);
  host.textContent = '';
  return undefined;
}

const FW = {
  en: {
    len: 'Cycle length', days: (n) => `${n} days`,
    legend: { period: 'Period (typical)', fertile: 'Fertile window', peak: 'Best days', ovu: 'Likely ovulation', lh: 'Start LH strips' },
    read: (c) => `With a <b>${c.L}-day</b> cycle, ovulation is most likely around <b>day ${c.O}</b>. The fertile window is <b>days ${c.f0}–${c.O}</b>, and the best odds are on <b>days ${c.O - 2}–${c.O - 1}</b> — the days <i>before</i> ovulation.`,
    range: (r) => `Across a ${r.min}–${r.max}-day range, fertile days can fall anywhere from <b>day ${r.a}</b> to <b>day ${r.b}</b>. The calendar alone can’t pin it down; LH strips and cervical mucus can.`,
    lh: (d, min) => `Start LH strips by <b>day ${d}</b> (set by your shortest cycle, ${min} days).`,
    day: 'Cycle day',
  },
  ko: {
    len: '주기 길이', days: (n) => `${n}일`,
    legend: { period: '생리 기간(보통)', fertile: '가임기', peak: '가장 좋은 날', ovu: '배란 예상일', lh: 'LH 테스트 시작' },
    read: (c) => `주기가 <b>${c.L}일</b>이면 배란은 <b>${c.O}일째</b> 무렵일 가능성이 가장 높습니다. 가임기는 <b>${c.f0}~${c.O}일째</b>이고, 확률이 가장 높은 날은 배란 <i>전</i>인 <b>${c.O - 2}~${c.O - 1}일째</b>입니다.`,
    range: (r) => `주기가 ${r.min}~${r.max}일로 달라지면 가임일은 <b>${r.a}일째</b>부터 <b>${r.b}일째</b> 사이 어디든 될 수 있습니다. 달력만으로는 알 수 없으며, LH 테스트와 자궁경부 점액으로 알 수 있습니다.`,
    lh: (d, min) => `LH 테스트는 <b>${d}일째</b>부터 시작하는 것이 좋습니다(가장 짧은 주기 ${min}일 기준).`,
    day: '주기 일차',
  },
};

function fertileWindow(host, p, lang) {
  const t = FW[lang] || FW.en;
  const min = p.cycleMin ?? 26;
  const max = p.cycleMax ?? 30;
  const luteal = p.lutealDays ?? 14;
  const start = p.cycleDefault ?? Math.round((min + max) / 2);
  const COLS = 36;
  const lhDay = Math.max(5, min - 17);
  host.innerHTML = `
    <div class="ctrl"><label>${esc(t.len)}</label>
      <input type="range" min="21" max="35" step="1" value="${start}" aria-label="${esc(t.len)}">
      <output>${esc(t.days(start))}</output></div>
    <div class="cycle" style="grid-template-columns:repeat(${COLS},1fr)"></div>
    <div class="cycle-axis" style="grid-template-columns:repeat(${COLS},1fr)"></div>
    <div class="range-bar"><span class="rb"></span></div>
    <div class="legend">
      <span><i style="background:var(--peach-2)"></i>${esc(t.legend.period)}</span>
      <span><i style="background:var(--green-soft)"></i>${esc(t.legend.fertile)}</span>
      <span><i style="background:var(--green-bar)"></i>${esc(t.legend.peak)}</span>
      <span><i style="background:var(--green-strong)"></i>${esc(t.legend.ovu)}</span>
      <span><i style="background:var(--track);box-shadow:inset 0 3px 0 var(--blue)"></i>${esc(t.legend.lh)}</span>
    </div>
    <div class="readout"></div>`;
  const input = host.querySelector('input');
  const out = host.querySelector('output');
  const strip = host.querySelector('.cycle');
  const axis = host.querySelector('.cycle-axis');
  const rb = host.querySelector('.rb');
  const readout = host.querySelector('.readout');
  axis.innerHTML = Array.from({ length: COLS }, (_, i) => `<span>${[1, 7, 14, 21, 28, 35].includes(i + 1) ? i + 1 : ''}</span>`).join('');
  const a = Math.max(1, min - luteal - 5);
  const b = max - luteal;
  rb.style.left = `${((a - 1) / COLS) * 100}%`;
  rb.style.width = `${((b - a + 1) / COLS) * 100}%`;
  const draw = () => {
    const Lc = Number(input.value);
    const O = Lc - luteal;
    const f0 = O - 5;
    out.textContent = t.days(Lc);
    strip.innerHTML = Array.from({ length: COLS }, (_, i) => {
      const d = i + 1;
      if (d > Lc) return '<span class="cell" style="background:transparent"></span>';
      let cls = 'cell';
      if (d <= 5) cls += ' period';
      if (d >= f0 && d <= O - 3) cls += ' fertile';
      if (d === O - 2 || d === O - 1) cls += ' peak';
      if (d === O) cls += ' ovu';
      if (d === lhDay) cls += ' lh';
      return `<span class="${cls}" title="${esc(t.day)} ${d}"></span>`;
    }).join('');
    readout.innerHTML = `${t.read({ L: Lc, O, f0 })}<br>${t.range({ min, max, a, b })}<br>${t.lh(lhDay, min)}`;
  };
  input.addEventListener('input', draw);
  draw();
}

const DD = {
  en: {
    lmp: 'First day of last period', due: 'Due date', now: 'Today',
    wk: (w, d) => `${w}w ${d}d`, wkShort: (w) => `${w}w`, tri: (n) => `Trimester ${n}`,
    empty: 'Enter a date to see the due date and what comes next.',
    items: [
      [6, 'First prenatal visit and dating ultrasound (6–10 wk)'],
      [10, 'Cell-free DNA screening (NIPT) available from 10 wk'],
      [11, 'Nuchal translucency scan window (11–14 wk)'],
      [12, 'Low-dose aspirin, if recommended, starts 12–16 wk'],
      [18, 'Anatomy ultrasound (18–22 wk)'],
      [24, 'Gestational diabetes screening (24–28 wk)'],
      [27, 'Tdap vaccine (27–36 wk)'],
      [32, 'Maternal RSV vaccine window (32–36 wk, Sept–Jan)'],
      [36, 'Group B strep swab (36–37 wk)'],
      [39, 'Full term (39 wk)'],
      [40, 'Estimated due date'],
    ],
  },
  ko: {
    lmp: '마지막 생리 시작일', due: '출산 예정일', now: '오늘',
    wk: (w, d) => `${w}주 ${d}일`, wkShort: (w) => `${w}주`, tri: (n) => `임신 ${n}분기`,
    empty: '날짜를 입력하면 예정일과 다가올 일정을 보여 드립니다.',
    items: [
      [6, '첫 산전 진료와 임신 주수 확인 초음파 (6~10주)'],
      [10, '10주부터 비침습적 산전검사(NIPT) 가능'],
      [11, '목덜미 투명대(NT) 초음파 (11~14주)'],
      [12, '저용량 아스피린 권고 시 12~16주에 시작'],
      [18, '정밀 초음파 (18~22주)'],
      [24, '임신성 당뇨병 선별검사 (24~28주)'],
      [27, 'Tdap(백일해) 백신 (27~36주)'],
      [32, '산모 RSV 백신 접종 시기 (32~36주, 9~1월)'],
      [36, 'B군 연쇄상구균(GBS) 검사 (36~37주)'],
      [39, '만삭 (39주)'],
      [40, '출산 예정일'],
    ],
  },
};

function dueDate(host, p, lang, ctx) {
  const t = DD[lang] || DD.en;
  const fmt = ctx.fmtDate || ((d) => d);
  const initial = ctx.state?.lmp || p.lmp || '';
  host.innerHTML = `<div class="ctrl"><label>${esc(t.lmp)}</label><input type="date" value="${esc(initial)}"></div><div class="readout"></div><ul class="milestones"></ul>`;
  const input = host.querySelector('input');
  const readout = host.querySelector('.readout');
  const list = host.querySelector('.milestones');
  const draw = () => {
    const lmp = input.value;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(lmp)) { readout.textContent = t.empty; list.innerHTML = ''; return; }
    const base = Date.parse(`${lmp}T12:00:00Z`);
    const due = new Date(base + 280 * 864e5).toISOString().slice(0, 10);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' });
    const days = Math.round((Date.parse(`${today}T12:00:00Z`) - base) / 864e5);
    const w = Math.floor(days / 7);
    const tri = w < 14 ? 1 : w < 28 ? 2 : 3;
    readout.innerHTML = days >= 0 && days <= 300
      ? `<b>${esc(t.due)}: ${esc(fmt(due))}</b> · ${esc(t.now)}: ${esc(t.wk(w, days % 7))} · ${esc(t.tri(tri))}`
      : `<b>${esc(t.due)}: ${esc(fmt(due))}</b>`;
    let nextMarked = false;
    list.innerHTML = t.items.map(([wk, label]) => {
      const date = new Date(base + wk * 7 * 864e5).toISOString().slice(0, 10);
      let cls = '';
      if (days >= 0 && wk * 7 < days) cls = 'past';
      else if (days >= 0 && !nextMarked) { cls = 'next'; nextMarked = true; }
      return `<li class="${cls}"><span class="w">${esc(t.wkShort(wk))} · ${esc(fmt(date, { weekday: false }))}</span><span>${esc(label)}</span></li>`;
    }).join('');
  };
  input.addEventListener('input', draw);
  draw();
}
