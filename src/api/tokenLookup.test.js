import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  lookUpToken,
  peekTokenEntries,
  clearTokenLookupCache,
  pickPrimaryEntry,
} from './tokenLookup';
import { searchWords } from './words';

/**
 * words.js is stubbed rather than `fetch`, because what matters here is the
 * layer this module adds — the caching and the deinflection flag it passes on —
 * not Jisho's response shape, which words.test.js already covers.
 */
vi.mock('./words', () => ({ searchWords: vi.fn() }));

/** A normalised entry, trimmed to the fields these tests care about. */
function entry(word, reading, extra = {}) {
  return { id: `${word}::${reading}`, word, reading, senses: [], ...extra };
}

beforeEach(() => {
  clearTokenLookupCache();
  searchWords.mockReset();
});

describe('lookUpToken', () => {
  it('searches the lemma with deinflection disabled', async () => {
    searchWords.mockResolvedValue({ results: [entry('飲む', 'のむ')], resolvedFrom: null });

    const results = await lookUpToken('飲む');

    expect(searchWords).toHaveBeenCalledWith('飲む', { allowDeinflection: false });
    expect(results).toEqual([entry('飲む', 'のむ')]);
  });

  it('serves a repeat lookup of the same lemma from cache', async () => {
    searchWords.mockResolvedValue({ results: [entry('は', 'は')], resolvedFrom: null });

    await lookUpToken('は');
    await lookUpToken('は');

    // The point of the whole module: tapping は twice in one Sentence is one
    // request, not two.
    expect(searchWords).toHaveBeenCalledTimes(1);
  });

  it('collapses two taps that land before the first request resolves', async () => {
    searchWords.mockResolvedValue({ results: [], resolvedFrom: null });

    // No await between them — this is the double-tap case.
    const [first, second] = await Promise.all([lookUpToken('見る'), lookUpToken('見る')]);

    expect(searchWords).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
  });

  it('looks up different lemmas separately', async () => {
    searchWords.mockResolvedValue({ results: [], resolvedFrom: null });

    await lookUpToken('行く');
    await lookUpToken('映画');

    expect(searchWords).toHaveBeenCalledTimes(2);
  });

  it('makes no request for a blank lemma', async () => {
    const results = await lookUpToken('   ');

    expect(searchWords).not.toHaveBeenCalled();
    expect(results).toEqual([]);
  });

  it('does not cache a failure, so a retry really retries', async () => {
    searchWords.mockRejectedValueOnce(new Error('Word lookup failed. Please try again.'));

    await expect(lookUpToken('本')).rejects.toThrow('Word lookup failed');

    // If the rejection had been cached, the overlay's "Try again" button would
    // re-serve the same error forever.
    searchWords.mockResolvedValue({ results: [entry('本', 'ほん')], resolvedFrom: null });
    await expect(lookUpToken('本')).resolves.toEqual([entry('本', 'ほん')]);
    expect(searchWords).toHaveBeenCalledTimes(2);
  });
});

describe('peekTokenEntries', () => {
  it('returns undefined for a lemma nobody has looked up', () => {
    // Distinct from []: the overlay shows a spinner for this and "no entry"
    // for [], so collapsing the two would make every first tap skip its
    // loading state and briefly claim the word doesn't exist.
    expect(peekTokenEntries('飲む')).toBeUndefined();
  });

  it('returns the entries once a lookup has settled', async () => {
    searchWords.mockResolvedValue({ results: [entry('飲む', 'のむ')], resolvedFrom: null });

    expect(peekTokenEntries('飲む')).toBeUndefined();
    await lookUpToken('飲む');

    // Same array instance the promise resolved with, so seeding component
    // state from it and then re-setting it from the promise is a no-op React
    // bails out of rather than a second render.
    expect(peekTokenEntries('飲む')).toEqual([entry('飲む', 'のむ')]);
  });

  it('is not populated while the request is still in flight', async () => {
    let resolveSearch;
    searchWords.mockReturnValue(new Promise((resolve) => { resolveSearch = resolve; }));

    const pending = lookUpToken('映画');
    expect(peekTokenEntries('映画')).toBeUndefined();

    resolveSearch({ results: [entry('映画', 'えいが')], resolvedFrom: null });
    await pending;
    expect(peekTokenEntries('映画')).toEqual([entry('映画', 'えいが')]);
  });

  it('records an empty result, so a word with no entry is a settled answer', async () => {
    searchWords.mockResolvedValue({ results: [], resolvedFrom: null });

    await lookUpToken('山田');

    // 山田 genuinely has no entry. Re-opening it must say so immediately
    // rather than looking it up again — that dead-end tap is the case the
    // whole feature is judged on.
    expect(peekTokenEntries('山田')).toEqual([]);
  });

  it('stays empty after a failure, so the retry shows a spinner', async () => {
    searchWords.mockRejectedValueOnce(new Error('Word lookup failed. Please try again.'));

    await expect(lookUpToken('本')).rejects.toThrow('Word lookup failed');

    // A failure is not an answer. Recording one here would re-open the overlay
    // on a stale empty result and quietly claim the word has no entry.
    expect(peekTokenEntries('本')).toBeUndefined();
  });

  it('trims, and treats a blank lemma as a settled "no entry"', async () => {
    searchWords.mockResolvedValue({ results: [entry('本', 'ほん')], resolvedFrom: null });
    await lookUpToken('本');

    // Same key normalisation lookUpToken uses, or the two caches would disagree.
    expect(peekTokenEntries('  本  ')).toEqual([entry('本', 'ほん')]);
    // lookUpToken resolves a blank lemma immediately without a request, so the
    // answer is already known and there is nothing to wait for.
    expect(peekTokenEntries('   ')).toEqual([]);
  });

  it('is cleared along with the promise cache', async () => {
    searchWords.mockResolvedValue({ results: [entry('本', 'ほん')], resolvedFrom: null });
    await lookUpToken('本');

    clearTokenLookupCache();

    expect(peekTokenEntries('本')).toBeUndefined();
  });
});

describe('pickPrimaryEntry', () => {
  it('prefers the entry whose headword is the lemma over Jisho’s first result', () => {
    const entries = [entry('中国', 'ちゅうごく'), entry('中', 'なか')];

    expect(pickPrimaryEntry(entries, '中')).toEqual(entry('中', 'なか'));
  });

  it('matches on the reading too, so a kana lemma finds its kanji entry', () => {
    const entries = [entry('事', 'こと')];

    expect(pickPrimaryEntry(entries, 'こと')).toEqual(entry('事', 'こと'));
  });

  it('falls back to the first result when nothing matches exactly', () => {
    const entries = [entry('食べ物', 'たべもの'), entry('食べる', 'たべる')];

    expect(pickPrimaryEntry(entries, '食')).toEqual(entry('食べ物', 'たべもの'));
  });

  it('returns null when there are no entries', () => {
    expect(pickPrimaryEntry([], '山田')).toBeNull();
    expect(pickPrimaryEntry(undefined, '山田')).toBeNull();
  });
});
