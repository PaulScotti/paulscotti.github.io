// Korean-edition checks. Yoolim reads only the Korean, so it must say exactly what the English says, in formal
// polite Korean (합니다체). These deterministic checks back up the writer and the separate Korean review pass:
// sentence endings, numbers and citations per section against the English, and a short list of known mistranslations.
import { plain } from './text.mjs';

const isObj = (x) => x && typeof x === 'object' && !Array.isArray(x);
const HANGUL = /[가-힣]/;

/** Split Korean prose into sentences (keeps decimals together; bullets and line breaks end a sentence). */
export function koSentences(text) {
  return plain(text)
    .replace(/(\d)\.(\d)/g, '$1․$2')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((x) => x.replace(/․/g, '.').trim())
    .filter(Boolean);
}

// Nouns that end in 요 and could close a (bad) noun-ending sentence without being 해요체.
const NOUN_YO = /(필요|중요|주요|개요|수요|소요|강요|요요)$/;
const QUOTES = /[\s"'”’」』\]]+$/;

/**
 * Classify how a Korean sentence ends: 'formal' (합니다체: …니다 / …니까 / …시오 / …시다), 'haeyo' (…요),
 * 'plain' (해라체 …다), 'other' (e.g. a noun ending) or 'fragment' (no final punctuation, e.g. a label).
 */
export function koEnding(sentence) {
  let s = String(sentence).replace(/\s*\[\d+(?:\s*,\s*\d+)*\]/g, '').trim().replace(QUOTES, '');
  if (!/[.!?]$/.test(s)) return 'fragment'; // labels such as "불러오는 중…" are not sentences
  s = s.replace(/[.!?]+$/, '');
  // a closing quote or a trailing parenthetical ("…입니다(예: 12주).") does not change the ending
  for (let i = 0; i < 3; i++) s = s.replace(QUOTES, '').replace(/\s*\([^()]*\)$/, '');
  if (/(니다|니까|시오|시다)$/.test(s)) return 'formal';
  if (/[요죠]$/.test(s) && !NOUN_YO.test(s)) return 'haeyo';
  if (/다$/.test(s)) return 'plain';
  return 'other';
}

/** Sentences of Korean running text whose ending is not 합니다체. */
export function registerProblems(text) {
  const out = [];
  for (const s of koSentences(text)) {
    if (!HANGUL.test(s)) continue;
    const kind = koEnding(s);
    if (kind === 'haeyo' || kind === 'plain' || kind === 'other') out.push({ kind, sentence: s });
  }
  return out;
}

// ---- numbers ----------------------------------------------------------------------------------------------------
// A number followed by one of these is a US unit; the Korean edition converts it to metric, so it is not compared.
const US_UNIT = /^\s*(?:°\s?F\b|F\b|lbs?\b|pounds?\b|oz\b|ounces?\b|inch(?:es)?\b|in\.|feet\b|foot\b|ft\b|miles?\b|mi\b|mph\b|cups?\b|gallons?\b|quarts?\b|pints?\b|tablespoons?\b|tbsp\b|teaspoons?\b|tsp\b|yards?\b|yd\b|['′"″])/i;
const EN_SCALE = { thousand: 1e3, million: 1e6, billion: 1e9 };
const KO_SCALE = { 천: 1e3, 만: 1e4, 억: 1e8 };
const num = (s) => Number(String(s).replace(/,/g, ''));

/** Numbers in English text that the Korean must keep: anything >= 10, any decimal, any percentage. */
export function enNumbers(text) {
  const t = plain(text);
  const out = new Set();
  for (const m of t.matchAll(/(\d[\d,]*(?:\.\d+)?)(\s*(?:thousand|million|billion)\b)?/gi)) {
    const after = t.slice(m.index + m[0].length);
    if (US_UNIT.test(after)) continue;
    let v = num(m[1]);
    if (m[2]) v *= EN_SCALE[m[2].trim().toLowerCase()];
    const pct = /^\s*(?:%|percent)/i.test(after);
    if (v >= 10 || m[1].includes('.') || pct) out.add(v);
  }
  return out;
}

/** Every number written in Korean text, reading 만/억/천 (60만 → 600000; 1만 2,000 → 12000). */
export function koNumbers(text) {
  const t = plain(text);
  const out = new Set();
  for (const m of t.matchAll(/(\d[\d,]*(?:\.\d+)?)\s*([천만억])?(?:\s*(\d[\d,]*)(?![\d.]))?/g)) {
    const base = num(m[1]);
    out.add(base);
    if (m[2]) {
      const scaled = base * KO_SCALE[m[2]];
      out.add(scaled);
      if (m[3]) out.add(scaled + num(m[3]));
    }
    if (m[3]) out.add(num(m[3]));
  }
  return out;
}

export function missingNumbers(enText, koText) {
  const ko = koNumbers(koText);
  return [...enNumbers(enText)].filter((v) => !ko.has(v));
}

// ---- citations --------------------------------------------------------------------------------------------------
export function citations(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/\[(\d+(?:\s*,\s*\d+)*)\](?!\()/g)) {
    for (const n of m[1].split(',')) out.add(Number(n.trim()));
  }
  return out;
}

// ---- known mistranslations and translationese ---------------------------------------------------------------------
// `ko` must match the Korean for the rule to fire; `en` (optional) must match the English; `koMissing` fires when the
// English matches but the Korean lacks the standard term. Keep this list to unambiguous cases; the style guide and
// the review pass handle the rest.
export const TERM_RULES = [
  { level: 'error', ko: /\d\s*점대/, msg: 'lab values: write "수치 30대", not "30점대" (점 reads as test-score points)' },
  { level: 'error', ko: /프리\s?(?:내|나|네이)[털탈]/, msg: 'a prenatal vitamin is 산전 영양제, not a transliteration' },
  { level: 'error', en: /small[- ]for[- ](?:gestational[- ])?age|\bSGA\b/i, koMissing: /부당경량아/, msg: 'small-for-gestational-age is 부당경량아 (저체중아 means low birth weight, a different measure)' },
  { level: 'warn', ko: /등푸른\s?생선/, en: /\bsalmon\b|fatty fish|oily fish/i, msg: '등푸른생선 excludes salmon; for "fatty fish" write 기름진 생선(연어, 고등어 등)' },
  { level: 'warn', ko: /상한선/, en: /upper (?:intake )?limit/i, msg: 'the nutrient upper limit is 상한 섭취량' },
  { level: 'warn', ko: /긴 꼬리/, en: /long tail/i, msg: '"long tail" is an English idiom; say what it means' },
  { level: 'warn', ko: /로 끝나는/, msg: '"~로 끝나는" is usually a calque of "ending on" (write e.g. 배란일까지의 6일)' },
  { level: 'warn', ko: /그녀|그들[은이의을에]/, msg: '그녀/그들 read as translated; repeat the noun or drop it' },
  { level: 'warn', ko: /에 의해/, msg: '"~에 의해" passives read as translated; prefer an active sentence' },
  { level: 'warn', ko: /(?:^|[.!?]\s+|\n)그리고\s/, msg: 'a sentence that starts with 그리고 reads as translated' },
];

// ---- per-digest checks ------------------------------------------------------------------------------------------
/** Korean prose fields that must be 합니다체, as [path, koText] pairs. */
function koProse(d) {
  const out = [['ko.takeaway', d.ko.takeaway], ['ko.forUs', d.ko.forUs]];
  d.ko.sections.forEach((s, i) => out.push([`ko.sections[${i}].body`, s.body || '']));
  (d.figures || []).forEach((f) => {
    const p = `figures.${f.id}`;
    if (f.caption?.ko) out.push([`${p}.caption.ko`, f.caption.ko]);
    if (f.question?.ko) out.push([`${p}.question.ko`, f.question.ko]);
    if (f.explain?.ko) out.push([`${p}.explain.ko`, f.explain.ko]);
    (f.type === 'steps' ? f.items || [] : []).forEach((it, i) => { if (it?.text?.ko) out.push([`${p}.items[${i}].text.ko`, it.text.ko]); });
  });
  (d.glossary || []).forEach((g, i) => { if (g?.noteKo) out.push([`glossary[${i}].noteKo`, g.noteKo]); });
  if (typeof d.ask?.ko === 'string') out.push(['ask.ko', d.ask.ko]);
  return out;
}

/** Aligned English/Korean blocks for the number and citation checks, with how strict each one is. */
function alignedBlocks(d) {
  const out = [
    { where: 'ko.title', en: d.en.title, ko: d.ko.title, level: 'warn' },
    { where: 'ko.takeaway', en: d.en.takeaway, ko: d.ko.takeaway, level: 'error' },
    { where: 'ko.forUs', en: d.en.forUs, ko: d.ko.forUs, level: 'error' },
  ];
  d.en.sections.forEach((s, i) => {
    const k = d.ko.sections[i] || {};
    out.push({ where: `ko.sections[${i}]`, en: `${s.heading}\n${s.body}`, ko: `${k.heading || ''}\n${k.body || ''}`, level: 'error' });
  });
  (d.figures || []).forEach((f) => {
    if (f.caption?.en && f.caption?.ko) out.push({ where: `figures.${f.id}.caption.ko`, en: f.caption.en, ko: f.caption.ko, level: 'error' });
  });
  (d.glossary || []).forEach((g, i) => {
    if (g?.noteEn && g?.noteKo) out.push({ where: `glossary[${i}].noteKo`, en: g.noteEn, ko: g.noteKo, level: 'warn' });
  });
  if (typeof d.ask?.en === 'string' && typeof d.ask?.ko === 'string') out.push({ where: 'ask.ko', en: d.ask.en, ko: d.ask.ko, level: 'error' });
  return out;
}

/** All Korean checks for a digest whose en/ko editions are structurally valid (same number of sections). */
export function checkKorean(d, { err, warn }) {
  for (const [where, text] of koProse(d)) {
    for (const p of registerProblems(text)) {
      const excerpt = p.sentence.length > 60 ? `…${p.sentence.slice(-60)}` : p.sentence;
      if (p.kind === 'haeyo') err(where, `해요체 ending in "${excerpt}"; use 합니다체 (…습니다/…입니다)`);
      else if (p.kind === 'plain') err(where, `해라체 ending in "${excerpt}"; use 합니다체 (…습니다/…입니다)`);
      else warn(where, `sentence does not end in 합니다체: "${excerpt}"`);
    }
  }
  for (const b of alignedBlocks(d)) {
    const missing = missingNumbers(b.en, b.ko);
    if (missing.length) {
      (b.level === 'error' ? err : warn)(b.where, `numbers in the English are missing from the Korean: ${missing.join(', ')} (keep every number, unit and range)`);
    }
    const enC = citations(b.en);
    const koC = citations(b.ko);
    const lost = [...enC].filter((n) => !koC.has(n));
    const extra = [...koC].filter((n) => !enC.has(n));
    if (lost.length) err(b.where, `citations missing vs the English: [${lost.join('], [')}]`);
    if (extra.length) warn(b.where, `citations not in the English: [${extra.join('], [')}]`);
  }
  const enAll = [d.en.title, d.en.takeaway, d.en.forUs, ...d.en.sections.flatMap((s) => [s.heading, s.body]),
    ...(d.figures || []).map((f) => f.caption?.en || ''), ...(d.glossary || []).flatMap((g) => [g?.en || '', g?.noteEn || ''])].join('\n');
  const koAll = [d.ko.title, d.ko.takeaway, d.ko.forUs, ...d.ko.sections.flatMap((s) => [s.heading, s.body]),
    ...(d.figures || []).map((f) => f.caption?.ko || ''), ...(d.glossary || []).flatMap((g) => [g?.ko || '', g?.noteKo || ''])].join('\n');
  for (const r of TERM_RULES) {
    if (r.en && !r.en.test(enAll)) continue;
    const hit = r.koMissing ? !r.koMissing.test(koAll) : r.ko.test(koAll);
    if (hit) (r.level === 'error' ? err : warn)('ko', r.msg);
  }
}

// ---- merging the Korean review --------------------------------------------------------------------------------------
const isKoKey = (k) => k === 'ko' || /Ko$/.test(k);

/**
 * Take only the Korean fields (the `ko` edition, every `.ko` string and every `…Ko` field) from a reviewed copy;
 * everything else stays exactly as in the original. Section figure/evidence fields also stay as in the original.
 */
export function mergeKorean(original, reviewed) {
  const out = structuredClone(original);
  if (!isObj(reviewed)) return out;
  if (isObj(reviewed.ko)) {
    out.ko = structuredClone(reviewed.ko);
    if (Array.isArray(out.ko.sections)) {
      out.ko.sections.forEach((s, i) => {
        const o = original.ko?.sections?.[i];
        if (!isObj(s) || !o) return;
        for (const k of ['figure', 'evidence']) {
          if (o[k] === undefined) delete s[k];
          else s[k] = o[k];
        }
      });
    }
  }
  const walk = (o, r) => {
    if (Array.isArray(o)) {
      if (Array.isArray(r) && r.length === o.length) o.forEach((x, i) => walk(x, r[i]));
      return;
    }
    if (!isObj(o) || !isObj(r)) return;
    for (const k of Object.keys(o)) {
      if (isKoKey(k) && typeof o[k] === 'string') {
        if (typeof r[k] === 'string' && r[k].trim()) o[k] = r[k];
      } else {
        walk(o[k], r[k]);
      }
    }
  };
  walk(out.figures, reviewed.figures);
  walk(out.glossary, reviewed.glossary);
  walk(out.ask, reviewed.ask);
  return out;
}

/** Remove every Korean field, so two digests can be compared on everything else. */
export function withoutKorean(d) {
  const strip = (x) => {
    if (Array.isArray(x)) return x.map(strip);
    if (!isObj(x)) return x;
    const o = {};
    for (const [k, v] of Object.entries(x)) if (!isKoKey(k)) o[k] = strip(v);
    return o;
  };
  return strip(d);
}

/** How many Korean strings differ between two digests. */
export function countKoreanEdits(a, b) {
  const collect = (x, inKo = false, acc = []) => {
    if (typeof x === 'string') { if (inKo) acc.push(x); return acc; }
    if (Array.isArray(x)) { x.forEach((v) => collect(v, inKo, acc)); return acc; }
    if (isObj(x)) for (const [k, v] of Object.entries(x)) collect(v, inKo || isKoKey(k), acc);
    return acc;
  };
  const A = collect(a);
  const B = collect(b);
  let n = Math.abs(A.length - B.length);
  for (let i = 0; i < Math.min(A.length, B.length); i++) if (A[i] !== B[i]) n++;
  return n;
}
