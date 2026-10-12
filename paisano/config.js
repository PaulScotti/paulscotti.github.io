// Paisano's knobs and exercises, all in one place.

export default {
  // Two minutes: one set each minute, or one minute per side. Rest after the prescribed reps.
  minutes: 2,
  work: 40,
  maxReps: 12,

  // The body's color scale is a record of today's work, not a daily training requirement.
  sets: 2,

  // The dumbbell's settings in pounds per hand: a PowerBlock Elite EXP, stages 1 to 3, up to the 80 lb band.
  weights: [5, 7.5, 10, 15, 17.5, 20, 25, 27.5, 30, 35, 37.5, 40, 45, 47.5, 50, 55, 57.5, 60, 65, 67.5, 70, 75, 77.5, 80],

  // Three snacks bring rain once a day. best and whole preserve rewards from versions 1–3.
  rainAt: 3,
  seeds: { snack: 1, day: 3, best: 2, whole: 3 },

  // Paisano grows as it eats: the food eaten by each stage, a seed being one and a creature its size.
  stages: [['Egg', 0], ['Hatchling', 1], ['Chick', 15], ['Fledgling', 80], ['Roadrunner', 300]],

  // Paisano's belly holds this many seeds and digests one an hour: fed a seed a snack, it's hungry when the next is due.
  belly: 3,

  // Each snack brings a visitor to the garden: a creature that's out at that hour, drawn by its odds; the rain bonus
  // draws twice and keeps the rarer. Some come only to a plant that's grown, some only on a day it rained,
  // and three snacks bring rain once a day.
  times: { morning: [6, 11], midday: [11, 15], afternoon: [15, 18], evening: [18, 22] },
  odds: { common: 4, uncommon: 2, rare: 1 },

  // Seeds can be planted instead of fed: a plant costs seeds, grows with each rain, and once grown brings its visitor.
  // x is where it grows in the garden.
  plants: [
    { id: 'flowers', name: 'Wildflowers', cost: 5, rains: 1, x: 182 },
    { id: 'creosote', name: 'Creosote bush', cost: 10, rains: 2, x: 318 },
    { id: 'prickly', name: 'Prickly pear', cost: 15, rains: 3, x: 252 },
    { id: 'mesquite', name: 'Mesquite', cost: 25, rains: 4, x: 116 },
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

  // Twelve exercises using the available equipment. hold is one dumbbell, a pair, or none. share preserves old rewards
  // and identifies exercises that also work without dumbbells. tempo is seconds per rep; start is the initial suggestion [reps, pounds]. Poses are the figure at either end of a rep, as joints in a box
  // 100 wide with the floor at 95: hip, shoulder, head, then knee, ankle, toe, elbow and wrist for the near side, in
  // capitals for the far side when it differs.
  exercises: [
    {
      id: 'goblet', name: 'Goblet squat', hold: 'one', share: 0.85, tempo: 3, start: [10, 20], areas: { quads: 1, glutes: 0.5, core: 0.5 },
      cues: ['Use a secure two-hand grip with one dumbbell close to your chest.', 'Sit down between your heels, chest up, knees over toes.', 'Stand up by pushing the floor away.'],
      poses: ['hip 50 51, sh 50 25, hd 51 16, kn 50 72, an 50 92, to 57.5 95, el 54 39, wr 60 27',
        'hip 39 78, sh 50 55, hd 54 46.5, kn 60 75, an 50 92, to 57.5 95, el 49 70, wr 60 61'],
    },
    {
      id: 'rdl', name: 'Romanian deadlift', hold: 'pair', share: 0.5, tempo: 3, start: [10, 20], areas: { hamstrings: 1, glutes: 1, lower: 1, forearms: 0.5 },
      cues: ['Dumbbells in front of your thighs, knees soft.', 'Push your hips back and slide the weights down your legs, back flat.', 'Stop lowering when you feel a hamstring stretch, then stand tall.'],
      poses: ['hip 50 51, sh 50 25, hd 51 16, kn 51 72, an 50 92, to 57.5 95, el 52.5 39.8, wr 55 53.6',
        'hip 42 54, sh 66 45, hd 75 42, kn 53 72, an 50 92, to 57.5 95, el 66 60, wr 66 74'],
    },
    {
      id: 'split', name: 'Split squat', hold: 'pair', share: 0.85, tempo: 2, start: [8, 15], sides: true, areas: { quads: 1, glutes: 1 },
      cues: ['Stand a long stride apart, weights at your sides.', 'Drop your back knee straight down to just above the floor.', 'Push up through your front heel. Left leg in front, then right.'],
      poses: ['hip 45 55, sh 45.5 29, hd 46.5 20, kn 54 73, an 62 92, to 69.5 95, el 47.5 43.8, wr 50 57.6, KN 36 72, AN 26 89, TO 32 95',
        'hip 44 69, sh 44.5 43, hd 45.5 34, kn 63 74, an 62 92, to 69.5 95, el 46.5 57.8, wr 49 71.6, KN 45 88, AN 26 89, TO 32 95'],
    },
    {
      id: 'pushup', name: 'Push-up', hold: 'none', tempo: 2, start: [8], areas: { chest: 1, shoulders: 0.5, triceps: 0.5, core: 0.5 },
      cues: ['Hands under your shoulders, body in one straight line.', 'Lower until your chest nearly touches the floor, elbows angled back.', 'Press the floor away.'],
      poses: ['hip 50.5 74, sh 75 65, hd 83.5 62, kn 31 81, an 12 88, to 15 95, el 75 80, wr 75 94',
        'hip 53 85.5, sh 79 84, hd 88 83.5, kn 32 87, an 12 88, to 15 95, el 69 86, wr 75 94'],
    },
    {
      id: 'floor', name: 'Floor press', hold: 'pair', tempo: 2.5, start: [10, 20], areas: { chest: 1, triceps: 1, shoulders: 0.5 },
      cues: ['Lie on your back, knees bent, a dumbbell in each hand.', 'Lower until your upper arms rest on the floor.', 'Press straight up over your chest.'],
      poses: ['hip 35 90, sh 61 90, hd 70 89, kn 25 72, an 22 92, to 14 95, el 51 93, wr 51 79',
        'hip 35 90, sh 61 90, hd 70 89, kn 25 72, an 22 92, to 14 95, el 61 75, wr 61 61'],
    },
    {
      id: 'press', name: 'Overhead press', hold: 'pair', tempo: 2.5, start: [8, 15], areas: { shoulders: 1, triceps: 0.5, upper: 0.5, core: 0.5 },
      cues: ['Stand tall, dumbbells at your shoulders.', 'Press straight overhead, ribs down, glutes tight.', 'Lower to your shoulders under control.'],
      poses: ['hip 50 51, sh 50 25, hd 51 16, kn 50 72, an 50 92, to 57.5 95, el 55 38, wr 56 24',
        'hip 50 51, sh 50 25, hd 51 16, kn 50 72, an 50 92, to 57.5 95, el 53 10.3, wr 55 -3.6'],
    },
    {
      id: 'row', name: 'One-arm row', hold: 'one', tempo: 2, start: [8, 20], sides: true, areas: { lats: 1, upper: 1, biceps: 0.5 },
      cues: ['Step one foot forward and rest that hand on your thigh, back flat.', 'Pull the dumbbell to your hip, elbow close.', 'Lower to a straight arm. Left arm, then right.'],
      poses: ['hip 44 56, sh 64 40, hd 72 36, kn 38 74, an 32 92, to 39.5 95, el 64 55, wr 64 69, KN 57 72, AN 62 92, TO 69.5 95, EL 61 53, WR 55 66',
        'hip 44 56, sh 64 40, hd 72 36, kn 38 74, an 32 92, to 39.5 95, el 50 45, wr 50 59, KN 57 72, AN 62 92, TO 69.5 95, EL 61 53, WR 55 66'],
    },
    {
      id: 'pullup', name: 'Pull-up', hold: 'none', tempo: 3, start: [3], bar: -16, areas: { lats: 1, upper: 0.5, biceps: 0.5, forearms: 0.5 },
      cues: ['Hang with your hands a little wider than your shoulders, palms away.', 'Pull your chest toward the bar, shoulders down.', 'Lower all the way to straight arms.'],
      poses: ['hip 52 41, sh 54 15, hd 59 7, kn 50 62, an 43 80, to 47 86, el 54.5 0.5, wr 55 -14',
        'hip 50 9, sh 51 -17, hd 56 -25, kn 48 30, an 41 48, to 45 54, el 61 -6, wr 55 -14'],
    },
    {
      id: 'fly', name: 'Reverse fly', hold: 'pair', tempo: 2.5, start: [12, 10], front: true, areas: { upper: 1, shoulders: 0.5, lower: 0.5 },
      cues: ['Hinge forward, back flat, dumbbells hanging under your chest.', 'Raise them out to your sides, squeezing your shoulder blades.', 'Lower slowly.'],
      poses: ['hip 50 58, sh 50 47, hd 50 42.5, kn 43 75, an 43 92, to 40 95, el 40 61, wr 39.5 75, KN 57 75, AN 57 92, TO 60 95, EL 60 61, WR 60.5 75',
        'hip 50 58, sh 50 47, hd 50 42.5, kn 43 75, an 43 92, to 40 95, el 27 49, wr 14 51, KN 57 75, AN 57 92, TO 60 95, EL 73 49, WR 86 51'],
    },
    {
      id: 'curl', name: 'Hammer curl', hold: 'pair', tempo: 2.5, start: [10, 15], areas: { biceps: 1, forearms: 1 },
      cues: ['Stand tall, palms facing your legs.', 'Curl both dumbbells up, elbows still at your sides.', 'Lower all the way down.'],
      poses: ['hip 50 51, sh 50 25, hd 51 16, kn 50 72, an 50 92, to 57.5 95, el 53 39.7, wr 55 53.6',
        'hip 50 51, sh 50 25, hd 51 16, kn 50 72, an 50 92, to 57.5 95, el 53 39.7, wr 61.5 28.6'],
    },
    {
      id: 'knees', name: 'Hanging knee raise', hold: 'none', tempo: 2.5, start: [8], bar: -16, areas: { core: 1, forearms: 0.5 },
      cues: ['Hang from the bar, shoulders down.', 'Raise your knees to your chest, curling your hips up.', 'Lower slowly, without swinging.'],
      poses: ['hip 52 41, sh 53 15, hd 58 7, kn 52 62, an 52 82, to 55 88, el 53.5 0.5, wr 54 -14',
        'hip 54 40, sh 52 14, hd 57 6, kn 73 35, an 68 54, to 72 60, el 53 0, wr 54 -14'],
    },
    {
      id: 'calf', name: 'Calf raise', hold: 'one', share: 0.95, tempo: 3, start: [10, 15], sides: true, wall: 71, areas: { calves: 1 },
      cues: ['Stand on one foot, dumbbell in that hand, other hand on a wall.', 'Rise onto the ball of your foot with control and pause.', 'Lower slowly. Left foot, then right.'],
      poses: ['hip 50 51, sh 50 25, hd 51 16, kn 50 72, an 50 92, to 57.5 95, el 52.5 39.8, wr 54 53.7, KN 49 72, AN 33 80, TO 27 84, EL 60 38, WR 69 34',
        'hip 50 47, sh 50 21, hd 51 12, kn 50 68, an 50 88, to 53 95, el 52.5 35.8, wr 54 49.7, KN 49 68, AN 33 76, TO 27 80, EL 60 34, WR 69 34'],
    },
  ],

  // Paisano's version, shown beside the logo so each device shows which code it runs. Raised with every update.
  version: 4,
};
