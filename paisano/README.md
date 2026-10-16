# Paisano

One set at a time, as many reps as you can, for a day at a desk, with a roadrunner to keep you company.
Plain HTML, CSS and JavaScript at [paulscotti.com/paisano](https://www.paulscotti.com/paisano/).

## Workouts

- **Pachinko** picks from twelve exercises for a pull-up bar and PowerBlock dumbbells up to 80 lb each. Each board
  has five, drawn with more weight for muscles less worked today and exercises not yet done, and a new layout of
  pegs: staggered rows, mirrored rings, waves or chevrons, or a mirrored scatter, with a few bouncier bumpers. Aim
  the launcher like Peggle: point or drag on the board, farther from it for a harder shot, and let go (or use the
  arrow keys and Enter). A dotted guide shows the start of the shot. Pegs light up with rising notes as they're hit,
  and the pocket it lands in is the exercise. While a snack would earn seeds the board holds a small seed low down;
  the marble catches it only by rolling right over it, without being turned, which about 6% of shots do.
  `pachinko.js` holds the layouts and the fixed-timestep physics for both the drawing and
  `node --test pachinko.test.js`, which fires 5,280 shots across 40 boards to check that each settles, every pocket
  can be reached on every board, aiming hard left or right moves the landing, and the seed can be caught and missed
  without changing the marble's path.
- **A snack** is one set, or a set a side for one-sided exercises, as many reps as you can, to failure with good
  form. There is no timer: the screen shows the weight and the reps to expect at it, and stays awake while it's
  open. Each exercise loops eight illustrated poses at its tempo; the four that work without weight have their own
  bodyweight artwork, and reduced motion shows a still. Change the weight or swap the exercise first; close it to
  come back later in that tab, and a reload restores it.
- **Logging.** After the set, nudge the rep counter, which starts at the reps expected, or type the number, then
  save it or mark that it stopped with discomfort. The ring is full at the reps expected and turns gold past them,
  which earns a bonus seed and draws a rarer visitor. A new weight moves the expected reps, and the counter with
  them until it's been changed.
- **The suggestion** is the PowerBlock weight expected to land nearest 8 to 15 reps, the closest to the last one
  among equals, so it stays while the set lands in range. After discomfort it never goes heavier. Reps at another
  weight come from Epley's formula, load × (1 + reps / 30), where the load includes a rough share of a 170 lb
  bodyweight for squats, split squats, deadlifts and calf raises; bodyweight exercises expect last time's reps.
- **The body.** An area gets a set for each set of an exercise that works it most and half for one that assists;
  a one-sided pair counts once. One set is full color. History shows every day, the last seven days' sets per area,
  and each exercise's sets with a line of its weight, or reps for bodyweight.

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

- **Seeds ripen between snacks.** A snack earns one seed for each 15 minutes since the last one, up to two, so one
  right after another earns nothing. Two seeds on **Start exercise** fill from the bottom as they ripen, the line
  below counts down the minutes to the next, and the same seeds sit on **Save**, joined by the bonus seeds for
  beating the reps expected and hitting the pachinko seed, which count only once a seed is ripe and only for a snack
  with reps. The day's third snack brings rain, which grows the garden.
- Feed seeds to hatch and grow Paisano, to a chick at 20, a fledgling at 150 and a roadrunner at 600. Its belly
  holds three and digests one an hour.
- Eight plants, from wildflowers at 6 seeds to a palo verde at 140, each grow with rain and bring someone.
  Wildflowers, creosote, prickly pear and mesquite each bring their own visitor once grown. Desert marigold,
  brittlebush, ocotillo and palo verde each bring a friend as soon as they're planted: Pip the quail whistles with
  Paisano, Juniper the jackrabbit hops, Pebble the tortoise plays peekaboo, and Sombra the kit fox bows and naps.
  Friends play on their own or when tapped; their games use no seeds. With snacks about an hour apart on weekdays,
  a simulated player grows the garden over about eight weeks and raises a roadrunner in about five.
- Each snack brings a creature that's out at that hour, a rarer one with the rain. Tap it to stalk: step while it
  looks away, wait while it looks up. Escape, another screen or another tab ends the hunt, and the visitor waits to
  be tried again. Catches feed Paisano and build Speed, Stealth and Nerve. The Desert page has the plants, traits and
  field guide. Days off take nothing away.

The bird, creatures, plants, egg and seed were generated the same way, with transparent backgrounds. Four bird
stages each have idle, running (two frames), feeding, sleeping and happy poses. Original PNGs, the full prompts,
generation IDs and crop coordinates are in [`output/imagegen/manifest.json`](output/imagegen/manifest.json). The
app makes no image-generation calls.

The desert marigold, brittlebush, ocotillo and palo verde are simple SVG placeholders in `index.html` until their
artwork is drawn; replacing each `<g id="p-…">` with an image keeps everything else working.

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
harmless, and snacks are sent before the hunts that refer to them. While a sync can't finish, a retry button under
**Start exercise** says so; offline that is all, and a Worker refusal also shows its reason. Reconnecting or
returning to the tab retries too. Snacks store their local training date (the day turns at 4 am) and hour, so a late
confirmation or travel doesn't move them or change their visitor. The Worker still takes the two-set snacks of
versions before 14, in case a device logs one before it updates.

In production a service worker caches the app so it opens offline; a new version waits behind **Update ready**,
which keeps an active snack. For a release, raise `version` in `config.js`, the `?v=` asset URLs and the service
worker's cache name together. A push to master that changes `worker/` or `config.js` deploys the Worker before the
app goes live (`.githooks/pre-push`). The password is the one ebis, myna and pintail use, checked by `worker.js` at
the top of the repo; typed once on a device, it opens all four.

Serve the repository root so the font paths work, and run the Worker from `paisano/worker` with the password in
`.dev.vars`:

```sh
python3 -m http.server 8766 --directory ..
npx wrangler d1 execute paisano --local --file schema.sql
npx wrangler dev --port 8789
```

Then open `http://localhost:8766/paisano/`; on localhost the app talks to the local Worker and there is no service
worker. Production uses `paisano.scottibrain.workers.dev`.
