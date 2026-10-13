# Paisano

Two minutes of exercise for a day at a desk, with a roadrunner to keep you company.
Plain HTML, CSS and JavaScript at [paulscotti.com/paisano](https://www.paulscotti.com/paisano/).

## Workouts

- **Pachinko** picks from twelve exercises for a pull-up bar and PowerBlock dumbbells up to 80 lb each. Each board
  has five, drawn with more weight for muscles less worked today and exercises not yet done. Slide the ball along
  the top with a finger, mouse or arrow keys and drop it: the pegs decide where it lands, and starting nearer a
  pocket makes that pocket likelier. Catch the seed among the pegs for an extra seed when the snack is logged.
  `pachinko.js` holds the board and its fixed-timestep physics for both the drawing and
  `node --test pachinko.test.js`, which drops 3,942 balls to check that each settles, every pocket can be reached,
  aim matters, and the seed can be caught and missed.
- **A snack** is two minutes: a set each minute, or a minute per side for one-sided exercises. Set the reps and
  weight or swap the exercise, start, do the reps and rest until the chime. Each exercise loops eight illustrated
  poses at its tempo; the four that work without weight have their own bodyweight artwork, one-sided ones mirror
  for the second side, and reduced motion shows a still. Pause, finish early, or close it to come back later in that
  tab; a reload restores it, and the clock keeps counting in the background.
- **Logging.** Confirm the reps and weight of each set, 0 for one skipped. After the full two minutes every set
  starts at the target; after finishing early, the sets whose minute began do. Then say how many more reps the last
  set had in it: 4+ (easy), 1 to 3 (good), 0 (hard), or that it stopped with discomfort.
- **The next dose** starts from the fewest reps and lightest weight done last time. Good repeats it. Easy, with
  both sets done, adds a rep, up to 12 or what fits the exercise's 40 seconds of work, then moves to the next
  PowerBlock weight at the starting reps. Hard drops a weight setting, or a rep when no lighter weight exists.
  Discomfort and skipped sets never raise it, and every suggestion can be changed before starting.
- **The body.** An area gets a set for each set of an exercise that works it most and half for one that assists;
  a one-sided pair counts once. Two sets is full color. History shows every day, the last seven days' sets per area,
  and each exercise's sets with a line of its weight, or reps for bodyweight. Entries from before sets were
  confirmed kept only their target and are labeled so.

The exercise artwork was generated through the OpenAI Images API with `gpt-image-2.5-sunburst` at `quality: "max"`.
The original PNGs, complete prompts, generation IDs and frame placement are in
[`output/imagegen/exercises/manifest.json`](output/imagegen/exercises/manifest.json); the WebP sheets the app plays
are in `assets/exercises/`. Form references: [PowerBlock's squat and hinge demonstrations](https://powerblock.com/blogs/adjustable-dumbbell-workouts/top-4-exercises-for-a-quick-home-workout),
[floor press](https://powerblock.com/blogs/adjustable-kettlebell-workouts/chest-day-home-gym-edition),
[exercise videos](https://powerblock.com/pages/dumbbell-exercise-videos),
NASM's [push-up](https://www.nasm.org/resource-center/exercise-library/push-up) and
[pull-up](https://www.nasm.org/resource-center/exercise-library/pull-up),
ACE's [hammer curl](https://www.acefitness.org/resources/everyone/exercise-library/10/hammer-curl/) and
[wall calf raise](https://www.acefitness.org/resources/everyone/exercise-library/73/standing-calf-raises-wall/), and
a [hanging knee raise demonstration](https://www.muscleandstrength.com/exercises/hanging-knee-raise.html).

## Paisano's garden

- Each snack earns a seed, and the day's third brings rain and three more. Rain grows planted wildflowers,
  creosote, prickly pear and mesquite, each bringing its own visitor once grown. Whole-body and best rewards from
  versions 1 to 3 replay as they were earned.
- Feed seeds to hatch and grow Paisano. Its belly holds three and digests one an hour.
- Each snack brings a creature that's out at that hour, a rarer one with the rain. Tap it to stalk: step while it
  looks away, wait while it looks up. Escape, another screen or another tab ends the hunt, and the visitor waits to
  be tried again. Catches feed Paisano and build Speed, Stealth and Nerve. The Desert page has the plants, traits and
  field guide. Days off take nothing away.

The bird, creatures, plants, egg and seed were generated the same way, with transparent backgrounds. Four bird
stages each have idle, running (two frames), feeding, sleeping and happy poses. Original PNGs, the full prompts,
generation IDs and crop coordinates are in [`output/imagegen/manifest.json`](output/imagegen/manifest.json). The
app makes no image-generation calls.

## Evidence

The [2026 ACSM guidance](https://acsm.org/resistance-training-guidelines-update-2026/) emphasizes regular resistance
training across the major muscle groups, with individualized volume, and treats training to failure as generally
optional. A [review of minimal-dose resistance training](https://pubmed.ncbi.nlm.nih.gov/38509414/) calls exercise
snacks promising, with stronger support so far for single-set and weekend approaches. Paisano's schedule, credit
map, progression rules and garden are design choices, not tested ones.

## Storage and development

`config.js` holds the exercises, weights, timings, creatures and plants. The interface uses Libron from
`../ebis/fonts`.

The Worker keeps an append-only D1 event log and rejects malformed events. Each unsent event waits under its own
localStorage key until the Worker has it; a Web Lock keeps one sync at a time per browser, event IDs make retries
harmless, and snacks are sent before the hunts that refer to them. A failed sync shows a retry button; reconnecting
or returning to the tab retries too. New snacks store their local training date (the day turns at 4 am) and hour, so
a late confirmation or travel doesn't move them or change their visitor; older ones use the viewing device's
timezone.

In production a service worker caches the app so it opens offline; a new version waits behind **Update ready**,
which keeps an active snack. For a release, raise `version` in `config.js`, the `?v=` asset URLs and the service
worker's cache name together, and release Worker changes with the app.

Serve the repository root so the font paths work, and run the Worker from `paisano/worker` with the password in
`.dev.vars`:

```sh
python3 -m http.server 8766 --directory ..
npx wrangler d1 execute paisano --local --file schema.sql
npx wrangler dev --port 8789
```

Then open `http://localhost:8766/paisano/`; on localhost the app talks to the local Worker and there is no service
worker. Production uses `paisano.scottibrain.workers.dev`.
