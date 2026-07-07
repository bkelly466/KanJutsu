import { describe, it, expect } from 'vitest';
import { calculateNextReview, getCardsForReview, getDefaultSRSState } from './srs';

// Helper: build a card-like object with just the SRS fields calculateNextReview reads.
const makeCard = (overrides = {}) => ({
  ...getDefaultSRSState(),
  ...overrides,
});

describe('calculateNextReview', () => {
  describe('q < 3 (lapse)', () => {
    it.each([0, 1, 2])(
      'resets repetitions to 0 and interval to 1 for quality %i, even on a well-established card',
      (q) => {
        const card = makeCard({ repetitions: 8, interval: 60, easeFactor: 2.8 });
        const result = calculateNextReview(card, q);

        expect(result.repetitions).toBe(0);
        expect(result.interval).toBe(1);
      }
    );
  });

  describe('q === 3 (Hard)', () => {
    it('gives interval 1 on a brand-new card (interval 0), floored by Math.max(1, ...)', () => {
      const card = makeCard(); // interval 0, repetitions 0
      const result = calculateNextReview(card, 3);

      // 0 * 1.2 = 0, but the Math.max(1, ...) floor kicks in.
      expect(result.interval).toBe(1);
      expect(result.repetitions).toBe(1);
    });

    it('multiplies the existing interval by 1.2 and rounds', () => {
      const card = makeCard({ repetitions: 4, interval: 10, easeFactor: 2.5 });
      const result = calculateNextReview(card, 3);

      // 10 * 1.2 = 12 exactly, no rounding ambiguity.
      expect(result.interval).toBe(12);
      expect(result.repetitions).toBe(5);
    });

    it('rounds to the nearest day when the multiplied interval is not a whole number', () => {
      const card = makeCard({ repetitions: 2, interval: 7, easeFactor: 2.5 });
      const result = calculateNextReview(card, 3);

      // 7 * 1.2 = 8.4 -> rounds to 8.
      expect(result.interval).toBe(8);
    });
  });

  describe('q > 3 (Good/Easy)', () => {
    it('gives interval 1 on the first successful repetition (repetitions 0)', () => {
      const card = makeCard({ repetitions: 0, interval: 0 });
      const result = calculateNextReview(card, 4);

      expect(result.interval).toBe(1);
      expect(result.repetitions).toBe(1);
    });

    it('gives interval 3 on the second successful repetition (repetitions 1)', () => {
      const card = makeCard({ repetitions: 1, interval: 1 });
      const result = calculateNextReview(card, 4);

      expect(result.interval).toBe(3);
      expect(result.repetitions).toBe(2);
    });

    it('grows the interval by the ease factor from repetitions 2 onward', () => {
      const card = makeCard({ repetitions: 2, interval: 3, easeFactor: 2.5 });
      const result = calculateNextReview(card, 4);

      // newEaseFactor for q=4: 2.5 + (0.1 - 1*(0.08 + 1*0.02)) = 2.5 + 0 = 2.5
      // interval = round(3 * 2.5) = 8
      expect(result.easeFactor).toBeCloseTo(2.5);
      expect(result.interval).toBe(8);
      expect(result.repetitions).toBe(3);
    });

    it('gives the biggest jump for a perfect (q=5) recall on an established card', () => {
      const card = makeCard({ repetitions: 3, interval: 8, easeFactor: 2.5 });
      const result = calculateNextReview(card, 5);

      // newEaseFactor for q=5: 2.5 + (0.1 - 0) = 2.6
      // interval = round(8 * 2.6) = 21 (20.8 rounds up)
      expect(result.easeFactor).toBeCloseTo(2.6);
      expect(result.interval).toBe(21);
    });
  });

  describe('ease factor floor', () => {
    it('never drops below MIN_EASE_FACTOR (1.3) even after repeated failing ratings', () => {
      let card = makeCard({ easeFactor: 1.3 });

      // Repeatedly fail the card — each q=0 review would otherwise push the
      // ease factor further down, but it must stay clamped at 1.3.
      for (let i = 0; i < 5; i++) {
        card = calculateNextReview(card, 0);
      }

      expect(card.easeFactor).toBe(1.3);
    });

    it('clamps a single very-low-quality review that would drop ease factor below the floor', () => {
      const card = makeCard({ easeFactor: 1.35 });
      const result = calculateNextReview(card, 0);

      // Unclamped: 1.35 + (0.1 - 5*(0.08 + 5*0.02)) = 1.35 + (0.1 - 0.9) = 0.55
      // Must be clamped to the 1.3 floor instead.
      expect(result.easeFactor).toBe(1.3);
    });
  });

  it('always returns an ISO nextReviewDate that is `interval` days from now', () => {
    const card = makeCard({ repetitions: 1, interval: 1, easeFactor: 2.5 });
    const before = new Date();
    const result = calculateNextReview(card, 4); // -> interval 3

    const expected = new Date(before);
    expected.setDate(expected.getDate() + 3);

    const actual = new Date(result.nextReviewDate);
    expect(actual.toDateString()).toBe(expected.toDateString());
  });
});

describe('getCardsForReview', () => {
  const daysFromNow = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString();
  };

  it('includes cards due today', () => {
    const cards = [{ id: 'a', nextReviewDate: daysFromNow(0) }];
    expect(getCardsForReview(cards)).toHaveLength(1);
  });

  it('includes cards that are overdue', () => {
    const cards = [{ id: 'a', nextReviewDate: daysFromNow(-5) }];
    expect(getCardsForReview(cards)).toHaveLength(1);
  });

  it('excludes cards due in the future', () => {
    const cards = [{ id: 'a', nextReviewDate: daysFromNow(1) }];
    expect(getCardsForReview(cards)).toHaveLength(0);
  });

  it('filters a mixed batch down to only due/overdue cards', () => {
    const cards = [
      { id: 'overdue', nextReviewDate: daysFromNow(-2) },
      { id: 'today', nextReviewDate: daysFromNow(0) },
      { id: 'future', nextReviewDate: daysFromNow(3) },
    ];

    const due = getCardsForReview(cards);
    const ids = due.map((c) => c.id);

    expect(ids).toEqual(expect.arrayContaining(['overdue', 'today']));
    expect(ids).not.toContain('future');
    expect(due).toHaveLength(2);
  });

  it('ignores time-of-day, treating a card due later today as due now', () => {
    // A card whose nextReviewDate is "today" but at 23:59 should still count
    // as due, since getCardsForReview compares by calendar day, not by time.
    const today = new Date();
    today.setHours(23, 59, 0, 0);
    const cards = [{ id: 'a', nextReviewDate: today.toISOString() }];

    expect(getCardsForReview(cards)).toHaveLength(1);
  });
});
