# Myna

Korean flashcards, said aloud, at [paulscotti.com/myna](https://www.paulscotti.com/myna/) and as an Android app.
Named for the myna, the bird that learns to talk by copying what it hears.

## How it works

- Each day gets the cards that are due, plus 1 to 10 new words: 10 when nothing is due, one fewer
  for every 10 reviews. OpenAI picks new words that come up most in everyday conversation, one per
  meaning, against everything already in the deck. Words you add join that day's session. Once the
  day is done, the next session can be started early: the next day's due cards and new words for them.
- A session opens with its new words, stepped through with ← and → (Previous and Next). Then each
  card is asked Korean first or English first, chosen at random for each card each day. Its answer is
  said after a moment to think, or at once on any key; then → or volume up is correct, ← or volume
  down is incorrect. It ends with an overview: time, cards, first-try accuracy, levels gained.
- Scheduling is FSRS-6 with its default parameters and two grades. A card's level (0 to 9) follows
  its stability: it climbs a level each time the days it can be remembered double, and at 256 days
  (level 9) it is mastered and never asked again. As it climbs it is asked as the word, then in
  other forms, then in phrases and sentences built from words you know about as well. The forms per
  level, the model and the voices are in `config.js`.
- Everything is spoken by Azure's MAI-Voice-2.1 and kept in R2, so each line is synthesized once.

## Pieces

- `index.html`, `myna.css`, `myna.js`: the app. Libron comes from `../ebis/fonts`.
- `worker/`: the `myna` Worker at `myna.scottibrain.workers.dev` on Paul's personal Cloudflare, with
  the deck in D1 (`schema.sql`) and the audio in R2. The password is the same as ebis.
- `android/`: the Android app, a WebView of this site that also turns the volume keys into answers,
  keeps the screen on during a session, and installs its own updates. Built without Gradle.

```
cd worker && npx wrangler deploy        # after changing the worker
android/build.sh                        # after changing android/: raise `apk` in config.js first
```

The app updates itself when the site changes. When `apk` in `config.js` is higher than the installed
app's version, the app offers to update; the first update asks to allow installs from Myna, later
ones install without asking. The signing key is in `~/.config/myna`: keep a copy, since Android only
accepts an update signed with the same key. On `localhost` the app talks to `npx wrangler dev --port 8788`
(with `KEY`, `OPENAI_API_KEY` and `AZURE_KEY` in `worker/.dev.vars`).
