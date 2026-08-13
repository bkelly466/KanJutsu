/**
 * Describing a failed Deck or Card write to the user.
 *
 * Two jobs, both pure, and deliberately in one module because they're two ends
 * of the same decision — what went wrong, and what to say about it:
 *
 *   1. `classifyWriteFailure` turns whatever the Amplify client threw into a
 *      code plus a sentence that is always safe to put on screen. Only the data
 *      layer can tell an expired Cognito session from an ordinary network
 *      failure, so only the data layer can classify it.
 *
 *   2. `writeFailureMessage` decides whose wording wins at the call site. A
 *      component knows which button was pressed ("Couldn't save your
 *      definition"); the data layer knows the user is signed out. The second
 *      beats the first, because it's the only one that tells them what to DO.
 *
 * This lives in utils/ rather than api/ so the dependency runs api → utils, the
 * direction the rest of the codebase already uses (api/sentence.js → utils/chunk.js).
 */

/**
 * The user's Cognito session is gone. Actionable: they can fix this.
 * Kept distinct from every other failure precisely BECAUSE it's actionable —
 * "please try again" is guaranteed to fail while signed out.
 */
export const SESSION_EXPIRED = 'session-expired';

/** Anything else: offline, AppSync error, a rejected write. Retrying may work. */
export const SYNC_FAILED = 'sync-failed';

/**
 * The Amplify client reports an expired/absent session with several different
 * strings depending on where the failure surfaces, so match on all of them.
 * Lowercased before testing, so these stay lowercase.
 */
const AUTH_FAILURE_PATTERNS = [
  'nosigneduser',
  'no current user',
  'unauthorized',
  'not authorized',
];

/**
 * Classify a thrown error into `{ code, message }`.
 *
 * `message` is copy that can go straight in front of the user — the convention
 * src/api/words.js and src/api/sentence.js already follow.
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
 * Returns the data layer's message when it knows something the caller can't
 * (an expired session), and the caller's own action-specific copy otherwise —
 * "Couldn't restore the original definition" says which of three buttons failed,
 * where a generic sync message wouldn't.
 *
 * Falls back to `fallback` for a malformed or missing result, so a caller can
 * never end up rendering `undefined` at the user.
 *
 * @param {{code?: string, error?: string}} result   a write result from useDecks
 * @param {string} fallback                          the caller's own copy
 */
export function writeFailureMessage(result, fallback) {
  if (result?.code === SESSION_EXPIRED && result.error) return result.error;
  return fallback;
}
