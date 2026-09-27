// Validation for a digest. Returns { errors, warnings, stats } - the generator must reach zero errors.
import { isDateStr } from './dates.mjs';
import { plain, countWords, countHangul, hangulRatio, buildSimilarityIndex } from './text.mjs';

export const LIMITS = {
  enWords: { min: 420, max: 680, hardMin: 360, hardMax: 760 },
  koHangul: { min: 900, max: 2400, hardMin: 650, hardMax: 3000 },
  takeawayWords: { warn: 32, max: 36 },
  takeawayKoChars: 130,
  titleEn: { warn: 70, max: 80 },
  titleKo: 45,
  sections: [2, 4],
  sources: [3, 8],
  glossary: [2, 4],
  nuggets: [4, 8],
  figures: 2,
  svgBytes: 12 * 1024,
  repeatError: 0.58,
  repeatWarn: 0.27,
};

const TRACKS = ['conceive', 'body', 'pregnancy', 'birth', 'baby', 'parenting', 'us', 'life', 'roots'];
const EVIDENCE = ['strong', 'moderate', 'emerging', 'expert', 'tradition'];
const SOURCE_TYPES = ['guideline', 'review', 'study', 'org', 'expert', 'book', 'community', 'news'];
const WIDGETS = ['fertile-window', 'due-date'];
const FIGURE_TYPES = ['widget', 'bars', 'line', 'stats', 'compare', 'quiz', 'steps', 'table', 'image', 'svg'];
const IMAGE_HOSTS = ['upload.wikimedia.org'];

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const nonEmpty = (s) => typeof s === 'string' && s.trim().length > 0;

