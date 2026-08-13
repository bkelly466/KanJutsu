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
const SRS_DEFAULTS = {
  repetitions: 0,
  easeFactor: 2.5,
  interval: 0,
};

export const getDefaultSRSState = () => ({
  ...SRS_DEFAULTS,
  nextReviewDate: new Date().toISOString(),
  // null = never reviewed. This being exactly a new card's state is what makes
  // "reset SRS" a matter of writing this object back.
  lastReviewedDate: null
});

const MIN_EASE_FACTOR = 1.3;
const PASSING_QUALITY = 3;
// Quality 3 ("correct after serious difficulty") is the app's "Hard" rating.
// Following Anki, it grows the interval by a fixed smaller multiplier instead
// of the full ease factor: the streak survives, the card advances cautiously.
const HARD_QUALITY = 3;
const HARD_INTERVAL_MULTIPLIER = 1.2;

/**
 * The card's next SRS state after a review — interval, ease factor, repetition
 * count, and due date. `quality` is clamped to 0-5.
 */
export const calculateNextReview = (card, quality) => {
  const { repetitions, easeFactor, interval } = card;

  const q = Math.max(0, Math.min(5, quality));

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
    // Every rating in the app flows through here, so this one stamp keeps the
    // card's history accurate.
    lastReviewedDate: new Date().toISOString(),
  };
};

/**
 * Whole calendar days from today until a card is due — 0 today, 1 tomorrow,
 * negative when overdue. Both dates are normalized to midnight, so the answer
 * never depends on the time of day.
 */
export const daysUntilDue = (card) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const due = new Date(card.nextReviewDate);
  due.setHours(0, 0, 0, 0);

  return Math.round((due - today) / (1000 * 60 * 60 * 24));
};

/** Return the cards that are due for review today (or overdue). */
export const getCardsForReview = (cards) =>
  cards.filter((card) => daysUntilDue(card) <= 0);

/**
 * Human-readable due status — "Due today", "Due tomorrow", "Due in 3 days".
 * Beside daysUntilDue so the phrasing has one home.
 */
export const dueLabel = (card) => {
  const days = daysUntilDue(card);
  if (days <= 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days`;
};
