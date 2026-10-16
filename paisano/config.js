// Paisano's knobs and exercises, all in one place.

export default {
  // A snack is one set (a set a side for one-sided exercises), as many reps as you can, to failure with good form.
  // The next weight is the one expected to land nearest 8 to 15 reps.
  reps: [8, 15],

  // A rough bodyweight in pounds, never logged: a squat, split squat, deadlift or calf raise also moves a share of it,
  // which keeps the reps to expect after a weight change sensible (Epley: load x (1 + reps / 30) is the same strength).
  body: 170,

  // The sets that color an area fully on the day's body: a record of today's work, not a requirement.
  sets: 1,

  // The dumbbell's settings in pounds per hand: a PowerBlock Elite EXP, stages 1 to 3, up to the 80 lb band.
  weights: [5, 7.5, 10, 15, 17.5, 20, 25, 27.5, 30, 35, 37.5, 40, 45, 47.5, 50, 55, 57.5, 60, 65, 67.5, 70, 75, 77.5, 80],

  // Seeds: a snack's ripen one every `ripen` minutes after the last snack, up to `snack`, so one right after another
  // earns none. A ripe snack earns one more for more reps than expected and one for hitting the pachinko seed.
  ripen: 15,
  seeds: { snack: 2, beat: 1, pachinko: 1 },

  // The day's third snack brings rain, and plants grow with each rain.
  rainAt: 3,

  // Paisano grows as it eats: the food eaten by each stage, a seed being one and a creature its size.
  stages: [['Egg', 0], ['Hatchling', 1], ['Chick', 20], ['Fledgling', 150], ['Roadrunner', 600]],

  // Paisano's belly holds this many seeds and digests one an hour: fed a seed a snack, it's hungry when the next is due.
  belly: 3,

  // Each snack brings a visitor to the garden: a creature that's out at that hour, drawn by its odds; the snack that
  // brings rain or beats the reps expected draws twice and keeps the rarer. Some come only to a plant that's grown,
  // some only on a day it rained.
  times: { morning: [6, 11], midday: [11, 15], afternoon: [15, 18], evening: [18, 22] },
  odds: { common: 4, uncommon: 2, rare: 1 },

  // Seeds can be planted instead of fed: a plant costs seeds and grows with each rain. Each brings someone: a creature
  // to stalk once it's grown, or a friend as soon as it's planted. x is where it grows; later plants stand behind. With
  // snacks about an hour apart on weekdays, a simulated player grows them around days 1, 2, 5, 9, 15, 25, 36 and 55.
  plants: [
    { id: 'flowers', name: 'Wildflowers', cost: 6, rains: 1, x: 182 },
    { id: 'marigold', name: 'Desert marigold', cost: 12, rains: 1, x: 72 },
    { id: 'creosote', name: 'Creosote bush', cost: 20, rains: 2, x: 318 },
    { id: 'brittlebush', name: 'Brittlebush', cost: 32, rains: 2, x: 284 },
    { id: 'prickly', name: 'Prickly pear', cost: 48, rains: 3, x: 252 },
    { id: 'ocotillo', name: 'Ocotillo', cost: 70, rains: 3, x: 212 },
    { id: 'mesquite', name: 'Mesquite', cost: 100, rains: 4, x: 116 },
    { id: 'paloverde', name: 'Palo verde', cost: 140, rains: 5, x: 346 },
  ],

  // Each friend comes with its plant, even while it's a sprout.
  friends: [
    { id: 'quail', name: 'Pip', kind: 'Quail', plant: 'marigold', x: 58, y: 140, action: 'Whistle with Pip', greeting: 'Pip whistles a hello.', habit: 'Whistles, then waits for Paisano to answer.' },
    { id: 'rabbit', name: 'Juniper', kind: 'Jackrabbit', plant: 'brittlebush', x: 304, y: 140, action: 'Hop with Juniper', greeting: 'Juniper invites Paisano to hop along.', habit: 'Shows off three hops. Paisano joins in.' },
    { id: 'tortoise', name: 'Pebble', kind: 'Desert tortoise', plant: 'ocotillo', x: 139, y: 143, action: 'Play peekaboo with Pebble', greeting: 'Pebble hides, then peeks out at Paisano.', habit: 'Tucks into its shell for a game of peekaboo.' },
    { id: 'fox', name: 'Sombra', kind: 'Kit fox', plant: 'paloverde', x: 230, y: 145, action: 'Relax with Sombra', greeting: 'Sombra takes a bow, then curls up beside Paisano.', habit: 'A playful bow, then a little nap together.' },
  ],

  // Paisano stalks a visitor by stepping closer while it looks away: it looks away for `busy` seconds at a time,
  // twitches, then looks up for `look` seconds (1 to 2 if not given), buzzing while it's busy or rattling while it looks
  // if it has a `sound`. Catching one is a meal of its size and builds a trait: Speed for longer, quicker steps,
  // Stealth for a moment's grace when it looks up, Nerve for stings and fangs. A trait reaches level n at n(n + 1) / 2
  // points. size 2 takes a chick and 3 a fledgling; nerve is the Nerve it takes.
  traits: { speed: 'Speed', stealth: 'Stealth', nerve: 'Nerve' },
  creatures: [
    { id: 'stink', name: 'Stink beetle', times: ['morning', 'evening'], odds: 'common', size: 1, busy: [2.5, 5], gain: { nerve: 1 },
      fact: 'Threatened, it stands on its head and sprays a foul-smelling liquid from its rear.' },
    { id: 'uta', name: 'Side-blotched lizard', times: ['morning', 'afternoon'], odds: 'common', size: 1, busy: [1.2, 3], gain: { speed: 1 },
      fact: 'Males come with orange, blue or yellow throats, three ways of winning mates that beat each other like rock, paper, scissors.' },
    { id: 'whiptail', name: 'Desert grassland whiptail', times: ['midday'], odds: 'uncommon', size: 2, busy: [0.8, 2], gain: { speed: 2 },
      fact: 'Every one is female: they lay eggs that hatch without any males.' },
    { id: 'zebra', name: 'Zebra-tailed lizard', times: ['midday'], odds: 'uncommon', size: 2, busy: [0.6, 1.6], gain: { speed: 3 },
      fact: 'It sprints on its hind legs, then stops and wags its black-and-white tail at whatever is chasing it.' },
    { id: 'horned', name: 'Regal horned lizard', times: ['morning', 'midday'], odds: 'rare', size: 2, busy: [3, 6], gain: { stealth: 3 },
      fact: 'It can squirt blood from its eyes, which tastes foul to coyotes but does nothing to birds. Roadrunners swallow it head first.' },
    { id: 'centipede', name: 'Giant desert centipede', times: ['evening'], odds: 'uncommon', size: 2, nerve: 2, busy: [1.2, 2.5], gain: { nerve: 2 },
      fact: 'Up to 8 inches long, it bites with fangs that are its first pair of legs, reshaped.' },
    { id: 'scorpion', name: 'Arizona bark scorpion', times: ['evening'], odds: 'uncommon', size: 2, nerve: 3, busy: [1.5, 3], gain: { nerve: 2 },
      fact: 'Like every scorpion, it glows blue-green under ultraviolet light.' },
    { id: 'rattler', name: 'Western diamondback', times: ['afternoon', 'evening'], odds: 'rare', size: 3, nerve: 6, busy: [1, 2.5], look: [1.5, 3], sound: 'rattle', gain: { nerve: 4 },
      fact: 'Its rattle gains a segment each time it sheds, a few times a year, so the rattle can’t tell its age.' },
    { id: 'clicker', name: 'Desert clicker', plant: 'creosote', times: ['morning', 'midday', 'afternoon'], odds: 'common', size: 1, busy: [1.2, 2.8], gain: { stealth: 1 },
      fact: 'A grasshopper that lives on creosote: each male holds a bush and clicks from it to claim it.' },
    { id: 'cicada', name: 'Apache cicada', plant: 'mesquite', times: ['midday', 'afternoon'], odds: 'common', size: 1, busy: [1.5, 3.5], sound: 'buzz', gain: { stealth: 2 },
      fact: 'It sings through the hottest hours and keeps cool by sweating, drinking the water back from the plant it feeds on.' },
    { id: 'sphinx', name: 'White-lined sphinx', plant: 'flowers', times: ['morning', 'afternoon', 'evening'], odds: 'common', size: 1, busy: [3, 6], gain: { stealth: 1 },
      fact: 'After wet winters its caterpillars can cross the desert by the thousands, eating wildflowers. The moth hovers at flowers like a hummingbird.' },
    { id: 'longhorn', name: 'Cactus longhorn beetle', plant: 'prickly', times: ['morning', 'afternoon'], odds: 'common', size: 1, busy: [2, 4], gain: { nerve: 1 },
      fact: 'It can’t fly and eats only cactus, and it looks and acts much like a stink beetle, which predators learn to leave alone.' },
    { id: 'spadefoot', name: 'Couch’s spadefoot', rain: true, times: ['morning', 'midday', 'afternoon', 'evening'], odds: 'common', size: 2, busy: [1.5, 3], gain: { stealth: 2 },
      fact: 'It stays buried most of the year and comes up with the summer rains; its tadpoles can become toads in about 8 days.' },
    { id: 'paloverde', name: 'Palo verde beetle', rain: true, times: ['afternoon', 'evening'], odds: 'uncommon', size: 2, busy: [2, 4], gain: { nerve: 2 },
      fact: 'Its grubs eat tree roots underground for three years or more; the adults come out with the monsoon rains, never eat, and live about a month.' },
  ],

  areas: {
    chest: 'Chest', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', upper: 'Upper back',
    lats: 'Lats', core: 'Core', lower: 'Lower back', glutes: 'Glutes', quads: 'Quads', hamstrings: 'Hamstrings', calves: 'Calves',
  },

  // Twelve exercises using the available equipment. hold is one dumbbell, a pair, or none. share is the rough share of
  // bodyweight moved; exercises with one also work without dumbbells. tempo is seconds per rep; start is the first
  // suggestion, as [reps to expect, pounds].
  exercises: [
    {
      id: 'goblet', name: 'Goblet squat', hold: 'one', share: 0.85, tempo: 3, start: [10, 20], areas: { quads: 1, glutes: 0.5, core: 0.5 },
      cues: ['Support one PowerBlock securely with both hands, close to your chest.', 'Sit down between your heels; keep your heels planted and knees tracking your toes.', 'Press through your whole foot to stand.'],
      bodyCue: 'Feet a little wider than your hips, hands together at your chest.',
    },
    {
      id: 'rdl', name: 'Romanian deadlift', hold: 'pair', share: 0.5, tempo: 3, start: [10, 20], areas: { hamstrings: 1, glutes: 1, lower: 1, forearms: 0.5 },
      cues: ['Feet hip-width apart, knees soft, dumbbells close to your thighs.', 'Send your hips back, keeping your back long and your knee bend small.', 'Stop at a hamstring stretch, then bring your hips forward to stand.'],
      bodyCue: 'Feet hip-width apart, knees soft, arms hanging freely.',
    },
    {
      id: 'split', name: 'Split squat', hold: 'pair', share: 0.85, tempo: 2, start: [8, 15], sides: true, areas: { quads: 1, glutes: 1 },
      cues: ['Take a split stance, back heel up, weights at your sides.', 'Keep both feet in place as you lower your back knee toward the floor.', 'Press through your whole front foot. Left leg in front, then right.'],
      bodyCue: 'Take a split stance, back heel up and hands by your sides.',
    },
    {
      id: 'pushup', name: 'Push-up', hold: 'none', tempo: 2, start: [8], areas: { chest: 1, shoulders: 0.5, triceps: 0.5, core: 0.5 },
      cues: ['Hands just wider than your shoulders; keep your head, hips and heels in line.', 'Lower your chest toward the floor, elbows angled back about 30–45°.', 'Press the floor away, moving your body as one piece.'],
    },
    {
      id: 'floor', name: 'Floor press', hold: 'pair', tempo: 2.5, start: [10, 20], areas: { chest: 1, triceps: 1, shoulders: 0.5 },
      cues: ['Lie on the floor, knees bent, feet flat and palms facing each other.', 'Lower until your upper arms touch the floor; keep wrists above elbows.', 'Press above your chest. Keep your head and hips down.'],
    },
    {
      id: 'press', name: 'Overhead press', hold: 'pair', tempo: 2.5, start: [8, 15], areas: { shoulders: 1, triceps: 0.5, upper: 0.5, core: 0.5 },
      cues: ['Stand tall, weights at your shoulders, palms facing each other.', 'Press overhead with ribs over hips; avoid leaning back or dipping your knees.', 'Lower with control, keeping your wrists above your elbows.'],
    },
    {
      id: 'row', name: 'One-arm row', hold: 'one', tempo: 2, start: [8, 20], sides: true, areas: { lats: 1, upper: 1, biceps: 0.5 },
      cues: ['Step the opposite foot forward; brace your free hand on that thigh and hinge forward.', 'Pull the weight toward your hip, elbow close and torso still.', 'Lower to a straight arm. Left arm, then right.'],
    },
    {
      id: 'pullup', name: 'Pull-up', hold: 'none', tempo: 3, start: [3], areas: { lats: 1, upper: 0.5, biceps: 0.5, forearms: 0.5 },
      cues: ['Grip just wider than your shoulders, palms away, feet off the floor.', 'Pull your elbows down until your chin clears the bar, without kicking.', 'Lower with control to straight arms.'],
    },
    {
      id: 'fly', name: 'Reverse fly', hold: 'pair', tempo: 2.5, start: [12, 10], areas: { upper: 1, shoulders: 0.5, lower: 0.5 },
      cues: ['Hinge forward with a long back, soft knees and weights below your shoulders.', 'Keep a small bend in your elbows as you open your arms to shoulder height.', 'Lower slowly; keep your torso still and gaze toward the floor.'],
    },
    {
      id: 'curl', name: 'Hammer curl', hold: 'pair', tempo: 2.5, start: [10, 15], areas: { biceps: 1, forearms: 1 },
      cues: ['Stand tall, palms facing inward and wrists straight.', 'Curl both weights toward your shoulders; keep your elbows beside your ribs.', 'Lower to straight arms without swinging or turning your palms upward.'],
    },
    {
      id: 'knees', name: 'Hanging knee raise', hold: 'none', tempo: 2.5, start: [8], areas: { core: 1, forearms: 0.5 },
      cues: ['Hang from the bar with straight arms and a still body.', 'Bend and lift both knees, gently curling your pelvis toward your ribs.', 'Lower slowly without swinging; keep your arms straight.'],
    },
    {
      id: 'calf', name: 'Calf raise', hold: 'one', share: 0.95, tempo: 3, start: [10, 15], sides: true, areas: { calves: 1 },
      cues: ['Stand on one foot, weight in that hand, opposite hand lightly on a wall.', 'Keep your knee straight and lift your heel onto the ball of your foot. Pause.', 'Lower your heel to the floor. Left foot, then right.'],
      bodyCue: 'Stand on one foot with the opposite hand resting lightly on a wall.',
    },
  ],

  // Paisano's version, shown beside the logo so each device shows which code it runs. Raised with every update.
  version: 20,
};
