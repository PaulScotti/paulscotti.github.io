# Parenthood: a private daily digest

A bilingual (English / 한국어), research-backed, three-minute read every day, from trying to conceive through
pregnancy and parenthood. The site lives at `/parenthood/`; the content is private.

**First-time setup:** see [SETUP.md](SETUP.md).

## How it works

```
                 ┌──────────── GitHub Actions (this repo) ────────────┐
 6am PT          │ parenthood-generate                                │
                 │  pull private context ─► Claude plans, researches, │      Firestore (private)
                 │  writes EN+KO ─► validate (schema, length,         │ ───► digests/{date}
                 │  citations, no-repeat) ─► publish                  │      overview/{year}, ledger/{date}
                 └────────────────────────────────────────────────────┘      members, state, inbox, questions
 9:30pm PT         parenthood-email ─► takeaway + link, each in their own language (via Gmail)
                                                                              ▲
 Phone / laptop ─► www.paulscotti.com/parenthood (static shell, this folder) ─┘  Google sign-in; security rules
                                                                                  allow only the two accounts
```

- **Never repetitive.** Every digest records its atomic facts ("nuggets") in a private ledger. Before writing, the
  agent reads everything already taught; afterwards a validator compares the new facts against all earlier ones
  (TF-IDF similarity) and rejects repeats. Follow-ups must go deeper and link back to the day they build on.
- **Big-picture curriculum.** [`pipeline/curriculum.json`](pipeline/curriculum.json) maps ~170 units across nine
  tracks (conceiving, health, pregnancy, birth, baby care, parenting science, us, life logistics, culture & faith).
  A planner ranks what's next by stage (trying / pregnant with week / baby's age), priority, a soft weekly rhythm,
  track balance, and your requests and feedback. The agent can propose new units.
- **Research.** Each day draws on guidelines (ACOG, ASRM, AAP, CDC, WHO, Korean bodies where relevant), reviews and
  landmark or recent studies, expert practice, and cross-checked experienced-parent wisdom, with numbered citations
  and evidence badges. URLs are checked, so dead or invented links fail validation.
- **For the two of you.** A private profile personalizes a "For the two of you" note; each day also has one small
  action, a question to talk about, questions for the doctor, and bilingual clinic vocabulary.

## Privacy model

- The repo is public, so nothing personal is committed: no member emails, no profile or medical details, no
  digests. [`pipeline/private/`](pipeline/private) is git-ignored (profile, member list, seed digests).
- Data lives in Firestore. [`firestore.rules`](firestore.rules) allows reads only for verified Google accounts on
  the member list (filled in at deploy time). The pipeline writes with a service account held in GitHub Secrets.
- Claude runs with only its own token in the environment and file access limited to a scratch folder; Firebase and
  Gmail credentials never reach it. Workflow logs print status lines only.

## Layout

| Path | What |
|---|---|
| `index.html`, `css/`, `js/` | The site: auth gate, feed (newest first), day view, Journey (timeline / themes / words + knowledge map), Doctor list, Us (stage, inbox, preferences) |
| `js/figures.js` | Charts, stats, comparisons, quizzes, timelines, sanitized SVG, and widgets (fertile-window explorer, due-date timeline) |
| `pipeline/generate.mjs` | Daily orchestrator (Claude Code headless → validate → publish) |
| `pipeline/prompts/generate.md`, `pipeline/schema.md` | The editorial brief and the digest format |
| `pipeline/validate.mjs` | Schema, length, citation, bilingual, safety and no-repeat checks |
| `pipeline/send-email.mjs` | Nightly email (precise 9:30pm PT across DST) |
| `pipeline/setup.mjs`, `pipeline/export.mjs` | One-time setup (rules, profile, seed) and full backup |
| `../.github/workflows/parenthood-*.yml` | Schedules |

## Local development

```bash
# terminal 1: emulators (needs Java)
npx firebase-tools emulators:start --only auth,firestore --project demo-parenthood --config parenthood/firebase.json
# terminal 2: seed + serve
cd parenthood/pipeline && FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-parenthood node setup.mjs --emulator
cd ../.. && python3 -m http.server 8765 --bind 127.0.0.1   # open http://127.0.0.1:8765/parenthood/
```

On `localhost` / `127.0.0.1` the site talks to the emulators, and the emulator's fake Google sign-in accepts any test
address. Generate a day locally with `node generate.mjs --local --date YYYY-MM-DD --no-publish --keep`.
