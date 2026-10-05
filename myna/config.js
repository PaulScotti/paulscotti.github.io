// Myna's knobs, all in one place. The app reads this file in the browser and the worker bundles it.

export default {
  // The OpenAI model that picks new words and writes how each card is asked as it climbs.
  model: 'gpt-6.1-sol',
  effort: 'low',

  // Voices for each language, from Azure's MAI-Voice-2.1.
  voices: { ko: 'ko-KR-Haena:MAI-Voice-2.1', en: 'en-US-Harper:MAI-Voice-2.1' },

  // New words a day: the most when nothing is due, one fewer for every few reviews, never below the least.
  newWords: { most: 10, least: 1, reviewsEach: 10 },

  // How likely a card should still be remembered on the day it comes back (FSRS's desired retention).
  retention: 0.9,

  // How long to recall the answer before Myna says it: these seconds, plus this many times as long as the question took to say.
  think: { seconds: 1, times: 1.5 },

  // How a card is asked at each level, picked at random from its list. A card goes up a level each time
  // the number of days it can be remembered doubles: level 2 at 2 days, 3 at 4, 4 at 8, and so on to
  // 9 at 256 days, which is mastered and never asked again. Level 0 is a word not yet met.
  levels: {
    1: ['word'],
    2: ['word'],
    3: ['word', 'inflected'],
    4: ['inflected'],
    5: ['inflected', 'phrase'],
    6: ['phrase'],
    7: ['phrase', 'sentence'],
    8: ['sentence'],
  },
  forms: {
    inflected: 'the word on its own in another everyday form: a verb or adjective in another tense, mood or politeness; a noun with a particle or a word it often goes with',
    phrase: 'a short phrase pairing the word with one or two words the learner knows',
    sentence: 'a natural spoken sentence using the word with several words the learner knows, with more varied grammar',
  },

  // The Android app's version. Raise it after changing android/ and rebuilding; the app then offers the update.
  apk: 1,
};
