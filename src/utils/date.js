/**
 * Date display helpers for card timestamps, which are stored as ISO strings
 * (`addedAt`, `nextReviewDate`, `lastReviewedDate`).
 *
 * Missing values are routine, not exceptional: `lastReviewedDate` is null on
 * every never-studied card and on every card predating the field.
 */

/**
 * Format an ISO date string for display, e.g. "28 Jul 2026".
 *
 * Returns null — never the string "Invalid Date" — for missing or unparseable
 * input, leaving the caller to choose what to show instead.
 *
 * @param {string|null|undefined} iso
 * @returns {string|null}
 */
export function formatDate(iso) {
  if (!iso) return null;

  const date = new Date(iso);
  // An unparseable date still constructs a Date; only its time is NaN.
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
