# Myna

Korean flashcards, said aloud, at [paulscotti.com/myna](https://www.paulscotti.com/myna/) and as an Android app.
Named for the myna, the bird that learns to talk by copying what it hears.

## How it works

- Each day gets the cards that are due, plus 1 to 10 new words: 10 when nothing is due, one fewer
  for every 10 reviews. OpenAI picks new words that come up most in everyday conversation, one per
  meaning, against everything already in the deck. Words you add join that day's session. Once the
  day is done, the next session can be started early: the next day's due cards and new words for them.
- A session opens with its new words, stepped through with ← and → (Previous and Next). Then each
  card is asked Korean first or English first, chosen at random for each card each day. When another
  Korean word would answer the English just as well, a few words in parentheses say which is meant,
  like to be sorry (said to a friend) for 미안하다 rather than 죄송하다. Its answer is said after a
  moment to think, or at once on any key; then → or volume up is correct, ← or volume down is
  incorrect. Last come three Korean sentences that join the session's words, written by OpenAI while
  the cards are asked, to put into English with twice as long to think. They are marked the same way,
  only to keep the task active: no card changes. Then an overview: time, cards, first-try accuracy,
  levels gained.
- Scheduling is FSRS-6 with its default parameters and two grades. A new word's first test is its first
  answer, and a word answered right on the day it is met comes back the next day, like an Anki learning
  step. Gaps of 2.5 days or more are spread a few days either way as Anki does, so words learned together
  drift apart. A card's level (0 to 9) follows its stability: it climbs a level each time the days it can
  be remembered double. It is mastered (level 9) once that reaches 256 days and it has been answered right
  as a sentence, and then it is never asked again. As it climbs it is asked as the word, then in other
  forms, then in phrases and sentences built only from words at its level or higher, more often ones you
  know better, so a miss points at the word being tested. The forms per level, the model and the voices
  are in `config.js`.
- Korean is spoken by Azure's SunHi voice and English by MAI-Voice-2.1, and each line is kept in R2, so
  it is synthesized once. MAI-Voice-2.1 garbled lone Korean words in about 4 of 10 tries (집 as 점), so it
  only speaks English.

## Pieces

- `index.html`, `myna.css`, `myna.js`: the app. Libron comes from `../ebis/fonts`.
- `api.js`: myna's part of the apps Worker (`wrangler.jsonc` and `worker.js` at the top of the repo) on
  Paul's personal Cloudflare, answering at `/myna/api/`, with the deck in D1 (`schema.sql`) and the audio in
  R2. The password is the one ebis, pintail and paisano use; typed once in the browser, it opens all four
  (the Android app keeps its own). A push to master deploys it with the app.
- `android/`: the Android app, a WebView of this site that also turns the volume keys into answers,
  keeps the screen on during a session, and installs its own updates. Built without Gradle.

```
android/build.sh                        # after changing android/: raise `apk` in config.js first
```

Raise `version` in `config.js` with every update; the app shows it beside the logo. The app updates itself when the site changes. When `apk` in `config.js` is higher than the installed
app's version, the app offers to update; the first update asks to allow installs from Myna, later
ones install without asking. The signing key is in `~/.config/myna`: keep a copy, since Android only
accepts an update signed with the same key. Locally, `npx wrangler dev` at the top of the repo runs
the app and its API at `http://localhost:8787/myna/` (with `KEY`, `OPENAI_API_KEY` and `AZURE_KEY` in `.dev.vars` there).
