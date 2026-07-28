import { getDefaultSRSState } from './srs';
import { getVerbForms } from './conjugate';

/**
 * Cards come in two flavours now:
 *   - 'kanji' — a single character (from the kanji lookup)
 *   - 'word'  — a vocabulary entry (from the Jisho word lookup)
 *
 * Both share the same SRS fields and the same { id, type, key, front, back }
 * shape so the deck/study code can treat them uniformly. `front` is what shows
 * on the front of the flashcard; `back` holds what's revealed on flip.
 *
 * `key` is a stable identity used to prevent adding the same item twice.
 *   - kanji: the character itself (e.g. "食")
 *   - word:  "word::reading" (e.g. "食べる::たべる")
 */

/**
 * Stable dedupe key for a source item about to be turned into a card.
 * @param {object} item - kanji data or normalised word data
 * @param {'kanji'|'word'} type
 */
export function sourceKey(item, type) {
  if (type === 'word') {
    return `${item.word}::${item.reading || ''}`;
  }
  return item.kanji;
}

/** Stable dedupe key for an EXISTING card. */
export function getCardKey(card) {
  return card.key;
}

/**
 * The kanji-specific card fields, from enriched kanji API data.
 * `front` is the kanji; `back` holds the readings/meanings shown after a flip.
 */
function kanjiFields(kanjiData) {
  return {
    kanji: kanjiData.kanji,
    front: kanjiData.kanji,
    back: {
      meanings: (kanjiData.meanings || []).join(', '),
      onyomi: (kanjiData.on_readings || []).join('、'),
      kunyomi: (kanjiData.kun_readings || []).join('、'),
    },
    jlpt: kanjiData.jlpt,
    grade: kanjiData.grade,
  };
}

/**
 * The word-specific card fields, from normalised word data (see
 * src/api/words.js). Recognition direction: `front` is the Japanese word,
 * `back` reveals the reading and meanings — matching how kanji cards work.
 */
function wordFields(wordData) {
  return {
    word: wordData.word,
    reading: wordData.reading,
    front: wordData.word,
    back: {
      // Flatten the first few senses into a readable string.
      meanings: (wordData.meanings || []).join(', '),
      reading: wordData.reading || '',
      // For verbs, store the conjugated forms so the flashcard back can show
      // them. null for non-verbs. Computed once at add time.
      verbForms: getVerbForms(wordData),
    },
    // Word JLPT comes as an array (e.g. ["N5"]); keep the first level for display.
    jlpt: wordData.jlpt?.[0] || null,
  };
}

/**
 * Build a flashcard of either type. The shared shape (id, type, key, SRS
 * state, addedAt) lives here; the type-specific fields come from
 * kanjiFields/wordFields above.
 *
 * @param {object} item - kanji data or normalised word data
 * @param {'kanji'|'word'} type - defaults to 'kanji', matching sourceKey's fallback
 */
export function createCard(item, type = 'kanji') {
  return {
    id: crypto.randomUUID(),
    type,
    key: sourceKey(item, type),
    ...(type === 'word' ? wordFields(item) : kanjiFields(item)),
    ...getDefaultSRSState(),
    addedAt: new Date().toISOString(),
  };
}

/* -------------------------------------------------------------------------- */
/* Custom definitions                                                          */
/*                                                                             */
/* A user can reword a card's meanings into their own language. We keep the    */
/* dictionary's original text alongside the edit so it can always be restored. */
/* All three helpers are pure and return a NEW `back` object — they never      */
/* mutate the one passed in, since it belongs to React state.                  */
/*                                                                             */
/* This lives in `back`, which is an a.json() field, so none of it needs a     */
/* schema change.                                                              */
/* -------------------------------------------------------------------------- */

/** True when this card's meanings have been edited away from the original. */
export function hasCustomMeanings(back) {
  return Boolean(back && back.originalMeanings != null);
}

/**
 * Apply an edited definition, preserving the dictionary's original text.
 *
 * `originalMeanings` is only recorded on the FIRST edit — otherwise a second
 * edit would overwrite the true original with the first edit, and "revert"
 * would take the user back to their own earlier wording instead of the
 * dictionary's.
 *
 * @param {object} back      the card's current back object
 * @param {string} meanings  the new definition text
 */
export function applyCustomMeanings(back, meanings) {
  const current = back || {};
  return {
    ...current,
    meanings,
    originalMeanings: hasCustomMeanings(current)
      ? current.originalMeanings
      : current.meanings ?? '',
  };
}

/**
 * Restore the dictionary's original definition and drop the custom one.
 * A no-op (returns an equivalent object) if there was no edit to undo.
 */
export function revertMeanings(back) {
  const current = back || {};
  if (!hasCustomMeanings(current)) return { ...current };

  // Pull originalMeanings off the object rather than setting it to null, so a
  // reverted card is indistinguishable from one that was never edited.
  const { originalMeanings, ...rest } = current;
  return { ...rest, meanings: originalMeanings };
}
