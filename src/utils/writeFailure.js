/**
 * Describing a failed Deck or Card write to the user — two ends of one
 * decision, what went wrong and what to say about it.
 *
 * Only the data layer can tell an expired Cognito session from an ordinary
 * network failure; only the call site knows which button was pressed.
 *
 * In utils/ rather than api/ so the dependency runs api → utils, matching
 * api/sentence.js → utils/chunk.js.
 */

/**
 * The user's Cognito session is gone. Kept distinct from every other failure
 * because it is the one the user can act on — "please try again" is guaranteed
 * to fail while signed out.
 */
export const SESSION_EXPIRED = 'session-expired';

/** Anything else: offline, AppSync error, a rejected write. Retrying may work. */
export const SYNC_FAILED = 'sync-failed';

/**
 * Substrings identifying an expired or absent session. The Amplify client
 * words it differently depending on where the failure surfaces, hence several.
 * Matched against lowercased text, so these stay lowercase.
 */
const AUTH_FAILURE_PATTERNS = [
  'nosigneduser',
  'no current user',
  'unauthorized',
  'not authorized',
];

/**
 * Classify a thrown error into `{ code, message }`, where `message` is always
 * safe to put in front of the user.
 *
 * @param {unknown} cause  whatever was thrown
 */
export function classifyWriteFailure(cause) {
  const text = String((cause && cause.message) || cause || '').toLowerCase();

  if (AUTH_FAILURE_PATTERNS.some((pattern) => text.includes(pattern))) {
    return {
      code: SESSION_EXPIRED,
      message: 'Your session expired. Please sign out and sign in again.',
    };
  }

  return {
    code: SYNC_FAILED,
    message: 'Something went wrong syncing with the cloud. Please try again.',
  };
}

/**
 * What to show the user for a failed write.
 *
 * Prefers the data layer's message when it knows something the caller can't (an
 * expired session), otherwise the caller's own action-specific copy. Returns
 * `fallback` for a malformed or missing result, so a caller can never render
 * `undefined` at the user.
 *
 * @param {{code?: string, error?: string}} result   a write result from useDecks
 * @param {string} fallback                          the caller's own copy
 */
export function writeFailureMessage(result, fallback) {
  if (result?.code === SESSION_EXPIRED && result.error) return result.error;
  return fallback;
}
