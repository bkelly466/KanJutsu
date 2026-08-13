import { getDefaultSRSState } from './srs';
import { getVerbForms } from './conjugate';

/**
 * Building flashcards. Two types — 'kanji' (a single character) and 'word' (a
 * vocabulary entry) — sharing one { id, type, key, front, back } shape plus the
 * SRS fields, so deck and study code treats them uniformly.
 *
 * `front` shows on the front of the card; `back` is revealed on flip.
 */

/**
 * Stable identity for a source item, used to stop the same item being added
 * twice. A kanji keys on the character ("食"), a word on "word::reading"
 * ("食べる::たべる").
 *
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

/** The kanji-specific card fields, from enriched kanji API data. */
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
 * The word-specific card fields, from normalised word data (src/api/words.js).
 * Recognition direction, matching kanji cards: the Japanese word on the front,
 * reading and meanings on the back.
 */
function wordFields(wordData) {
  return {
    word: wordData.word,
    reading: wordData.reading,
    front: wordData.word,
    back: {
      meanings: (wordData.meanings || []).join(', '),
      reading: wordData.reading || '',
      // Conjugations for the card back, computed once at add time. null for
      // anything that isn't a verb.
      verbForms: getVerbForms(wordData),
    },
    // Word JLPT arrives as an array (["N5"]); one level is all the card shows.
    jlpt: wordData.jlpt?.[0] || null,
  };
}

/**
 * Build a flashcard of either type.
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
/* A user can reword a card's meanings; the dictionary's original text is kept */
/* alongside so it can be restored. All three helpers return a NEW `back` and  */
/* never mutate the one passed in, which belongs to React state. It all lives  */
/* inside `back`, an a.json() field, so none of it needs a schema change.      */
/* -------------------------------------------------------------------------- */

/** True when this card's meanings have been edited away from the original. */
export function hasCustomMeanings(back) {
  return Boolean(back && back.originalMeanings != null);
}

/**
 * Apply an edited definition, preserving the dictionary's original text.
 *
 * `originalMeanings` is recorded on the FIRST edit only: a second edit would
 * otherwise overwrite it, and "revert" would restore the user's own earlier
 * wording rather than the dictionary's.
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
