/**
 * Date display helpers.
 *
 * Card timestamps are stored as ISO strings (see `addedAt` / `nextReviewDate` /
 * `lastReviewedDate`). These turn them into something readable, and — more
 * importantly — degrade cleanly when the value is missing, which it often is:
 * `lastReviewedDate` is null on every card that has never been studied, and on
 * every card created before that field existed.
 */

/**
 * Format an ISO date string for display, e.g. "28 Jul 2026".
 *
 * Returns null (rather than the string "Invalid Date") for missing or
 * unparseable input, so callers can decide what to show instead.
 *
 * @param {string|null|undefined} iso
 * @returns {string|null}
 */
export function formatDate(iso) {
  if (!iso) return null;

  const date = new Date(iso);
  // An unparseable date still produces a Date object, but its time is NaN.
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
