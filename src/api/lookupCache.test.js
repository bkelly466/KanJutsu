import { describe, it, expect, vi } from 'vitest';
import { createLookupCache } from './lookupCache';

/**
 * These rules used to live inside tokenLookup.js and were only ever asserted
 * through it. They matter to the kanji explorer too now, so they're tested
 * here directly: the loader is a plain spy, because what's under test is the
 * caching, not anything about dictionaries.
 */

/** A loader that resolves with whatever it was given, after a real tick. */
function echoLoader() {
  return vi.fn(async (key) => `value:${key}`);
}

describe('load', () => {
  it('calls the loader once and caches the result', async () => {
    const loader = echoLoader();
    const cache = createLookupCache(loader);

    expect(await cache.load('食')).toBe('value:食');
    expect(await cache.load('食')).toBe('value:食');

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('keys separately, so a different key is a different request', async () => {
    const loader = echoLoader();
    const cache = createLookupCache(loader);

    expect(await cache.load('食')).toBe('value:食');
    expect(await cache.load('飲')).toBe('value:飲');

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('collapses two lookups that land before the first resolves', async () => {
    const loader = echoLoader();
    const cache = createLookupCache(loader);

    // Both calls happen before either promise has settled — the case a learner
    // hits by double-tapping a word.
    const [first, second] = await Promise.all([cache.load('食'), cache.load('食')]);

    expect(first).toBe(second);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('caches a successful-but-empty result', async () => {
    // "Looked up, and there is nothing" is a real answer plenty of words have,
    // so it must stay as cheap as any other.
    const loader = vi.fn(async () => []);
    const cache = createLookupCache(loader);

    expect(await cache.load('山田')).toEqual([]);
    expect(await cache.load('山田')).toEqual([]);

    expect(loader).toHaveBeenCalledTimes(1);
  });

  it('does NOT cache a failure, so a retry really retries', async () => {
    // The rule the "Try again" button depends on: one network blip must not
    // make a word un-lookupable for the rest of the session.
    const loader = vi
      .fn()
      .mockRejectedValueOnce(new Error('Lookup failed.'))
      .mockResolvedValueOnce('value:食');
    const cache = createLookupCache(loader);

    await expect(cache.load('食')).rejects.toThrow('Lookup failed.');
    expect(await cache.load('食')).toBe('value:食');

    expect(loader).toHaveBeenCalledTimes(2);
  });

  it('rejects rather than throwing when the loader throws synchronously', async () => {
    const loader = vi.fn(() => {
      throw new Error('Bad key.');
    });
    const cache = createLookupCache(loader);

    // Called outside a try/catch on purpose: a synchronous throw here would
    // escape into the caller's render instead of becoming an error state.
    await expect(cache.load('食')).rejects.toThrow('Bad key.');
  });
});

describe('peek', () => {
  it('returns undefined before anything has settled', () => {
    const cache = createLookupCache(echoLoader());

    expect(cache.peek('食')).toBeUndefined();
  });

  it('still returns undefined while the request is in flight', () => {
    const cache = createLookupCache(echoLoader());

    cache.load('食'); // deliberately not awaited

    expect(cache.peek('食')).toBeUndefined();
  });

  it('returns the settled value once the lookup has resolved', async () => {
    const cache = createLookupCache(echoLoader());

    await cache.load('食');

    expect(cache.peek('食')).toBe('value:食');
  });

  it('distinguishes an empty result from a key never looked up', async () => {
    // The distinction the no-flash mount depends on: `undefined` is "don't
    // know yet" and `[]` is "looked up, nothing there". Collapsing them would
    // make every first lookup briefly claim there was no entry.
    const cache = createLookupCache(async () => []);

    await cache.load('山田');

    expect(cache.peek('山田')).toEqual([]);
    expect(cache.peek('東京')).toBeUndefined();
  });

  it('has nothing to report after a failed lookup', async () => {
    const cache = createLookupCache(async () => {
      throw new Error('Lookup failed.');
    });

    await expect(cache.load('食')).rejects.toThrow('Lookup failed.');

    expect(cache.peek('食')).toBeUndefined();
  });
});

describe('clear', () => {
  it('empties both what is cached and what can be peeked', async () => {
    const loader = echoLoader();
    const cache = createLookupCache(loader);

    await cache.load('食');
    cache.clear();

    expect(cache.peek('食')).toBeUndefined();
    await cache.load('食');
    expect(loader).toHaveBeenCalledTimes(2);
  });
});

describe('independence', () => {
  it('gives each cache its own maps', async () => {
    const words = createLookupCache(async (key) => `word:${key}`);
    const kanji = createLookupCache(async (key) => `kanji:${key}`);

    await words.load('食');

    expect(kanji.peek('食')).toBeUndefined();
    expect(await kanji.load('食')).toBe('kanji:食');
  });
});
