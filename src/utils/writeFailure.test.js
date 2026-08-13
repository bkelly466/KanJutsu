import { describe, it, expect } from 'vitest';
import {
  SESSION_EXPIRED,
  SYNC_FAILED,
  classifyWriteFailure,
  writeFailureMessage,
} from './writeFailure';

describe('classifyWriteFailure', () => {
  // The Amplify client words this failure differently depending on where it
  // surfaces, so all four spellings have to land on the same code.
  it.each([
    'NoSignedUser',
    'No current user',
    'Unauthorized',
    'User is not authorized to access this resource',
  ])('classifies %j as an expired session', (message) => {
    const { code } = classifyWriteFailure(new Error(message));
    expect(code).toBe(SESSION_EXPIRED);
  });

  it('gives the expired session an actionable message', () => {
    const { message } = classifyWriteFailure(new Error('NoSignedUser'));
    expect(message).toBe('Your session expired. Please sign out and sign in again.');
  });

  it('classifies anything else as a sync failure', () => {
    const { code, message } = classifyWriteFailure(new Error('Network request failed'));
    expect(code).toBe(SYNC_FAILED);
    expect(message).toBe('Something went wrong syncing with the cloud. Please try again.');
  });

  it('survives being handed something that is not an Error', () => {
    expect(classifyWriteFailure(undefined).code).toBe(SYNC_FAILED);
    expect(classifyWriteFailure(null).code).toBe(SYNC_FAILED);
    expect(classifyWriteFailure('not authorized').code).toBe(SESSION_EXPIRED);
  });
});

describe('writeFailureMessage', () => {
  it('prefers the data layer message when the session expired', () => {
    const result = {
      ok: false,
      code: SESSION_EXPIRED,
      error: 'Your session expired. Please sign out and sign in again.',
    };
    // The caller's copy is thrown away here on purpose: "please try again" is
    // guaranteed to fail while signed out, so it would be actively misleading.
    expect(writeFailureMessage(result, "Couldn't save your definition.")).toBe(result.error);
  });

  it('prefers the caller message for an ordinary sync failure', () => {
    const result = { ok: false, code: SYNC_FAILED, error: 'Something went wrong syncing…' };
    expect(writeFailureMessage(result, "Couldn't save your definition.")).toBe(
      "Couldn't save your definition.",
    );
  });

  it('falls back when the result is malformed or missing', () => {
    expect(writeFailureMessage(undefined, 'fallback')).toBe('fallback');
    expect(writeFailureMessage({}, 'fallback')).toBe('fallback');
    // Right code, no message — nothing to show, so the caller's copy wins
    // rather than rendering undefined at the user.
    expect(writeFailureMessage({ code: SESSION_EXPIRED }, 'fallback')).toBe('fallback');
  });
});
