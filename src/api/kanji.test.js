import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  extractKanji,
  fetchKanjiEntry,
  peekKanjiEntry,
  clearKanjiEntryCache,
} from './kanji';

/**
 * `fetch` is stubbed rather than the modules underneath, because the two
 * upstreams behave differently and the difference is the point: kanjiapi's 404
 * is a real answer ("no such character") while its 500 is a fault worth
 * retrying, and a Jisho failure must not sink the whole entry.
 */

/** Route a stubbed fetch by which upstream the URL belongs to. */
function stubUpstreams({ kanji, jisho }) {
  const fetchMock = vi.fn(async (url) => {
    if (url.includes('kanjiapi.dev')) return kanji(url);
    return jisho ? jisho(url) : { ok: true, json: async () => ({ data: [] }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** kanjiapi's payload for a character it knows. */
function kanjiFound(character) {
  return { ok: true, status: 200, json: async () => ({ kanji: character, meanings: ['eat'] }) };
}

beforeEach(() => {
  clearKanjiEntryCache();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('extractKanji', () => {
  it('returns each kanji once, skipping kana and punctuation', () => {
    expect(extractKanji('食べる、食事。')).toEqual(['食', '事']);
  });

  it('returns an empty array for text with no kanji', () => {
    expect(extractKanji('ありがとう')).toEqual([]);
  });
});

describe('fetchKanjiEntry', () => {
  it('enriches the kanji data with its common words', async () => {
    stubUpstreams({
      kanji: () => kanjiFound('食'),
      jisho: () => ({
        ok: true,
        json: async () => ({
          data: [
            {
              slug: '食べる',
              japanese: [{ word: '食べる', reading: 'たべる' }],
              senses: [{ english_definitions: ['to eat'], parts_of_speech: [] }],
            },
          ],
        }),
      }),
    });

    const entry = await fetchKanjiEntry('食');

    expect(entry.kanji).toBe('食');
    expect(entry.commonWords).toHaveLength(1);
    expect(entry.commonWords[0].word).toBe('食べる');
  });

  it('returns null for a character kanjiapi does not have', async () => {
    stubUpstreams({ kanji: () => ({ ok: false, status: 404 }) });

    await expect(fetchKanjiEntry('々')).resolves.toBeNull();
  });

  it('throws user-facing copy when kanjiapi is at fault', async () => {
    // Distinct from the 404 above on purpose: a 500 recorded as "no such
    // kanji" would stick in the cache for the whole session, and retrying is
    // exactly what fixes it.
    stubUpstreams({ kanji: () => ({ ok: false, status: 500 }) });

    await expect(fetchKanjiEntry('食')).rejects.toThrow('Could not load kanji info.');
  });

  it('throws user-facing copy rather than the browser’s on a network failure', async () => {
    stubUpstreams({
      kanji: () => {
        throw new TypeError('Failed to fetch');
      },
    });

    await expect(fetchKanjiEntry('食')).rejects.toThrow(
      'Could not load kanji info. Please check your connection and try again.'
    );
  });

  it('still returns the kanji when its common words fail to load', async () => {
    stubUpstreams({
      kanji: () => kanjiFound('食'),
      jisho: () => {
        throw new TypeError('Failed to fetch');
      },
    });

    const entry = await fetchKanjiEntry('食');

    expect(entry.kanji).toBe('食');
    expect(entry.commonWords).toEqual([]);
  });
});

describe('caching', () => {
  it('fetches a character once, however many times it is opened', async () => {
    const fetchMock = stubUpstreams({ kanji: () => kanjiFound('食') });

    await fetchKanjiEntry('食');
    await fetchKanjiEntry('食');

    // Two upstreams, one round of each — the drill stack's Back button is
    // always a repeat lookup, and it should cost nothing.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failure, so Try again really tries again', async () => {
    let attempts = 0;
    const fetchMock = stubUpstreams({
      kanji: () => {
        attempts += 1;
        return attempts === 1 ? { ok: false, status: 500 } : kanjiFound('食');
      },
    });

    await expect(fetchKanjiEntry('食')).rejects.toThrow('Could not load kanji info.');
    await expect(fetchKanjiEntry('食')).resolves.toMatchObject({ kanji: '食' });

    expect(fetchMock).toHaveBeenCalled();
  });
});

describe('peekKanjiEntry', () => {
  it('knows nothing before the character has been fetched', () => {
    expect(peekKanjiEntry('食')).toBeUndefined();
  });

  it('answers synchronously once a fetch has settled', async () => {
    stubUpstreams({ kanji: () => kanjiFound('食') });

    await fetchKanjiEntry('食');

    // The overlay reads this during render, which is what stops it blinking
    // through "Loading 食…" on a re-open.
    expect(peekKanjiEntry('食')).toMatchObject({ kanji: '食' });
  });

  it('distinguishes “not looked up” from “looked up, no such kanji”', async () => {
    stubUpstreams({ kanji: () => ({ ok: false, status: 404 }) });

    await fetchKanjiEntry('々');

    expect(peekKanjiEntry('々')).toBeNull();
    expect(peekKanjiEntry('食')).toBeUndefined();
  });
});
