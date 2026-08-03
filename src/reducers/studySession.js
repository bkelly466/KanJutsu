/**
 * State for one study session: the queue of due cards, where we are in it, and
 * the running tally of how each card was rated.
 *
 * This is a *reducer* — a plain function of `(state, action) => newState`. It
 * replaces five separate `useState` calls in StudySession.jsx, because rating a
 * card changes four of them at once and keeping that in one place makes the rule
 * readable (and, unlike code inside a component, testable).
 *
 * The one hard rule for a reducer: it must be **pure**. No network calls, no
 * randomness, no reading the clock. So the SM-2 math (`calculateNextReview`) and
 * the cloud write (`updateCardSRS`) stay in the component, and the already
 * computed result is handed in on the action as `metrics`.
 */

// The "Again" button. Rating a card Again puts it back in the queue instead of
// counting it as finished. Named rather than inlined as `0` to match the
// PASSING_QUALITY / HARD_QUALITY constants in utils/srs.js.
const AGAIN_QUALITY = 0;

/**
 * Build the starting state.
 *
 * Takes an **already-ordered** queue rather than building it from a deck. That
 * keeps this function pure: the shuffle is random, so doing it here would make
 * the session impossible to test and the initializer non-deterministic. The
 * caller shuffles, we just hold the result.
 */
export function initStudySession(queue) {
  return {
    queue,
    currentIndex: 0,
    isFlipped: false,
    sessionStats: { again: 0, hard: 0, good: 0, easy: 0 },
    done: false,
  };
}

export function studySessionReducer(state, action) {
  switch (action.type) {
    case 'FLIP':
      return { ...state, isFlipped: true };

    case 'RATE': {
      // `quality` is the SM-2 score, `ratingKey` the stats bucket ('again' |
      // 'hard' | 'good' | 'easy'), and `metrics` the SRS state the caller
      // already computed for this card.
      const { quality, ratingKey, metrics } = action;
      const current = state.queue[state.currentIndex];

      const sessionStats = {
        ...state.sessionStats,
        [ratingKey]: state.sessionStats[ratingKey] + 1,
      };

      // Whether this was the last card is decided against the queue length
      // *before* any re-queue below. An "Again" card is added to the end, so
      // measuring after the push would move the finish line every time it was
      // pressed and the session would never end.
      const wasLastCard = state.currentIndex + 1 >= state.queue.length;

      if (quality !== AGAIN_QUALITY) {
        if (wasLastCard) {
          // Session over. currentIndex deliberately does not advance and the
          // card stays flipped — the summary screen replaces the card view, so
          // neither is read again, and leaving them alone keeps this branch to
          // the one thing it actually means.
          return { ...state, sessionStats, done: true };
        }
        return {
          ...state,
          sessionStats,
          currentIndex: state.currentIndex + 1,
          isFlipped: false,
        };
      }

      // Rated "Again": re-queue the card for another go this session. The copy
      // carries `metrics` merged in so a second rating builds on this review
      // rather than the stale pre-review state — otherwise re-rating would
      // silently overwrite the update we just wrote to the cloud.
      return {
        ...state,
        sessionStats,
        queue: [...state.queue, { ...current, ...metrics }],
        currentIndex: state.currentIndex + 1,
        isFlipped: false,
      };
    }

    default:
      return state;
  }
}
