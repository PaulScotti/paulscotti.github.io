# Paisano

Two minutes of exercise for a day at a desk, with a roadrunner to keep you company.
Plain HTML, CSS and JavaScript at [paulscotti.com/paisano](https://www.paulscotti.com/paisano/).

## Workouts

Spin to choose from twelve exercises for a pull-up bar and PowerBlock dumbbells up to 80 lb each.
The wheel favors muscles with less work logged today and avoids repeating exercises until the pool is exhausted.
Change the exercise, reps or weight before starting. Suggestions are starting points, not measured capacity.

Each demonstration loops through eight illustrated poses at the exercise's tempo. The four exercises that allow
0 lb have separate bodyweight artwork and cues. Single-side movements mirror after the first minute, and reduced
motion shows a still endpoint. Illustrations use the floor, wall, pull-up bar and block-shaped dumbbells.

The exercise artwork was generated through the OpenAI Images API with `gpt-image-2.5-sunburst` at `quality: "max"`.
The original PNGs, complete prompts, generation IDs and frame placement are saved in
[`output/imagegen/exercises/manifest.json`](output/imagegen/exercises/manifest.json). Runtime WebP sheets are in
`assets/exercises/`; they contain generated poses with position and scale normalized for playback.
Form references include [PowerBlock's squat and hinge demonstrations](https://powerblock.com/blogs/adjustable-dumbbell-workouts/top-4-exercises-for-a-quick-home-workout),
[floor press instructions](https://powerblock.com/blogs/adjustable-kettlebell-workouts/chest-day-home-gym-edition),
[exercise videos](https://powerblock.com/pages/dumbbell-exercise-videos),
NASM's [push-up](https://www.nasm.org/resource-center/exercise-library/push-up) and
[pull-up](https://www.nasm.org/resource-center/exercise-library/pull-up),
ACE's [hammer curl](https://www.acefitness.org/resources/everyone/exercise-library/10/hammer-curl/) and
[wall calf raise](https://www.acefitness.org/resources/everyone/exercise-library/73/standing-calf-raises-wall/), and
the [hanging knee raise demonstration](https://www.muscleandstrength.com/exercises/hanging-knee-raise.html).

Each snack lasts two minutes. Bilateral exercises have one set each minute; unilateral exercises have one minute
per side, which counts as one set per muscle. Finish the prescribed reps, then rest until the next minute.
Pause or finish early whenever needed. Closing the workout saves it for later on that tab; reloading restores it.
The clock uses elapsed time, including time in the background, and never awards sets by itself.

Confirm actual reps and weight for each set or side. Zero means skipped. A full timer pre-fills the target for
confirmation; finishing early starts both fields at zero. Only nonzero sets count. Each area receives full credit
for primary work and half for assisting work. This is an approximate activity map, not a requirement to train
every muscle every day. A one-sided set contributes half the credit of a completed left-and-right pair.

The next suggestion uses the lowest completed reps and weight from the last session. Good repeats that dose.
Easy adds one rep when both sets or sides were completed, up to 12 or the exercise's 40-second work allowance.
At that limit, the next available PowerBlock weight is suggested with the initial rep count. Hard lowers the
weight one setting, or removes a rep when no lighter weight is available. Discomfort and skipped sets do not
trigger progression. These are simple app rules, not a validated strength estimator; every suggestion is editable.

History shows daily activity, seven-day muscle coverage, actual sets, and weight or rep trends. The calendar opens
at the most recent days, and the selected day stays open when the log syncs. It does not infer bodyweight, a one-rep
maximum, or a percentage strength gain. Older entries stored targets only and are labeled
accordingly. Their original set credits and earned rewards remain intact, and the last prescription stays as the
starting suggestion until actual work is recorded.

## Paisano's garden

Each logged snack earns a seed and can bring a desert visitor. Three snacks bring rain and three extra seeds once
a day. Rain grows planted wildflowers, creosote, prickly pear and mesquite, which attract their own visitors.
Older whole-body and personal-best rewards are preserved when replaying the historical log.

Feed seeds to hatch and grow Paisano. Its belly holds three and digests one per hour. Tap a visitor to stalk it;
step while it looks away and wait while it looks up. Escape, another screen, or switching tabs ends the hunt
so you can try the same visitor again. Catches feed Paisano and build Speed, Stealth and Nerve.
The Desert page has the plants, traits and field guide. Rest days never remove growth or earned traits.

The bird, creatures, plants, egg and seed were generated through the OpenAI Images API with
`gpt-image-2.5-sunburst`, `quality: "max"` and transparent backgrounds. Four bird stages each have idle, running,
feeding, sleeping and happy poses. The running cycle uses two frames. Small WebP assets in `assets/` are cached
for offline use. Original PNGs, the full prompts, generation IDs and crop coordinates are in
[`output/imagegen/manifest.json`](output/imagegen/manifest.json). The app makes no image-generation API calls.

## Evidence and limits

The [2026 ACSM guidance](https://acsm.org/resistance-training-guidelines-update-2026/) emphasizes regular resistance
training across major muscle groups, individualized volume, and that training to failure is generally optional.
It does not establish that hourly two-minute lifting replaces all conventional training or aerobic activity.

The [minimal-dose resistance training review](https://pubmed.ncbi.nlm.nih.gov/38509414/) describes exercise snacks as
promising, with stronger existing support for single-set and weekend-warrior approaches. Paisano's particular
schedule, muscle-credit map, progression rules and three-snack garden bonus are design choices. The old learner's
simulation percentages are not evidence of real-world fitness outcomes and are no longer presented as such.

## Storage and development

`config.js` holds the exercises, weights, timings, animals and plants. `paisano.js` plays the exercise sprite sheets
with the browser's animation API. The interface uses Libron from `../ebis/fonts` and respects reduced motion.

The Worker stores an append-only D1 event log. Each unsent event has its own localStorage key; acknowledged events
are cached before the outbox is cleared. A Web Lock serializes same-browser sync, and event IDs deduplicate retries.
Workouts sync before the hunts that reference them, including across batches after a long offline stretch.
Sync errors remain visible with a retry button. Reconnects and tab returns retry automatically. New snacks store
the completion time, local training date (4 am boundary) and hour so delayed confirmation or travel does not
regroup them or redraw their visitor.
Legacy entries lack that metadata and still use the viewing device's timezone.

The production service worker caches the app after the first visit so it can open offline. Updates wait behind an
**Update ready** button and preserve the active snack before reloading. Service worker registration is disabled
on localhost to keep development changes immediate. Raise `version`, the `?v=` asset URLs, and the service worker
cache version together for a release. Frontend and Worker changes should be released together.

Serve the repository root, not just this folder, so the font paths work:

```sh
python3 -m http.server 8766 --directory ..
```

In a second terminal, from `paisano/worker`, with the existing password in `.dev.vars`:

```sh
npx wrangler d1 execute paisano --local --file schema.sql
npx wrangler dev --port 8789
```

Open `http://localhost:8766/paisano/`. Local requests use the local Worker and local D1. Production uses
`paisano.scottibrain.workers.dev`. The Worker rejects invalid exercise, rep, weight and event data before insertion.
No new database migration is needed. Deploy only when explicitly authorized.
