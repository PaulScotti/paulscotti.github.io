# Paisano

Two minutes of exercise about once an hour, for a day at a desk, at [paulscotti.com/paisano](https://www.paulscotti.com/paisano/).
Named for the roadrunner, el paisano, which also means a companion.

## How it works

- **Spin.** A wheel picks one of twelve exercises for adjustable dumbbells (a PowerBlock Elite EXP, up to 80 lb a
  hand) and a pull-up bar. Each slice is sized by the sets the exercise would add to the parts of the body still short
  of today's two, and exercises already done today are left off. Spinning about hourly covers all thirteen areas in
  about eight snacks: 7 to 9 in 98% of 20,000 simulated days.
- **A snack** is two sets in two minutes, one on each minute; a one-sided exercise does both sides each minute. The
  screen shows the dose, a figure doing the rep and three cues; it stays awake, and a chime marks the second minute.
- **The dose.** Each exercise holds a belief about your strength, as chances over a grid: Epley's one-rep max
  (load × (1 + reps / 30)) for dumbbell exercises, where the load includes the rough share of bodyweight a squat,
  split squat, deadlift or calf raise moves, and the most reps in a set for bodyweight exercises. After each snack you
  say how many more reps you could have done on the last set (reps in reserve, Zourdos et al. 2016): 4 or more, 1 to
  3, or none. The belief is multiplied by how likely that answer was at each strength, allowing 1.5 reps of error, and
  it widens between snacks as strength drifts (QUEST, Watson & Pelli 1983). The next dose is aimed at the belief's mean:
  of the settings PowerBlock has and the reps that fit the minute at the exercise's tempo, the one most likely to leave
  1 to 3 in reserve, less its chance of leaving none.
- **Why that learner.** In simulation (lifters from 0.75 to 2 times the first dose's strength, answers off by 1.5
  reps, strength growing 0.3% a snack), snacks 21 to 60 landed at 1 to 3 in reserve 57% of the time and failed 10%;
  the first ten failed 17%. A PEST staircase (Taylor & Creelman 1967) in the same simulation landed as often but
  failed 17% (23% of the first ten). With 1.5 reps of error, about 68% is the most any learner could land.
- **The body.** Thirteen areas, each done for the day at two sets. A set counts in full for the areas an exercise
  works most and half for those it assists, the "fractional" counting best supported in Pelland et al.'s dose-response
  meta-regression (SportRxiv preprint). Two a day is fourteen a week; meta-analysis finds 10 or more weekly sets per
  muscle build more than fewer (Schoenfeld, Ogborn & Krieger 2017). History shows each area's sets over the last week
  against that line, and each exercise's estimated strength over time.
- **Paisano** gets a seed for every snack, two more for a new best (a heavier dose by Epley than any finished before)
  and three for the snack that completes the whole body. Tap the sack to feed it; it hatches and grows from a
  hatchling to a chick (15 seeds), a fledgling (80) and a roadrunner (300). It naps at night, wants seeds when there are
  some, and grows restless when it has been more than an hour since a snack.
- **Why snacks.** Breaking up sitting with two minutes of walking every 20 minutes lowered glucose and insulin after a
  meal in 19 adults with overweight or obesity (Dunstan et al. 2012). Short bursts of vigorous exercise spread through
  the day are a proposed way to build fitness, so far supported by small studies (Islam, Gibala & Little 2022).

## Pieces

- `index.html`, `paisano.css`, `paisano.js`: the app. `figure.js` draws the exercise figures from the two poses of each
  rep in `config.js`, which also holds every knob and the exercises. Libron comes from `../ebis/fonts`.
- `worker/`: the `paisano` Worker at `paisano.scottibrain.workers.dev` on Paul's personal Cloudflare. D1 keeps one log
  of snacks and feedings (`schema.sql`); the app works everything else out from it, and events wait in the device's
  storage until the worker has them. The password is the same as ebis and myna.

```
cd worker && npx wrangler deploy      # after changing the worker
```

Raise `version` in `config.js` with every update; the app shows it beside the logo and reloads past the browser's
cache when it changes. On `localhost` the app talks to `npx wrangler dev --port 8789` (with `KEY` in
`worker/.dev.vars`).
