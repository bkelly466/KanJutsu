import { describe, it, expect } from 'vitest';
import { formatDate } from './date';

describe('formatDate', () => {
  it('formats a valid ISO string into something readable', () => {
    const formatted = formatDate('2026-07-28T12:00:00.000Z');
    // The exact wording depends on the runner's locale, so assert the parts
    // that must be present rather than one hard-coded string.
    expect(formatted).toBeTruthy();
    expect(formatted).toContain('2026');
  });

  // The null cases matter more than the happy path here: lastReviewedDate is
  // null on every card that has never been studied, and the modal must show
  // "Never reviewed" rather than "Invalid Date".
  it('returns null for null and undefined', () => {
    expect(formatDate(null)).toBeNull();
    expect(formatDate(undefined)).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(formatDate('')).toBeNull();
  });

  it('returns null for an unparseable date instead of "Invalid Date"', () => {
    expect(formatDate('not a date')).toBeNull();
  });
});
