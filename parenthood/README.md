# Parenthood: a private daily digest

A bilingual (English / 한국어), research-backed, three-minute read every day, from trying to conceive through
pregnancy and parenthood. The site lives at `/parenthood/`; the content is encrypted.

**First-time setup:** see [SETUP.md](SETUP.md).

## How it works

```
 6am PT  parenthood-generate (GitHub Actions)
           read notes emailed to <gmail>+digest@ (IMAP) ─┐
           decrypt private state from `parenthood-data`  ─┼─► Claude plans, researches, writes EN + KO
           validate (schema, length, citations, URLs,    ─┘   ─► encrypt ─► commit to `parenthood-data`
           no-repeat check vs. everything already taught)
 8:30pm  parenthood-email ─► takeaway + link, each in their own language (Gmail SMTP; replies become notes)

 Phone ─► www.paulscotti.com/parenthood (static shell on master) ─► fetches *.enc from the data branch via
          raw.githubusercontent.com ─► decrypts in the browser with the family password (remembered per device)
```

- **Never repetitive.** Every digest records its atomic facts ("nuggets") in the encrypted ledger. Before writing,
  the agent reads everything already taught; afterwards a validator compares the new facts against all earlier ones
  (TF-IDF similarity with synonym folding) and rejects repeats. Follow-ups must go deeper and link back.
- **Big-picture curriculum.** [`pipeline/curriculum.json`](pipeline/curriculum.json) maps ~170 units across nine
  tracks (conceiving, health, pregnancy, birth, baby care, parenting science, us, life logistics, culture & faith).
  A planner ranks what's next by stage (trying / pregnant with week / baby's age), priority, a soft weekly rhythm,
  track balance, and the couple's emailed notes. The agent can propose new units.
- **Research.** Guidelines (ACOG, ASRM, AAP, CDC, WHO, Korean bodies where relevant), reviews and landmark or recent
  studies, expert practice, and cross-checked experienced-parent wisdom, with numbered citations and evidence
  badges. Source URLs are checked, so dead or invented links fail validation.
- **Dense, not padded.** About 3 minutes of reading, nearly all of it in 3–5 sections of specific, sourced facts;
  no quotes or prompts, and the validator rejects any sentence that restates an earlier one. Each day ends with a
  short personalized note ("For the two of you") and a bilingual glossary.

## Privacy model

- The repo is public, so nothing personal is committed in the clear. Master holds only code and the generic
  curriculum; the `parenthood-data` branch holds AES-256-GCM ciphertext (key from the password via PBKDF2-SHA256,
  5M iterations so each guess at a short password is expensive; each file's name is bound as associated data). `pipeline/private/` is git-ignored.
- The password (7+ characters, case-sensitive) lives in the family's password managers and in one GitHub secret
  for the daily jobs.
- Claude runs with only its own token in the environment and file access limited to a scratch folder; the
  password and Gmail credentials never reach it. Workflow logs print status lines only.
- Emailed notes are accepted only from the two members' addresses, and only when Gmail authenticated them.

## Layout

| Path | What |
|---|---|
| `index.html`, `css/`, `js/` | The site: password gate, feed (newest first), day view, Journey (timeline / themes / glossary + knowledge map), Us |
| `js/store.js` | Fetch + WebCrypto decryption, remembered device key |
| `js/figures.js` | Charts, stats, comparisons, quizzes, timelines, sanitized SVG, and widgets (fertile-window explorer, due-date timeline) |
| `pipeline/generate.mjs` | Daily orchestrator (inbox → context → Claude Code headless → validate → publish) |
| `pipeline/prompts/generate.md`, `pipeline/schema.md` | The editorial brief and the digest format |
| `pipeline/validate.mjs` | Schema, length, citation, bilingual, safety and no-repeat checks |
| `pipeline/inbox.mjs`, `pipeline/send-email.mjs` | Emailed notes in (IMAP), nightly email out (precise 8:30pm PT across DST) |
| `pipeline/setup.mjs`, `pipeline/export.mjs` | One-command setup (password, data branch, secrets) and decrypted backup |
| `../.github/workflows/parenthood-*.yml` | Schedules |

## Local development

```bash
cd parenthood/pipeline && npm ci && npm test
echo 'Tq7mKp3' > /tmp/pass.txt   # a local test password
node setup.mjs --data-dir ../.data --passphrase-file /tmp/pass.txt   # encrypted test data in parenthood/.data
cd ../.. && python3 -m http.server 8765 --bind 127.0.0.1             # open http://127.0.0.1:8765/parenthood/
```

On `localhost` / `127.0.0.1` the site reads `parenthood/.data/` instead of the data branch. Generate a day locally
with `PARENTHOOD_PASSPHRASE=… node generate.mjs --data ../.data --local --date YYYY-MM-DD --no-publish --keep`.
Delete `parenthood/.data` before running the real setup.
