// Paisano's knobs and exercises, all in one place.

export default {
  // A snack is two sets in two minutes: the first on the minute, the second at the next. An exercise done a side at a
  // time does both sides each minute, left then right.
  minutes: 2,

  // Each area of the body is done for the day after this many sets. An exercise counts in full for the areas it works
  // most and half for those it helps, so one snack does an area it works most.
  sets: 2,

  // What each exercise learns about you: a belief about its strength (Epley's one-rep max, weight x (1 + reps / 30), or
  // for bodyweight exercises the most reps in a set), updated by each answer as in QUEST (Watson & Pelli, 1983).
  // noise: how far, in reps, an answer of reps in reserve can be off, from judgment and day-to-day form.
  // drift: how fast strength can change, in log strength per square root of a day; the belief widens by it between snacks.
  // spread: how far the first dose may be from right, in log strength.
  // reserve: the reps in reserve the first dose is taken to leave.
  noise: 1.5, drift: 0.015, spread: 0.4, reserve: 2,

  // A rough bodyweight in pounds, never logged: a squat, split squat, deadlift or calf raise moves a share of it as well
  // as the dumbbells, so a few pounds more on the dumbbell costs a rep or so, not half the set.
  body: 170,

  // Seconds of work a minute may hold, so a set leaves time to rest; with an exercise's tempo it caps the reps.
  work: 45,

  // The dumbbell's settings in pounds per hand: a PowerBlock Elite EXP, stages 1 to 3, up to the 80 lb band.
  weights: [5, 7.5, 10, 15, 17.5, 20, 25, 27.5, 30, 35, 37.5, 40, 45, 47.5, 50, 55, 57.5, 60, 65, 67.5, 70, 75, 77.5, 80],

  // Seeds for Paisano: one a snack, more for a new best and for the snack that finishes the day's whole body.
  seeds: { snack: 1, best: 2, whole: 3 },

  // Paisano grows as it eats: the seeds eaten by each stage.
  stages: [['Egg', 0], ['Hatchling', 1], ['Chick', 15], ['Fledgling', 80], ['Roadrunner', 300]],

  // Paisano's belly holds this many seeds and digests one an hour: fed a seed a snack, it's hungry when the next is due.
  belly: 3,

  areas: {
    chest: 'Chest', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps', forearms: 'Forearms', upper: 'Upper back',
    lats: 'Lats', core: 'Core', lower: 'Lower back', glutes: 'Glutes', quads: 'Quads', hamstrings: 'Hamstrings', calves: 'Calves',
  },

  // Twelve exercises for dumbbells and a pull-up bar: squat, hinge, lunge, push, press, row, pull, posture, arms, core
  // and calves. hold is how the dumbbells are held (one, a pair, or none); share is the rough share of bodyweight moved;
  // reps is a set's usual reps with dumbbells (the dose nearest it wins among equally likely ones); tempo is seconds a
  // rep; start is the first dose, as [reps, pounds], kept light since the first try is a guess. Poses are the figure at either end of a rep, as joints in a box
  // 100 wide with the floor at 95: hip, shoulder, head, then knee, ankle, toe, elbow and wrist for the near side, in
  // capitals for the far side when it differs.
  exercises: [
    {
      id: 'goblet', name: 'Goblet squat', hold: 'one', share: 0.85, reps: 10, tempo: 3, start: [10, 20], areas: { quads: 1, glutes: 0.5, core: 0.5 },
      cues: ['Hold one end of the dumbbell against your chest.', 'Sit down between your heels, chest up, knees over toes.', 'Stand up by pushing the floor away.'],
      poses: ['hip 50 51, sh 50 25, hd 51 16, kn 50 72, an 50 92, to 57.5 95, el 54 39, wr 60 27',
        'hip 39 78, sh 50 55, hd 54 46.5, kn 60 75, an 50 92, to 57.5 95, el 49 70, wr 60 61'],
    },
    {
      id: 'rdl', name: 'Romanian deadlift', hold: 'pair', share: 0.5, reps: 10, tempo: 3, start: [10, 20], areas: { hamstrings: 1, glutes: 1, lower: 1, forearms: 0.5 },
      cues: ['Dumbbells in front of your thighs, knees soft.', 'Push your hips back and slide the weights down your legs, back flat.', 'Stand when your hamstrings pull, squeezing your glutes.'],
      poses: ['hip 50 51, sh 50 25, hd 51 16, kn 51 72, an 50 92, to 57.5 95, el 52.5 39.8, wr 55 53.6',
        'hip 42 54, sh 66 45, hd 75 42, kn 53 72, an 50 92, to 57.5 95, el 66 60, wr 66 74'],
    },
    {
      id: 'split', name: 'Split squat', hold: 'pair', share: 0.85, reps: 8, tempo: 2, start: [8, 15], sides: true, areas: { quads: 1, glutes: 1 },
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
      id: 'floor', name: 'Floor press', hold: 'pair', reps: 10, tempo: 2.5, start: [10, 20], areas: { chest: 1, triceps: 1, shoulders: 0.5 },
      cues: ['Lie on your back, knees bent, a dumbbell in each hand.', 'Lower until your upper arms rest on the floor.', 'Press straight up over your chest.'],
      poses: ['hip 35 90, sh 61 90, hd 70 89, kn 25 72, an 22 92, to 14 95, el 51 93, wr 51 79',
        'hip 35 90, sh 61 90, hd 70 89, kn 25 72, an 22 92, to 14 95, el 61 75, wr 61 61'],
    },
    {
      id: 'press', name: 'Overhead press', hold: 'pair', reps: 8, tempo: 2.5, start: [8, 15], areas: { shoulders: 1, triceps: 0.5, upper: 0.5, core: 0.5 },
      cues: ['Stand tall, dumbbells at your shoulders.', 'Press straight overhead, ribs down, glutes tight.', 'Lower to your shoulders under control.'],
      poses: ['hip 50 51, sh 50 25, hd 51 16, kn 50 72, an 50 92, to 57.5 95, el 55 38, wr 56 24',
        'hip 50 51, sh 50 25, hd 51 16, kn 50 72, an 50 92, to 57.5 95, el 53 10.3, wr 55 -3.6'],
    },
    {
      id: 'row', name: 'One-arm row', hold: 'one', reps: 8, tempo: 2, start: [8, 20], sides: true, areas: { lats: 1, upper: 1, biceps: 0.5 },
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
      id: 'fly', name: 'Reverse fly', hold: 'pair', reps: 12, tempo: 2.5, start: [12, 10], front: true, areas: { upper: 1, shoulders: 0.5, lower: 0.5 },
      cues: ['Hinge forward, back flat, dumbbells hanging under your chest.', 'Raise them out to your sides, squeezing your shoulder blades.', 'Lower slowly.'],
      poses: ['hip 50 58, sh 50 47, hd 50 42.5, kn 43 75, an 43 92, to 40 95, el 40 61, wr 39.5 75, KN 57 75, AN 57 92, TO 60 95, EL 60 61, WR 60.5 75',
        'hip 50 58, sh 50 47, hd 50 42.5, kn 43 75, an 43 92, to 40 95, el 27 49, wr 14 51, KN 57 75, AN 57 92, TO 60 95, EL 73 49, WR 86 51'],
    },
    {
      id: 'curl', name: 'Hammer curl', hold: 'pair', reps: 10, tempo: 2.5, start: [10, 15], areas: { biceps: 1, forearms: 1 },
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
      id: 'calf', name: 'Calf raise', hold: 'one', share: 0.95, reps: 10, tempo: 1.5, start: [10, 15], sides: true, wall: 71, areas: { calves: 1 },
      cues: ['Stand on one foot, dumbbell in that hand, other hand on a wall.', 'Rise as high as you can onto the ball of your foot, and pause.', 'Lower slowly. Left foot, then right.'],
      poses: ['hip 50 51, sh 50 25, hd 51 16, kn 50 72, an 50 92, to 57.5 95, el 52.5 39.8, wr 54 53.7, KN 49 72, AN 33 80, TO 27 84, EL 60 38, WR 69 34',
        'hip 50 47, sh 50 21, hd 51 12, kn 50 68, an 50 88, to 53 95, el 52.5 35.8, wr 54 49.7, KN 49 68, AN 33 76, TO 27 80, EL 60 34, WR 69 34'],
    },
  ],

  // Paisano's version, shown beside the logo so each device shows which code it runs. Raised with every update.
  version: 2,
};
