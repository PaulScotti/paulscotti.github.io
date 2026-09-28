# Digest JSON schema (v2)

One file per day: `digest.json`. Everything a reader sees comes from this file; the site renders it and
never executes anything in it. `L` below means a localized pair: `{ "en": "...", "ko": "..." }`.

```jsonc
{
  "schema": 2,
  "date": "2026-09-27",                 // Pacific-time date this digest is for
  "unit": "conceive.fertile-window",    // curriculum unit id, or a new "track.slug" (then add unitProposals)
  "track": "conceive",                  // conceive | body | pregnancy | birth | baby | parenting | us | life | roots
  "depth": "core",                      // core | deeper (a follow-up that builds on an earlier day)
  "buildsOn": ["2026-09-20"],           // dates of earlier digests this one explicitly builds on ([] if none)
  "addresses": [],                      // ids of inbox notes/requests this digest answers ([] if none)
  "planNote": "Why this topic today, in one sentence (internal, not shown).",

  "en": { /* Edition, English */ },
  "ko": { /* Edition, Korean (합니다체; see ko-style.md) - same structure, same facts, same citations */ },

  "figures": [ /* Figure objects, referenced from sections by id; 0-2 per day */ ],
  "sources": [ /* Source objects; cite in text as [1], [2], [1, 3] (1-based) */ ],
  "glossary": [ /* 2-4 bilingual terms (shown as "Glossary") */ ],
  "nuggets": [ /* 4-8 atomic facts taught today, English, one sentence each (for the no-repeat ledger) */ ],
  "keywords": [ /* 3-8 lowercase English keywords */ ],
  "unitProposals": [ /* optional: new backlog units: { "id", "track", "phase", "title", "why" } */ ]
}
```

## Edition (`en` / `ko`)

| field | rules |
|---|---|
| `title` | Specific, inviting. EN ≤ 70 chars; KO ≤ 40 chars. |
| `takeaway` | ONE sentence that stands alone in an email ("The gist"). Concrete and memorable, not generic. EN ≤ 32 words; KO ≤ 110 chars. |
| `sections` | 3–5 items `{ "heading", "body", "evidence"?, "figure"? }`. This is where nearly all of the reading time goes. `evidence` ∈ `strong \| moderate \| emerging \| expert \| tradition` (optional badge). `figure` = id of a figure shown after the body. EN and KO must have the same number of sections in the same order, with the same `figure`/`evidence` values. |
| `forUs` | 2–3 sentences of NEW, specific implications for these two (never a summary of the sections). Markdown-lite. |

Retired (validation fails if present): `dek`, `nugget`, `tryThis`, `talk`, `askDoctor`. Expert practice goes into the
sections as facts with citations, not as quotes.

Length: EN reading text (section headings + bodies + forUs) should be **500–650 words** (≈3 minutes).
KO should carry the same content (typically 1,000–2,300 Hangul syllables). The validator rejects sentences that
restate an earlier sentence of the same digest.

### Markdown-lite (for `body` and `forUs`)
- Blank line = new paragraph. Lines starting with `- ` form a bullet list; `1. ` forms a numbered list.
- `**bold**`, `*italic*`, `[text](https://link)`.
- Citations: `[1]`, `[2, 4]` → numbered sources. Every factual number needs a citation.
- No HTML. No headings inside bodies. No emoji.

## Figures (optional, 0–2; only when they add information or interactivity the text doesn't)

All labels are `L`. Data must come from cited sources (`source`: number) unless it is a calculator.

```jsonc
{ "id": "f1", "type": "widget", "widget": "fertile-window",
  "params": { "cycleMin": 24, "cycleMax": 32, "cycleDefault": 28 }, "caption": L }
// widget "due-date": { "params": {} } - LMP -> due date, current week, upcoming milestones

{ "id": "f2", "type": "bars", "title": L, "unit": "%", "max": 40, "source": 1, "caption": L,
  "rows": [ { "label": L, "value": 33, "highlight": true } ] }

{ "id": "f3", "type": "line", "title": L, "source": 2, "caption": L,
  "x": { "label": L, "min": -8, "max": 2, "ticks": [-8,-6,-4,-2,0,2] },
  "y": { "label": L, "min": 0, "max": 40, "unit": "%" },
  "series": [ { "name": L, "points": [[-5, 10], [-4, 16]] } ],
  "bands": [ { "from": -5, "to": 0, "label": L } ] }

{ "id": "f4", "type": "stats", "items": [ { "value": L, "label": L } ] }          // 2-4 big numbers NOT stated in the text

{ "id": "f5", "type": "compare", "caption": L,
  "columns": [ { "title": L, "items": [L, L] }, { "title": L, "items": [L] } ] }  // e.g. Myth vs Fact, Korea vs US

{ "id": "f6", "type": "quiz", "question": L, "options": [L, L, L], "answer": 1, "explain": L }  // answer = 0-based index

{ "id": "f7", "type": "steps", "title": L, "items": [ { "label": L, "text": L } ] }  // a timeline / sequence

{ "id": "f8", "type": "table", "title": L, "source": 3, "caption": L,
  "columns": [L, L, L], "rows": [ [L, L, L] ], "heat": [ [null, 0.2, 0.8] ] }   // heat: optional 0-1 tint per cell

{ "id": "f9", "type": "image", "src": "https://upload.wikimedia.org/...", "alt": L, "caption": L,
  "credit": "Author, License", "link": "https://commons.wikimedia.org/wiki/File:..." }   // Wikimedia only

{ "id": "f10", "type": "svg", "svg": L, "caption": L }   // hand-made diagram; <= 12 KB each; no scripts, no
                                                         // event handlers, no external refs; use currentColor
```

## Source
```jsonc
{ "title": "Timing of sexual intercourse in relation to ovulation", "publisher": "N Engl J Med",
  "year": 1995, "url": "https://www.nejm.org/doi/full/10.1056/NEJM199512073332301",
  "type": "study", "lang": "en" }
```
`type` ∈ `guideline | review | study | org | expert | book | community | news`. 3–8 sources. Only cite URLs you
actually opened or saw in search results. Prefer DOI/PubMed/official pages. `lang` = language of the source.

## Glossary item
```jsonc
{ "en": "LH surge", "ko": "LH 급상승(황체형성호르몬)", "noteEn": "The hormone spike that triggers ovulation",
  "noteKo": "배란을 일으키는 호르몬 급증" }
```
