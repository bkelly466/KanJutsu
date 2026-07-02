/**
 * SM-2 algorithm for spaced repetition.
 * Based on: https://en.wikipedia.org/wiki/Spaced_repetition#Algorithms
 *
 * Quality: 0-5 scale
 *   5 = perfect response
 *   4 = correct response after some hesitation
 *   3 = correct response after serious difficulty
 *   2 = incorrect response; correct answer easily recalled
 *   1 = incorrect response; correct answer remembered
 *   0 = complete blackout, correct answer unknown
 */

/** Starting SRS state for a brand-new card (due immediately). */
export const SRS_DEFAULTS = {
  repetitions: 0,
  easeFactor: 2.5,
  interval: 0,
};

const MIN_EASE_FACTOR = 1.3;
const PASSING_QUALITY = 3;
// SM-2 quality 3 ("correct after serious difficulty") is the "Hard" rating.
// Anki grows the interval by a fixed, smaller multiplier for Hard rather than
// the full ease-factor growth used for Good/Easy — this keeps the streak
// alive but advances the card cautiously. See HANDOFF.md for the writeup.
const HARD_QUALITY = 3;
const HARD_INTERVAL_MULTIPLIER = 1.2;

/**
 * Given a card's current SRS state and a review quality (0-5), compute the
 * next interval, ease factor, repetition count, and due date.
 */
export const calculateNextReview = (card, quality) => {
  const { repetitions, easeFactor, interval } = card;

  // Clamp quality to the supported 0-5 range.
  const q = Math.max(0, Math.min(5, quality));

  // Adjust the ease factor, never letting it drop below the minimum.
  const newEaseFactor = Math.max(
    MIN_EASE_FACTOR,
    easeFactor + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  );

  let newRepetitions;
  let newInterval;

  if (q < PASSING_QUALITY) {
    // Poor recall — reset the streak and review again tomorrow.
    newRepetitions = 0;
    newInterval = 1;
  } else if (q === HARD_QUALITY) {
    // Recalled, but with real difficulty — keep the streak but grow the
    // interval cautiously instead of by the full ease factor.
    newInterval = Math.max(1, Math.round(interval * HARD_INTERVAL_MULTIPLIER));
    newRepetitions = repetitions + 1;
  } else {
    if (repetitions === 0) {
      newInterval = 1;
    } else if (repetitions === 1) {
      newInterval = 3;
    } else {
      newInterval = Math.round(interval * newEaseFactor);
    }
    newRepetitions = repetitions + 1;
  }

  const nextReviewDate = new Date();
  nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

  return {
    repetitions: newRepetitions,
    easeFactor: newEaseFactor,
    interval: newInterval,
    nextReviewDate: nextReviewDate.toISOString(),
  };
};

/** Return the cards that are due for review today (or overdue). */
export const getCardsForReview = (cards) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return cards.filter((card) => {
    const reviewDate = new Date(card.nextReviewDate);
    reviewDate.setHours(0, 0, 0, 0);
    return reviewDate <= today;
  });
};
