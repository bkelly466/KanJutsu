import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lookUpToken, clearTokenLookupCache, pickPrimaryEntry } from './tokenLookup';
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
