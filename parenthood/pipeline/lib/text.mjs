// Text utilities: markdown-lite → plain text, reading-length counts, and a TF-IDF similarity used by the
// no-repeat check (new "nuggets" vs. every fact already taught).

export function plain(md = '') {
  return String(md)
    .replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, '')          // citations [1], [2, 3]
    .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '$1') // links
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^\s*(?:-|\d+\.)\s+/gm, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function countWords(s = '') {
  return (plain(s).match(/[A-Za-z0-9À-ɏ][A-Za-z0-9À-ɏ'’.%-]*/g) || []).length;
}

export function countHangul(s = '') {
  return (String(s).match(/[가-힣]/g) || []).length;
}

/** Share of Hangul among letters (Hangul + Latin). */
export function hangulRatio(s = '') {
  const h = countHangul(s);
  const l = (String(s).match(/[A-Za-z]/g) || []).length;
  return h + l === 0 ? 0 : h / (h + l);
}

const STOP = new Set(`a about above after again against all also am an and any are as at be because been before
being below between both but by can could did do does doing down during each few for from further had has have
having he her here hers herself him himself his how i if in into is it its itself just me more most my myself no
nor not now of off on once only or other our ours ourselves out over own same she should so some such than that the
their theirs them themselves then there these they this those through to too under until up very was we were what
when where which while who whom why will with would you your yours yourself yourselves may might must per via vs
often usually typically generally about around roughly approximately one's it's don't doesn't can't`.split(/\s+/));

const NUMBER_WORDS = { one: '1', two: '2', three: '3', four: '4', five: '5', six: '6', seven: '7', eight: '8',
  nine: '9', ten: '10', twelve: '12', twenty: '20', hundred: '100', half: '50%', double: '2x', twice: '2x' };

// Collapse common synonyms so paraphrases land on the same tokens.
const SYNONYMS = {
  intercourse: 'sex', coitus: 'sex', conception: 'conceive', conceiving: 'conceive', conceived: 'conceive', conceptions: 'conceive',
  pregnancy: 'pregnant', pregnancies: 'pregnant', ovulate: 'ovulation', ovulating: 'ovulation', ovulates: 'ovulation',
  infant: 'baby', infants: 'baby', newborn: 'baby', newborns: 'baby', babies: 'baby', clinician: 'doctor', physician: 'doctor',
  obstetrician: 'doctor', physicians: 'doctor', clinicians: 'doctor', lives: 'survive', live: 'survive', survives: 'survive',
  viable: 'survive', odds: 'chance', probability: 'chance', likelihood: 'chance', likely: 'chance', risk: 'chance',
  miscarriage: 'loss', miscarriages: 'loss', supplementation: 'supplement', supplements: 'supplement',
};

function stem(w) {
  if (/^\d/.test(w) || w.length <= 3) return w;
  return w
    .replace(/(ies)$/, 'y')
    .replace(/(ing|edly|ed|es|ly|s)$/, '')
    .replace(/(ation|ment|ness|ity)$/, '');
}

export function tokens(s = '') {
  return plain(s)
    .toLowerCase()
    .replace(/[’']/g, '')
    .replace(/(\d)\s*%/g, '$1pct')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .map((w) => NUMBER_WORDS[w] || SYNONYMS[w] || w)
    .filter((w) => w && !STOP.has(w))
    .map(stem)
    .filter(Boolean);
}

function grams(s) {
  const t = tokens(s);
  const out = [...t];
  for (let i = 0; i < t.length - 1; i++) out.push(`${t[i]}_${t[i + 1]}`);
  return out;
}

/**
 * Build a similarity index over a corpus of sentences. Returns a function that scores a new sentence against
 * every corpus sentence (cosine over TF-IDF of unigrams+bigrams) and reports the best match.
 */
export function buildSimilarityIndex(corpus, extraDocs = []) {
  const docs = corpus.map((c) => grams(typeof c === 'string' ? c : c.text));
  const all = [...docs, ...extraDocs.map(grams)];
  const df = new Map();
  for (const d of all) for (const g of new Set(d)) df.set(g, (df.get(g) || 0) + 1);
  const N = Math.max(all.length, 1);
  const idf = (g) => Math.log((N + 1) / ((df.get(g) || 0) + 1)) + 1;
  const vec = (gs) => {
    const tf = new Map();
    for (const g of gs) tf.set(g, (tf.get(g) || 0) + 1);
    const v = new Map();
    let norm = 0;
    for (const [g, n] of tf) {
      const w = (1 + Math.log(n)) * idf(g);
      v.set(g, w);
      norm += w * w;
    }
    return { v, norm: Math.sqrt(norm) || 1 };
  };
  const vecs = docs.map(vec);
  return function best(sentence) {
    const q = vec(grams(sentence));
    let bestScore = 0;
    let bestIdx = -1;
    vecs.forEach((d, i) => {
      let dot = 0;
      for (const [g, w] of q.v) {
        const x = d.v.get(g);
        if (x) dot += w * x;
      }
      const s = dot / (q.norm * d.norm);
      if (s > bestScore) { bestScore = s; bestIdx = i; }
    });
    return { score: bestScore, index: bestIdx, match: bestIdx >= 0 ? corpus[bestIdx] : null };
  };
}
