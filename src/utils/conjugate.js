/**
 * Japanese verb conjugation — dictionary form + polite present ("ます" form).
 *
 * Neither kanjiapi nor Jisho returns conjugated forms, but the polite present
 * is fully rule-based and Jisho's `parts_of_speech` tells us the verb class, so
 * we compute it ourselves. The ます-form is the most regular conjugation, which
 * keeps this reliable.
 *
 * This module is intentionally dependency-free and pure — easy to unit test.
 */

// Godan (五段) verbs: shift the final う-row kana up to its い-row counterpart,
// then add ます. e.g. 飲む → 飲み + ます, 帰る → 帰り + ます.
const GODAN_STEM = {
  'う': 'い', 'く': 'き', 'ぐ': 'ぎ', 'す': 'し', 'つ': 'ち',
  'ぬ': 'に', 'ぶ': 'び', 'む': 'み', 'る': 'り',
};

/**
 * Identify a verb's class from Jisho parts_of_speech strings.
 * Returns 'ichidan' | 'godan' | 'suru' | 'kuru' | null (not a verb).
 */
export function detectVerbClass(partsOfSpeech = []) {
  const pos = partsOfSpeech.map((p) => p.toLowerCase());
  const has = (needle) => pos.some((p) => p.includes(needle));

  if (has('kuru verb')) return 'kuru';
  if (has('suru verb') || has('auxiliary verb suru')) return 'suru';
  if (has('ichidan verb')) return 'ichidan';
  if (has('godan verb')) return 'godan';
  return null;
}

/** Apply the polite ます ending to a word/reading string for the given class. */
function toPolite(str, verbClass) {
  if (!str) return null;
  switch (verbClass) {
    case 'ichidan':
      return str.endsWith('る') ? str.slice(0, -1) + 'ます' : null;
    case 'godan': {
      const stem = GODAN_STEM[str.slice(-1)];
      return stem ? str.slice(0, -1) + stem + 'ます' : null;
    }
    case 'kuru':
      // Surface form 来る → 来ます; kana reading くる → きます (irregular).
      if (str === 'くる') return 'きます';
      return str.endsWith('る') ? str.slice(0, -1) + 'ます' : null;
    case 'suru':
      // する → します; otherwise it's a suru-noun → append します.
      return str.endsWith('する') ? str.slice(0, -2) + 'します' : str + 'します';
    default:
      return null;
  }
}

/** The dictionary form. Suru-nouns (勉強) get する appended; others are as-is. */
function toBase(str, verbClass) {
  if (!str) return null;
  if (verbClass === 'suru' && !str.endsWith('する')) return str + 'する';
  return str;
}

/**
 * Given a normalised word entry (see src/api/words.js), return its verb forms
 * or null if it isn't a verb.
 *
 * Shape: { class, base: { word, reading }, polite: { word, reading } }
 */
export function getVerbForms(wordData) {
  if (!wordData) return null;

  const partsOfSpeech = (wordData.senses || []).flatMap((s) => s.partsOfSpeech || []);
  const verbClass = detectVerbClass(partsOfSpeech);
  if (!verbClass) return null;

  const politeWord = toPolite(wordData.word, verbClass);
  // If we couldn't conjugate (unexpected shape), show nothing rather than guess.
  if (!politeWord) return null;

  return {
    class: verbClass,
    base: {
      word: toBase(wordData.word, verbClass),
      reading: toBase(wordData.reading, verbClass),
    },
    polite: {
      word: politeWord,
      reading: toPolite(wordData.reading, verbClass),
    },
  };
}