export function validateDigest(d, { ledger = [], curriculum = null } = {}) {
  const errors = [];
  const warnings = [];
  const err = (p, m) => errors.push(`${p}: ${m}`);
  const warn = (p, m) => warnings.push(`${p}: ${m}`);
  const stats = {};

  if (!isObj(d)) return { errors: ['digest: not a JSON object'], warnings, stats };
  if (d.schema !== 1) err('schema', 'must be 1');
  if (!isDateStr(d.date)) err('date', 'must be YYYY-MM-DD');
  if (typeof d.unit !== 'string' || !/^[a-z]+(\.[a-z0-9-]+)+$/.test(d.unit)) err('unit', 'must look like "track.slug"');
  if (!TRACKS.includes(d.track)) err('track', `must be one of ${TRACKS.join(', ')}`);
  if (typeof d.unit === 'string' && TRACKS.includes(d.track) && d.unit.split('.')[0] !== d.track) {
    warn('unit', `unit prefix "${d.unit.split('.')[0]}" differs from track "${d.track}"`);
  }
  if (!['core', 'deeper'].includes(d.depth)) err('depth', 'must be "core" or "deeper"');
  for (const k of ['buildsOn', 'addresses', 'figures', 'sources', 'glossary', 'nuggets', 'keywords']) {
    if (!Array.isArray(d[k])) err(k, 'must be an array');
  }
  if (errors.length) return { errors, warnings, stats };

  // ---- ledger-aware checks ------------------------------------------------------------------------------
  const prior = ledger.filter((e) => e.date < d.date);
  const priorDates = new Set(prior.map((e) => e.date));
  for (const b of d.buildsOn) {
    if (!priorDates.has(b)) err('buildsOn', `${b} is not an earlier digest`);
  }
  if (d.depth === 'deeper' && d.buildsOn.length === 0) err('buildsOn', 'a "deeper" digest must list the day(s) it builds on');
  const sameUnit = prior.find((e) => e.unit === d.unit);
  if (sameUnit) {
    err('unit', `"${d.unit}" was already covered on Day ${sameUnit.day} (${sameUnit.date}). Pick another unit, or ` +
      'make a follow-up with a new id (e.g. unit.2), depth "deeper", and buildsOn.');
  }
  if (curriculum && !curriculum.units.some((u) => u.id === d.unit)) {
    const proposed = (d.unitProposals || []).some((u) => u.id === d.unit);
    const isFollowUp = /\.\d+$/.test(d.unit) && curriculum.units.some((u) => u.id === d.unit.replace(/\.\d+$/, ''));
    if (!proposed && !isFollowUp) warn('unit', `"${d.unit}" is not in the curriculum; add it to unitProposals`);
  }

  // ---- sources ------------------------------------------------------------------------------------------
  const nSources = d.sources.length;
  if (nSources < LIMITS.sources[0] || nSources > LIMITS.sources[1]) err('sources', `need ${LIMITS.sources.join('-')} sources (have ${nSources})`);
  const urls = new Set();
  d.sources.forEach((s, i) => {
    const p = `sources[${i}]`;
    if (!isObj(s)) return err(p, 'must be an object');
    if (!nonEmpty(s.title)) err(p, 'title missing');
    if (!nonEmpty(s.publisher)) err(p, 'publisher missing');
    if (!Number.isInteger(s.year) || s.year < 1900 || s.year > 2100) err(p, 'year must be an integer');
    if (!nonEmpty(s.url) || !/^https:\/\/[^\s]+$/.test(s.url)) err(p, 'url must be https');
    else if (urls.has(s.url)) err(p, 'duplicate url');
    else urls.add(s.url);
    if (!SOURCE_TYPES.includes(s.type)) err(p, `type must be one of ${SOURCE_TYPES.join(', ')}`);
  });
  const hasAuthoritative = d.sources.some((s) => ['guideline', 'review', 'study', 'org'].includes(s.type));
  if (!hasAuthoritative) warn('sources', 'no guideline/review/study/org source');

  // ---- figures ------------------------------------------------------------------------------------------
  const figIds = new Set();
  if (d.figures.length > LIMITS.figures) err('figures', `at most ${LIMITS.figures} figures`);
  d.figures.forEach((f, i) => validateFigure(f, `figures[${i}]`, { err, warn, nSources, figIds }));

  // ---- editions -----------------------------------------------------------------------------------------
  const citeSets = {};
  for (const lang of ['en', 'ko']) {
    const e = d[lang];
    const p = lang;
    if (!isObj(e)) { err(p, 'edition missing'); continue; }
    for (const k of ['title', 'dek', 'takeaway', 'forUs', 'talk']) if (!nonEmpty(e[k])) err(`${p}.${k}`, 'required');
    if (e.tryThis !== undefined && !nonEmpty(e.tryThis)) err(`${p}.tryThis`, 'empty string; omit it instead');
    if (!Array.isArray(e.sections)) { err(`${p}.sections`, 'must be an array'); continue; }
    if (e.sections.length < LIMITS.sections[0] || e.sections.length > LIMITS.sections[1]) {
      err(`${p}.sections`, `need ${LIMITS.sections.join('-')} sections`);
    }
    e.sections.forEach((s, i) => {
      const sp = `${p}.sections[${i}]`;
      if (!isObj(s)) return err(sp, 'must be an object');
      if (!nonEmpty(s.heading)) err(sp, 'heading required');
      if (!nonEmpty(s.body)) err(sp, 'body required');
      if (s.evidence !== undefined && !EVIDENCE.includes(s.evidence)) err(sp, `evidence must be one of ${EVIDENCE.join(', ')}`);
      if (s.figure !== undefined && !figIds.has(s.figure)) err(sp, `figure "${s.figure}" not found`);
    });
    if (!isObj(e.nugget) || !nonEmpty(e.nugget.text) || !nonEmpty(e.nugget.who)) err(`${p}.nugget`, 'needs text and who');
    else if (!Number.isInteger(e.nugget.source) || e.nugget.source < 1 || e.nugget.source > nSources) err(`${p}.nugget.source`, 'must be a source number');
    if (e.askDoctor !== undefined && (!Array.isArray(e.askDoctor) || e.askDoctor.length > 3 || !e.askDoctor.every(nonEmpty))) {
      err(`${p}.askDoctor`, 'must be an array of 0-3 non-empty strings');
    }

    // markup safety + citations
    const texts = editionTexts(e);
    const cites = new Set();
    for (const [where, t] of texts) {
      if (/<\s*\/?\s*[a-zA-Z!]/.test(t)) err(`${p}.${where}`, 'HTML is not allowed (use markdown-lite)');
      for (const m of t.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
        if (!/^https:\/\//.test(m[2])) err(`${p}.${where}`, `link must be https: ${m[2]}`);
      }
      for (const m of t.matchAll(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g)) {
        for (const n of m[1].split(',').map((x) => Number(x.trim()))) {
          if (n < 1 || n > nSources) err(`${p}.${where}`, `citation [${n}] has no source`);
          cites.add(n);
        }
      }
    }
    if (isObj(e.nugget) && Number.isInteger(e.nugget.source)) cites.add(e.nugget.source);
    citeSets[lang] = cites;
  }
  if (errors.length) return { errors, warnings, stats };

  const en = d.en;
  const ko = d.ko;
  if (en.sections.length !== ko.sections.length) err('ko.sections', 'must have the same number of sections as en');
  en.sections.forEach((s, i) => {
    const k = ko.sections[i];
    if (!k) return;
    if ((s.figure || null) !== (k.figure || null)) err(`ko.sections[${i}]`, 'figure must match en');
    if ((s.evidence || null) !== (k.evidence || null)) warn(`ko.sections[${i}]`, 'evidence badge differs from en');
  });
  if ((en.askDoctor || []).length !== (ko.askDoctor || []).length) err('ko.askDoctor', 'must have as many items as en');
  if (!!en.tryThis !== !!ko.tryThis) err('ko.tryThis', 'present in one edition only');
  for (let n = 1; n <= nSources; n++) {
    if (!citeSets.en.has(n)) warn('sources', `source [${n}] is never cited in en`);
  }
  const missingKo = [...citeSets.en].filter((n) => !citeSets.ko.has(n));
  if (missingKo.length) warn('ko', `citations missing vs en: ${missingKo.join(', ')}`);

  // ---- lengths & style ----------------------------------------------------------------------------------
  const enReading = readingText(en);
  const koReading = readingText(ko);
  stats.enWords = countWords(enReading);
  stats.koHangul = countHangul(koReading);
  stats.koHangulRatio = Number(hangulRatio(koReading).toFixed(2));
  stats.minutes = Math.max(1, Math.round(stats.enWords / 220));
  const L = LIMITS;
  if (stats.enWords < L.enWords.hardMin || stats.enWords > L.enWords.hardMax) {
    err('en', `reading text is ${stats.enWords} words; aim for ${L.enWords.min}-${L.enWords.max}`);
  } else if (stats.enWords < L.enWords.min || stats.enWords > L.enWords.max) {
    warn('en', `reading text is ${stats.enWords} words; aim for ${L.enWords.min}-${L.enWords.max}`);
  }
  if (stats.koHangul < L.koHangul.hardMin || stats.koHangul > L.koHangul.hardMax) {
    err('ko', `reading text has ${stats.koHangul} Hangul syllables; expected ~${L.koHangul.min}-${L.koHangul.max}`);
  } else if (stats.koHangul < L.koHangul.min || stats.koHangul > L.koHangul.max) {
    warn('ko', `reading text has ${stats.koHangul} Hangul syllables; expected ~${L.koHangul.min}-${L.koHangul.max}`);
  }
  if (stats.koHangulRatio < 0.6) err('ko', `too little Korean (Hangul ratio ${stats.koHangulRatio})`);
  const politeEndings = (koReading.match(/니다[.!?]/g) || []).length;
  const yoEndings = (koReading.match(/[요죠][.!?]/g) || []).length;
  if (yoEndings > politeEndings) warn('ko', 'mostly 해요체 endings; the reader prefers 합니다체');

  const tw = countWords(en.takeaway);
  if (tw > L.takeawayWords.max) err('en.takeaway', `${tw} words; max ${L.takeawayWords.max}`);
  else if (tw > L.takeawayWords.warn) warn('en.takeaway', `${tw} words; aim for <= ${L.takeawayWords.warn}`);
  if (sentenceCount(plain(en.takeaway)) > 1) err('en.takeaway', 'must be ONE sentence');
  if (!/[.!?]["”’)]?$/.test(plain(en.takeaway))) warn('en.takeaway', 'should end with punctuation');
  if (plain(ko.takeaway).length > L.takeawayKoChars) err('ko.takeaway', `longer than ${L.takeawayKoChars} characters`);
  if (en.title.length > L.titleEn.max) err('en.title', `longer than ${L.titleEn.max} chars`);
  else if (en.title.length > L.titleEn.warn) warn('en.title', `longer than ${L.titleEn.warn} chars`);
  if (ko.title.length > L.titleKo) warn('ko.title', `longer than ${L.titleKo} chars`);
  if (en.dek.length > 240) warn('en.dek', 'longer than 240 chars');

  // ---- glossary, nuggets, keywords ----------------------------------------------------------------------
  if (d.glossary.length < L.glossary[0] || d.glossary.length > L.glossary[1] + 1) err('glossary', `need ${L.glossary.join('-')} items`);
  d.glossary.forEach((g, i) => {
    if (!isObj(g) || !nonEmpty(g.en) || !nonEmpty(g.ko)) err(`glossary[${i}]`, 'needs en and ko');
  });
  if (d.nuggets.length < L.nuggets[0] - 1 || d.nuggets.length > L.nuggets[1] + 2) err('nuggets', `need ${L.nuggets.join('-')} facts`);
  if (!d.nuggets.every(nonEmpty)) err('nuggets', 'must be non-empty strings');
  if (!d.keywords.every(nonEmpty)) err('keywords', 'must be non-empty strings');

  // ---- no-repeat check against everything already taught -----------------------------------------------
  const corpus = [];
  for (const e of prior) {
    for (const n of e.nuggets || []) corpus.push({ text: n, day: e.day, date: e.date });
    if (e.takeaway) corpus.push({ text: e.takeaway, day: e.day, date: e.date, isTakeaway: true });
  }
  if (corpus.length) {
    const best = buildSimilarityIndex(corpus, d.nuggets);
    const buildsOn = new Set(d.buildsOn);
    const check = (text, where) => {
      const r = best(text);
      stats.maxRepeat = Math.max(stats.maxRepeat || 0, Number(r.score.toFixed(2)));
      if (!r.match) return;
      const msg = `possible repeat of Day ${r.match.day} (${r.match.date}) [similarity ${r.score.toFixed(2)}]: "${r.match.text}"`;
      if (r.score >= L.repeatError && !buildsOn.has(r.match.date)) err(where, msg);
      else if (r.score >= L.repeatWarn) warn(where, msg);
    };
    d.nuggets.forEach((n, i) => check(n, `nuggets[${i}]`));
    check(en.takeaway, 'en.takeaway');
    const titleIdx = buildSimilarityIndex(prior.map((e) => ({ text: e.title || '', day: e.day, date: e.date })));
    const t = titleIdx(en.title);
    if (t.match && t.score >= 0.7) warn('en.title', `very similar to Day ${t.match.day}: "${t.match.text}"`);
  }
  // within-day duplicates
  d.nuggets.forEach((n, i) => {
    const others = buildSimilarityIndex(d.nuggets.filter((_, j) => j !== i));
    if (others(n).score >= 0.8) warn(`nuggets[${i}]`, 'near-duplicate of another nugget today');
  });

  return { errors, warnings, stats };
}

function editionTexts(e) {
  const out = [['title', e.title], ['dek', e.dek], ['takeaway', e.takeaway], ['forUs', e.forUs], ['talk', e.talk]];
  if (e.tryThis) out.push(['tryThis', e.tryThis]);
  (e.sections || []).forEach((s, i) => { out.push([`sections[${i}].heading`, s.heading || '']); out.push([`sections[${i}].body`, s.body || '']); });
  if (isObj(e.nugget)) out.push(['nugget.text', e.nugget.text || '']);
  (e.askDoctor || []).forEach((q, i) => out.push([`askDoctor[${i}]`, q]));
  return out.filter(([, t]) => typeof t === 'string');
}

export function readingText(e) {
  const parts = [e.dek, ...(e.sections || []).flatMap((s) => [s.heading, s.body]), e.nugget?.text, e.forUs, e.tryThis, e.talk];
  return parts.filter(Boolean).map(plain).join('\n\n');
}

function sentenceCount(s) {
  const cleaned = s
    .replace(/\b(e\.g|i\.e|vs|etc|Dr|Mr|Mrs|Ms|approx|al|U\.S|No)\./g, '$1')
    .replace(/(\d)\.(\d)/g, '$1$2');
  return (cleaned.match(/[.!?](\s+|$)/g) || []).length || 1;
}

const isL = (x) => isObj(x) && nonEmpty(x.en) && nonEmpty(x.ko);

function validateFigure(f, p, { err, warn, nSources, figIds }) {
  if (!isObj(f)) return err(p, 'must be an object');
  if (!nonEmpty(f.id) || !/^[a-z0-9-]+$/i.test(f.id)) err(p, 'id must be alphanumeric/dashes');
  else if (figIds.has(f.id)) err(p, `duplicate id ${f.id}`);
  else figIds.add(f.id);
  if (!FIGURE_TYPES.includes(f.type)) return err(p, `type must be one of ${FIGURE_TYPES.join(', ')}`);
  const needL = (x, where) => { if (!isL(x)) err(`${p}.${where}`, 'needs {en, ko}'); };
  const optL = (x, where) => { if (x !== undefined) needL(x, where); };
  const src = () => {
    if (f.source !== undefined && (!Number.isInteger(f.source) || f.source < 1 || f.source > nSources)) err(`${p}.source`, 'must be a source number');
  };
  optL(f.caption, 'caption');
  optL(f.title, 'title');
  switch (f.type) {
    case 'widget':
      if (!WIDGETS.includes(f.widget)) err(`${p}.widget`, `must be one of ${WIDGETS.join(', ')}`);
      if (f.params !== undefined && !isObj(f.params)) err(`${p}.params`, 'must be an object');
      break;
    case 'bars':
      src();
      if (!Array.isArray(f.rows) || f.rows.length < 2 || f.rows.length > 12) err(`${p}.rows`, 'need 2-12 rows');
      else f.rows.forEach((r, i) => { needL(r.label, `rows[${i}].label`); if (typeof r.value !== 'number') err(`${p}.rows[${i}].value`, 'number required'); });
      if (f.source === undefined) warn(p, 'data figure without a source');
      break;
    case 'line':
      src();
      if (!isObj(f.x) || !isObj(f.y)) { err(p, 'x and y axes required'); break; }
      for (const ax of ['x', 'y']) {
        if (typeof f[ax].min !== 'number' || typeof f[ax].max !== 'number' || f[ax].max <= f[ax].min) err(`${p}.${ax}`, 'numeric min < max required');
        optL(f[ax].label, `${ax}.label`);
      }
      if (!Array.isArray(f.series) || f.series.length < 1 || f.series.length > 4) err(`${p}.series`, 'need 1-4 series');
      else f.series.forEach((s, i) => {
        needL(s.name, `series[${i}].name`);
        if (!Array.isArray(s.points) || s.points.length < 2 || !s.points.every((pt) => Array.isArray(pt) && pt.length === 2 && pt.every((n) => typeof n === 'number'))) {
          err(`${p}.series[${i}].points`, 'need >= 2 [x, y] number pairs');
        }
      });
      (f.bands || []).forEach((b, i) => { if (typeof b.from !== 'number' || typeof b.to !== 'number') err(`${p}.bands[${i}]`, 'from/to numbers'); optL(b.label, `bands[${i}].label`); });
      if (f.source === undefined) warn(p, 'data figure without a source');
      break;
    case 'stats':
      if (!Array.isArray(f.items) || f.items.length < 2 || f.items.length > 4) err(`${p}.items`, 'need 2-4 items');
      else f.items.forEach((it, i) => { needL(it.value, `items[${i}].value`); needL(it.label, `items[${i}].label`); });
      break;
    case 'compare':
      if (!Array.isArray(f.columns) || f.columns.length !== 2) err(`${p}.columns`, 'need exactly 2 columns');
      else f.columns.forEach((c, i) => {
        needL(c.title, `columns[${i}].title`);
        if (!Array.isArray(c.items) || c.items.length < 1 || c.items.length > 6) err(`${p}.columns[${i}].items`, 'need 1-6 items');
        else c.items.forEach((it, j) => needL(it, `columns[${i}].items[${j}]`));
      });
      break;
    case 'quiz':
      needL(f.question, 'question');
      needL(f.explain, 'explain');
      if (!Array.isArray(f.options) || f.options.length < 2 || f.options.length > 5) err(`${p}.options`, 'need 2-5 options');
      else f.options.forEach((o, i) => needL(o, `options[${i}]`));
      if (!Number.isInteger(f.answer) || f.answer < 0 || f.answer >= (f.options || []).length) err(`${p}.answer`, '0-based option index');
      break;
    case 'steps':
      if (!Array.isArray(f.items) || f.items.length < 2 || f.items.length > 8) err(`${p}.items`, 'need 2-8 steps');
      else f.items.forEach((it, i) => { needL(it.label, `items[${i}].label`); needL(it.text, `items[${i}].text`); });
      break;
    case 'table':
      src();
      if (!Array.isArray(f.columns) || f.columns.length < 2 || f.columns.length > 5) { err(`${p}.columns`, 'need 2-5 columns'); break; }
      f.columns.forEach((c, i) => needL(c, `columns[${i}]`));
      if (!Array.isArray(f.rows) || f.rows.length < 1 || f.rows.length > 10) err(`${p}.rows`, 'need 1-10 rows');
      else f.rows.forEach((r, i) => {
        if (!Array.isArray(r) || r.length !== f.columns.length) err(`${p}.rows[${i}]`, 'row length must match columns');
        else r.forEach((c, j) => needL(c, `rows[${i}][${j}]`));
      });
      if (f.heat !== undefined && !Array.isArray(f.heat)) err(`${p}.heat`, 'must be an array of rows');
      break;
    case 'image': {
      needL(f.alt, 'alt');
      let host = '';
      try { host = new URL(f.src).host; } catch { /* handled below */ }
      if (!IMAGE_HOSTS.includes(host) || !/^https:/.test(f.src)) err(`${p}.src`, `must be https on ${IMAGE_HOSTS.join(', ')}`);
      if (!nonEmpty(f.credit)) err(`${p}.credit`, 'credit/license required');
      if (f.link !== undefined && !/^https:\/\//.test(f.link)) err(`${p}.link`, 'must be https');
      break;
    }
    case 'svg':
      needL(f.svg, 'svg');
      for (const lang of ['en', 'ko']) {
        const s = f.svg?.[lang] || '';
        if (Buffer.byteLength(s) > LIMITS.svgBytes) err(`${p}.svg.${lang}`, `larger than ${LIMITS.svgBytes} bytes`);
        if (!/^\s*<svg[\s>]/i.test(s)) err(`${p}.svg.${lang}`, 'must start with <svg');
        if (/<script|<foreignObject|<iframe|<object|<embed|javascript:|\son[a-z]+\s*=|(?:xlink:)?href\s*=\s*["']?\s*(?:https?:|\/\/|data:)|url\(\s*["']?(?:https?:|\/\/)/i.test(s)) {
          err(`${p}.svg.${lang}`, 'contains scripts, event handlers or external references');
        }
        if (!/viewBox=/.test(s)) warn(`${p}.svg.${lang}`, 'no viewBox (will not scale on phones)');
      }
      break;
    default:
      break;
  }
}
