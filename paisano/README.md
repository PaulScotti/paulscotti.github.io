# Paisano

One set at a time, as many reps as you can, for a day at a desk, with a roadrunner to keep you company.
Plain HTML, CSS and JavaScript at [paulscotti.com/paisano](https://www.paulscotti.com/paisano/).

## Workouts

- **Pachinko** picks from twelve exercises for a pull-up bar and PowerBlock dumbbells up to 80 lb each. Each board
  has five, drawn with more weight for muscles less worked today and exercises not yet done. Slide the ball along
  the top with a finger, mouse or arrow keys and drop it: the pegs decide where it lands, and starting nearer a
  pocket makes that pocket likelier. Catch the seed among the pegs for an extra seed when the snack is logged.
  `pachinko.js` holds the board and its fixed-timestep physics for both the drawing and
  `node --test pachinko.test.js`, which drops 3,942 balls to check that each settles, every pocket can be reached,
  aim matters, and the seed can be caught and missed.
- **A snack** is one set, or a set a side for one-sided exercises, as many reps as you can, to failure with good
  form. There is no timer: the screen shows the weight and the reps to expect at it, and stays awake while it's
  open. Each exercise loops eight illustrated poses at its tempo; the four that work without weight have their own
  bodyweight artwork, and reduced motion shows a still. Change the weight or swap the exercise first; close it to
  come back later in that tab, and a reload restores it.
- **Logging.** After the set, nudge the rep counter, which starts at the reps expected, or type the number, then
  save it or mark that it stopped with discomfort. The ring is full at the reps expected and turns gold past them,
  which earns an extra seed and draws a rarer visitor. A new weight moves the expected reps, and the counter with
  them until it's been changed.
- **The suggestion** keeps the weight while the set lands in 8 to 15 reps. Past the range it moves to the lightest
  PowerBlock weight expected to bring it back, short of it to the heaviest, and after discomfort it never goes
  heavier. Reps at another weight come from Epley's formula, load × (1 + reps / 30), where the load includes a rough
  share of a 170 lb bodyweight for squats, split squats, deadlifts and calf raises; bodyweight exercises expect last
  time's reps.
- **The body.** An area gets a set for each set of an exercise that works it most and half for one that assists;
  a one-sided pair counts once. One set is full color. History shows every day, the last seven days' sets per area,
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

Settings, under the gear, can reset all progress. The reset is an event in the log like any other: every device
replays only what comes after it, so Paisano, the garden, the field guide, History and every suggestion start over
everywhere, while the earlier events stay in D1.

## Paisano's garden

- Each snack earns a seed, beating the reps expected earns one more, and the day's third snack brings rain and three
  more. Rain grows planted wildflowers, creosote, prickly pear and mesquite, each bringing its own visitor once grown.
  Whole-body and best rewards from versions 1 to 3 replay as they were earned.
- Feed seeds to hatch and grow Paisano. Its belly holds three and digests one an hour.
- Each planted variety invites another friend, starting with none in an empty garden. Pip the quail whistles with
  Paisano, Juniper the jackrabbit hops, Pebble the tortoise plays peekaboo, and Sombra the kit fox bows and naps.
  Sprouts count immediately. Friends play on their own or when tapped; their games use no seeds. The Desert page
  shows who is visiting and how to invite the next friend. Visits follow the saved plants across devices and resets.
- Each snack brings a creature that's out at that hour, a rarer one with the rain. Tap it to stalk: step while it
  looks away, wait while it looks up. Escape, another screen or another tab ends the hunt, and the visitor waits to
  be tried again. Catches feed Paisano and build Speed, Stealth and Nerve. The Desert page has the plants, traits and
  field guide. Days off take nothing away.

The bird, creatures, plants, egg and seed were generated the same way, with transparent backgrounds. Four bird
stages each have idle, running (two frames), feeding, sleeping and happy poses. Original PNGs, the full prompts,
generation IDs and crop coordinates are in [`output/imagegen/manifest.json`](output/imagegen/manifest.json). The
app makes no image-generation calls.

The friends use a separate three-pose atlas generated with the built-in imagegen tool, using the bird as a style
reference. Its original is `output/imagegen/friends.png`, with frame coordinates in `output/imagegen/friends.json`;
`assets/friends.webp` is the compressed sheet. Reduced motion keeps the friends still and shows their greeting pose
when tapped. Leaving the garden ends a game.

## Evidence

The [2026 ACSM guidance](https://acsm.org/resistance-training-guidelines-update-2026/) emphasizes regular resistance
training across the major muscle groups, with individualized volume, and treats training to failure as generally
optional. A [review of minimal-dose resistance training](https://pubmed.ncbi.nlm.nih.gov/38509414/) calls exercise
snacks promising, with stronger support so far for single-set and weekend approaches. Paisano's schedule, credit
map, progression rules and garden are design choices, not tested ones.

## Storage and development

`config.js` holds the exercises, weights, timings, creatures, friends and plants. The interface uses Libron from
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
