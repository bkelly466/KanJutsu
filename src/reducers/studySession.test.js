import { describe, it, expect } from 'vitest';
import { initStudySession, studySessionReducer } from './studySession';

// A card only needs an id and the SRS fields for these tests — the reducer never
// looks at `front`/`back`, it just carries the object around.
const makeCard = (id) => ({
  id,
  front: `card-${id}`,
  repetitions: 1,
  easeFactor: 2.5,
  interval: 3,
});

// Stand-in for what calculateNextReview returns. The reducer treats this as an
// opaque blob to merge, so the exact numbers don't matter — only that they
// arrive on the re-queued copy.
const METRICS = {
  repetitions: 0,
  easeFactor: 2.2,
  interval: 1,
  nextReviewDate: '2026-08-04T00:00:00.000Z',
  lastReviewedDate: '2026-08-03T00:00:00.000Z',
};

const rate = (quality, ratingKey) => ({ type: 'RATE', quality, ratingKey, metrics: METRICS });

const AGAIN = rate(0, 'again');
const GOOD = rate(4, 'good');
const EASY = rate(5, 'easy');

describe('initStudySession', () => {
  it('starts at the first card, unflipped, with a zeroed tally', () => {
    const state = initStudySession([makeCard('a'), makeCard('b')]);

    expect(state.currentIndex).toBe(0);
    expect(state.isFlipped).toBe(false);
    expect(state.done).toBe(false);
    expect(state.sessionStats).toEqual({ again: 0, hard: 0, good: 0, easy: 0 });
  });

  it('preserves the queue order it is given (shuffling is the caller\'s job)', () => {
    const queue = [makeCard('c'), makeCard('a'), makeCard('b')];
    const state = initStudySession(queue);

    expect(state.queue.map((c) => c.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('studySessionReducer', () => {
  it('returns the identical state object for an unknown action', () => {
    const state = initStudySession([makeCard('a')]);

    expect(studySessionReducer(state, { type: 'NOPE' })).toBe(state);
  });

  describe('FLIP', () => {
    it('reveals the answer without touching anything else', () => {
      const state = initStudySession([makeCard('a'), makeCard('b')]);
      const next = studySessionReducer(state, { type: 'FLIP' });

      expect(next.isFlipped).toBe(true);
      expect(next.currentIndex).toBe(0);
      expect(next.queue).toBe(state.queue);
      expect(next.sessionStats).toEqual(state.sessionStats);
      expect(next.done).toBe(false);
    });
  });

  describe('RATE — passing grades', () => {
    it('tallies the rating, advances to the next card, and re-hides the answer', () => {
      const state = { ...initStudySession([makeCard('a'), makeCard('b')]), isFlipped: true };
      const next = studySessionReducer(state, GOOD);

      expect(next.sessionStats.good).toBe(1);
      expect(next.currentIndex).toBe(1);
      expect(next.isFlipped).toBe(false);
      expect(next.done).toBe(false);
      // A passing grade never re-queues.
      expect(next.queue).toHaveLength(2);
    });

    it('counts each rating into its own bucket', () => {
      let state = initStudySession([makeCard('a'), makeCard('b'), makeCard('c')]);
      state = studySessionReducer(state, GOOD);
      state = studySessionReducer(state, rate(3, 'hard'));

      expect(state.sessionStats).toEqual({ again: 0, hard: 1, good: 1, easy: 0 });
    });

    it('ends the session on the last card, leaving currentIndex where it was', () => {
      let state = initStudySession([makeCard('a'), makeCard('b')]);
      state = studySessionReducer(state, GOOD); // now on card b, the last one
      const next = studySessionReducer(state, EASY);

      expect(next.done).toBe(true);
      // Deliberate: the summary screen replaces the card view, so the index is
      // never read again and the done branch leaves it alone.
      expect(next.currentIndex).toBe(1);
      expect(next.sessionStats.easy).toBe(1);
    });
  });

  describe('RATE — "Again" re-queues the card', () => {
    it('appends a copy of the current card to the end of the queue', () => {
      const state = initStudySession([makeCard('a'), makeCard('b')]);
      const next = studySessionReducer(state, AGAIN);

      expect(next.queue).toHaveLength(3);
      expect(next.queue[2].id).toBe('a');
      expect(next.currentIndex).toBe(1);
      expect(next.sessionStats.again).toBe(1);
      expect(next.done).toBe(false);
    });

    it('carries the fresh SRS metrics onto the re-queued copy', () => {
      const state = initStudySession([makeCard('a')]);
      const next = studySessionReducer(state, AGAIN);

      // This is the whole point: the second rating must build on the review we
      // just recorded, not the pre-review state the original card still holds.
      expect(next.queue[1]).toMatchObject(METRICS);
      expect(next.queue[1].id).toBe('a');
      // The original entry is untouched — a new object, not a mutation.
      expect(next.queue[0].interval).toBe(3);
    });

    it('does NOT end the session when the last card is rated Again', () => {
      let state = initStudySession([makeCard('a'), makeCard('b')]);
      state = studySessionReducer(state, GOOD); // on card b, the last one
      const next = studySessionReducer(state, AGAIN);

      expect(next.done).toBe(false);
      // The re-queued card is now the current one.
      expect(next.currentIndex).toBe(2);
      expect(next.queue[next.currentIndex].id).toBe('b');
    });

    it('finishes once the re-queued card is finally passed', () => {
      let state = initStudySession([makeCard('a')]);
      state = studySessionReducer(state, AGAIN); // 'a' goes to the back
      state = studySessionReducer(state, GOOD); // pass it the second time

      expect(state.done).toBe(true);
      expect(state.sessionStats).toEqual({ again: 1, hard: 0, good: 1, easy: 0 });
    });

    it('does not move the finish line when Again is pressed repeatedly', () => {
      // The re-queue grows the queue, so measuring "last card" against the
      // post-push length would let a session run forever. Three Agains in a row
      // must still leave exactly three cards pending.
      let state = initStudySession([makeCard('a')]);
      state = studySessionReducer(state, AGAIN);
      state = studySessionReducer(state, AGAIN);
      state = studySessionReducer(state, AGAIN);

      expect(state.done).toBe(false);
      expect(state.queue).toHaveLength(4);
      expect(state.currentIndex).toBe(3);
      expect(state.sessionStats.again).toBe(3);
    });
  });
});
