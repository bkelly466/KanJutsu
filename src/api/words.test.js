import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanJlpt, normalizeWord, searchWords } from './words';

describe('cleanJlpt', () => {
  it('strips the "jlpt-" prefix and uppercases', () => {
    expect(cleanJlpt(['jlpt-n5'])).toEqual(['N5']);
  });

  it('de-duplicates repeated levels', () => {
    expect(cleanJlpt(['jlpt-n5', 'jlpt-n5'])).toEqual(['N5']);
  });

  it('returns an empty array for missing / non-array input', () => {
    expect(cleanJlpt(undefined)).toEqual([]);
    expect(cleanJlpt(null)).toEqual([]);
  });
});

describe('normalizeWord', () => {
  const raw = {
    slug: '食べる',
    is_common: true,
    jlpt: ['jlpt-n5'],
    japanese: [{ word: '食べる', reading: 'たべる' }],
    senses: [
      {
        english_definitions: ['to eat'],
        parts_of_speech: ['Ichidan verb', 'transitive verb'],
      },
      {
        english_definitions: ['to live on (e.g. a salary)'],
        parts_of_speech: ['Ichidan verb'],
      },
    ],
  };

  it('flattens a Jisho entry into the stable shape', () => {
    const w = normalizeWord(raw);
    expect(w.id).toBe('食べる');
    expect(w.word).toBe('食べる');
    expect(w.reading).toBe('たべる');
    expect(w.isCommon).toBe(true);
    expect(w.jlpt).toEqual(['N5']);
    expect(w.senses).toHaveLength(2);
    expect(w.senses[0].partsOfSpeech).toContain('transitive verb');
    // `meanings` is a convenience copy of the first sense's definitions.
    expect(w.meanings).toEqual(['to eat']);
  });

  it('falls back to the reading for kana-only entries (no kanji form)', () => {
    const kanaOnly = { japanese: [{ reading: 'ありがとう' }], senses: [] };
    const w = normalizeWord(kanaOnly);
    expect(w.word).toBe('ありがとう');
    expect(w.reading).toBe('ありがとう');
    // No slug → id is the composed key.
    expect(w.id).toBe('ありがとう::ありがとう');
  });

  it('returns null for malformed entries with no japanese array', () => {
    expect(normalizeWord({})).toBeNull();
    expect(normalizeWord({ japanese: [] })).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* searchWords — the deinflection fallback                                     */
/*                                                                            */
/* These stub `fetch` so the orchestration can be tested without a network:    */
/* which keywords get requested, how many requests happen, and what comes back */
/* when a retry fails. `deinflect` is NOT stubbed — the real table runs, so     */
/* these also check that the two modules agree.                                */
/* -------------------------------------------------------------------------- */

/** Build a Jisho-shaped payload from a compact list of entries. */
function jishoPayload(entries) {
  return {
    ok: true,
    json: async () => ({
      data: entries.map(({ word, reading = '', isCommon = false }) => ({
        slug: word,
        is_common: isCommon,
        japanese: [{ word, reading }],
        senses: [{ english_definitions: ['(definition)'], parts_of_speech: [] }],
      })),
    }),
  };
}

/**
 * Stub fetch with a keyword→entries map. Any keyword not in the map returns no
 * results, which is what Jisho does for a non-word like 飲ぬ.
 */
function stubJisho(byKeyword) {
  const fetchMock = vi.fn(async (url) => {
    const keyword = decodeURIComponent(url.match(/keyword=([^&]*)/)[1]);
    return jishoPayload(byKeyword[keyword] || []);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchWords', () => {
  it('returns an empty result set for a blank query without fetching', async () => {
    const fetchMock = stubJisho({});
    await expect(searchWords('   ')).resolves.toEqual({ results: [], resolvedFrom: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('makes exactly one request when the query is not a た/て form', async () => {
    const fetchMock = stubJisho({ 食べる: [{ word: '食べる', reading: 'たべる' }] });

    const { results, resolvedFrom } = await searchWords('食べる');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resolvedFrom).toBeNull();
    expect(results[0].word).toBe('食べる');
  });

  it('trusts an exact match and does not retry (決して is not a て-form)', async () => {
    // Without this guard, した/して would propose 決する and replace a correct
    // result with a wrong one.
    const fetchMock = stubJisho({
      決して: [{ word: '決して', reading: 'けっして', isCommon: true }],
      決する: [{ word: '決する', reading: 'けっする', isCommon: true }],
    });

    const { results, resolvedFrom } = await searchWords('決して');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resolvedFrom).toBeNull();
    expect(results[0].word).toBe('決して');
  });

  it('does not retry when Jisho already found the headword (読んだ → 読む)', async () => {
    const fetchMock = stubJisho({ 読んだ: [{ word: '読む', reading: 'よむ', isCommon: true }] });

    const { resolvedFrom } = await searchWords('読んだ');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(resolvedFrom).toBeNull();
  });

  it('re-searches candidates and reports the substitution (飲んだ → 飲む)', async () => {
    // The motivating case: Jisho returns "drunkard" and omits 飲む entirely.
    const fetchMock = stubJisho({
      飲んだ: [{ word: '飲んだくれ', reading: 'のんだくれ' }],
      飲む: [{ word: '飲む', reading: 'のむ', isCommon: true }],
    });

    const { results, resolvedFrom } = await searchWords('飲んだ');

    expect(results[0].word).toBe('飲む');
    expect(resolvedFrom).toEqual({ surfaceForm: '飲んだ', headword: '飲む' });
    // One initial request plus one per candidate (む, ぶ, ぬ).
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("matches a kana candidate against an entry's reading and shows the kanji headword", async () => {
    // のむ must find 飲む, whose `word` is the kanji form — comparing `word`
    // alone would miss it and leave a kana-typing beginner on "drunkard".
    stubJisho({
      のんだ: [{ word: '飲んだくれ', reading: 'のんだくれ' }],
      のむ: [{ word: '飲む', reading: 'のむ', isCommon: true }],
    });

    const { results, resolvedFrom } = await searchWords('のんだ');

    expect(results[0].word).toBe('飲む');
    expect(resolvedFrom).toEqual({ surfaceForm: 'のんだ', headword: '飲む' });
  });

  it('prefers the common candidate when more than one resolves', async () => {
    stubJisho({
      遊んだ: [{ word: '遊んだあと', reading: 'あそんだあと' }],
      遊ぶ: [{ word: '遊ぶ', reading: 'あそぶ', isCommon: true }],
      遊む: [{ word: '遊む', reading: 'あそむ', isCommon: false }],
    });

    const { resolvedFrom } = await searchWords('遊んだ');

    expect(resolvedFrom.headword).toBe('遊ぶ');
  });

  it('picks 行く over 行う for 行った, since both are real and common', async () => {
    // Relies on deinflect() ordering irregulars first and the sort being stable.
    stubJisho({
      行った: [{ word: '行ったり来たり', reading: 'いったりきたり' }],
      行く: [{ word: '行く', reading: 'いく', isCommon: true }],
      行う: [{ word: '行う', reading: 'おこなう', isCommon: true }],
    });

    const { resolvedFrom } = await searchWords('行った');

    expect(resolvedFrom.headword).toBe('行く');
  });

  it('keeps the original results when every retry fails', async () => {
    // The invariant that matters most: a flaky retry must never cost the user
    // the results we already have.
    const fetchMock = vi.fn(async (url) => {
      const keyword = decodeURIComponent(url.match(/keyword=([^&]*)/)[1]);
      if (keyword === '飲んだ') return jishoPayload([{ word: '飲んだくれ', reading: 'のんだくれ' }]);
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);

    const { results, resolvedFrom } = await searchWords('飲んだ');

    expect(results[0].word).toBe('飲んだくれ');
    expect(resolvedFrom).toBeNull();
  });

  it('falls back to the original results when no candidate is a real word', async () => {
    stubJisho({ 飲んだ: [{ word: '飲んだくれ', reading: 'のんだくれ' }] });

    const { results, resolvedFrom } = await searchWords('飲んだ');

    expect(results[0].word).toBe('飲んだくれ');
    expect(resolvedFrom).toBeNull();
  });

  it('searches the query literally when deinflection is disabled', async () => {
    // The escape hatch behind "Search 飲んだ instead" — one request, no
    // substitution, so a wrong guess is always recoverable.
    const fetchMock = stubJisho({
      飲んだ: [{ word: '飲んだくれ', reading: 'のんだくれ' }],
      飲む: [{ word: '飲む', reading: 'のむ', isCommon: true }],
    });

    const { results, resolvedFrom } = await searchWords('飲んだ', { allowDeinflection: false });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results[0].word).toBe('飲んだくれ');
    expect(resolvedFrom).toBeNull();
  });

  it('surfaces a user-facing message when the first request fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 502, statusText: 'Bad Gateway' })));

    await expect(searchWords('食べる')).rejects.toThrow('Word lookup failed. Please try again.');
  });

  it('does not leak a JSON parse error to the user', async () => {
    // A proxy returning an HTML error page with a 200.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => { throw new SyntaxError("Unexpected token '<'"); },
    })));

    await expect(searchWords('食べる')).rejects.toThrow('Word lookup failed. Please try again.');
  });
});
