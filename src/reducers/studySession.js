/**
 * State for one study session: the queue of due cards, the position in it, and
 * the running tally of how each card was rated.
 *
 * Rating a card changes four of these at once, which is why they're a reducer
 * rather than five useState calls in StudySession.jsx — and why the rule is
 * testable at all.
 *
 * **Pure**, so no clock, no randomness, no network. The SM-2 math and the cloud
 * write stay in the component, and the computed result arrives on the action as
 * `metrics`.
 */

// The "Again" button, named to match PASSING_QUALITY / HARD_QUALITY in
// utils/srs.js. Rating Again re-queues the card instead of finishing it.
const AGAIN_QUALITY = 0;

/**
 * Build the starting state from an ALREADY-ORDERED queue. The caller shuffles;
 * doing it here would make the initializer non-deterministic and the session
 * impossible to test.
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
      // `quality` is the SM-2 score, `ratingKey` the stats bucket, and
      // `metrics` the SRS state the caller already computed for this card.
      const { quality, ratingKey, metrics } = action;
      const current = state.queue[state.currentIndex];

      const sessionStats = {
        ...state.sessionStats,
        [ratingKey]: state.sessionStats[ratingKey] + 1,
      };

      // Measured BEFORE any re-queue below. An "Again" card is pushed to the
      // end, so measuring after would move the finish line every time it was
      // pressed and the session would never end.
      const wasLastCard = state.currentIndex + 1 >= state.queue.length;

      if (quality !== AGAIN_QUALITY) {
        if (wasLastCard) {
          // currentIndex doesn't advance and the card stays flipped: the
          // summary screen replaces the card view, so neither is read again.
          return { ...state, sessionStats, done: true };
        }
        return {
          ...state,
          sessionStats,
          currentIndex: state.currentIndex + 1,
          isFlipped: false,
        };
      }

      // Rated "Again" — re-queue for another go this session. The copy merges
      // in `metrics` so a second rating builds on this review rather than the
      // stale pre-review state, which would overwrite what was just written.
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
