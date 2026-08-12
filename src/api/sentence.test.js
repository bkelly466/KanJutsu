import { describe, it, expect, vi, afterEach } from 'vitest';
import { normalizeMorpheme, analyzeSentence } from './sentence';

describe('normalizeMorpheme', () => {
  it('passes a well-formed morpheme through unchanged', () => {
    expect(
      normalizeMorpheme({
        surface: '行き',
        baseForm: '行く',
        pos: '動詞',
        posDetail: '自立',
        reading: 'イキ',
        isUnknown: false,
      }),
    ).toEqual({
      surface: '行き',
      baseForm: '行く',
      pos: '動詞',
      posDetail: '自立',
      reading: 'イキ',
      isUnknown: false,
    });
  });

  it('falls back to the surface form when there is no lemma', () => {
    // Particles, punctuation and unrecognised words have no separate dictionary
    // form. Filling it in here means a lookup never has to check for itself.
    const m = normalizeMorpheme({ surface: 'を', baseForm: '' });
    expect(m.baseForm).toBe('を');
  });

  it('defaults the optional fields rather than leaking undefined into the UI', () => {
    expect(normalizeMorpheme({ surface: 'ズンドコ' })).toEqual({
      surface: 'ズンドコ',
      baseForm: 'ズンドコ',
      pos: '',
      posDetail: '',
      reading: '',
      isUnknown: false,
    });
  });

  it('returns null for an item with no surface form', () => {
    // There would be nothing to render, so the caller drops it.
    expect(normalizeMorpheme({})).toBeNull();
    expect(normalizeMorpheme({ surface: '' })).toBeNull();
    expect(normalizeMorpheme(null)).toBeNull();
  });
});

/* -------------------------------------------------------------------------- */
/* analyzeSentence                                                            */
/*                                                                            */
/* `fetch` is stubbed, so these run offline like the rest of the suite.        */
/*                                                                            */
/* The payload below is REAL RECORDED OUTPUT from the analyzer, captured by    */
/* invoking the built Lambda package rather than written by hand. That matters:*/
/* the option this design replaced (TinySegmenter) was rejected precisely      */
/* because assumptions about what a segmenter emits turned out to be wrong, so */
/* hand-written fixtures would reintroduce exactly that error. See ADR-0003.   */
/*                                                                            */
/* Note that nothing here asserts the absolute request URL. The analyzer's URL */
/* is read from amplify_outputs.json, which is a real sandbox URL locally and  */
/* a `{}` stub in CI — asserting on it would pass on one machine and fail on   */
/* the other.                                                                  */
/* -------------------------------------------------------------------------- */

/** Recorded for 昨日、友達と映画を見に行きました。 */
const RECORDED = [
  { surface: '昨日', baseForm: '昨日', pos: '名詞', posDetail: '副詞可能', reading: 'キノウ', isUnknown: false },
  { surface: '、', baseForm: '、', pos: '記号', posDetail: '読点', reading: '、', isUnknown: false },
  { surface: '友達', baseForm: '友達', pos: '名詞', posDetail: '一般', reading: 'トモダチ', isUnknown: false },
  { surface: 'と', baseForm: 'と', pos: '助詞', posDetail: '並立助詞', reading: 'ト', isUnknown: false },
  { surface: '映画', baseForm: '映画', pos: '名詞', posDetail: '一般', reading: 'エイガ', isUnknown: false },
  { surface: 'を', baseForm: 'を', pos: '助詞', posDetail: '格助詞', reading: 'ヲ', isUnknown: false },
  { surface: '見', baseForm: '見る', pos: '動詞', posDetail: '自立', reading: 'ミ', isUnknown: false },
  { surface: 'に', baseForm: 'に', pos: '助詞', posDetail: '格助詞', reading: 'ニ', isUnknown: false },
  { surface: '行き', baseForm: '行く', pos: '動詞', posDetail: '自立', reading: 'イキ', isUnknown: false },
  { surface: 'まし', baseForm: 'ます', pos: '助動詞', posDetail: '', reading: 'マシ', isUnknown: false },
  { surface: 'た', baseForm: 'た', pos: '助動詞', posDetail: '', reading: 'タ', isUnknown: false },
  { surface: '。', baseForm: '。', pos: '記号', posDetail: '句点', reading: '。', isUnknown: false },
];

/** Stub fetch with a successful analyzer response. */
function stubAnalyzer(morphemes) {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ morphemes }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Pull the `text` query parameter back out of a recorded fetch call. */
function requestedText(fetchMock) {
  return decodeURIComponent(fetchMock.mock.calls[0][0].match(/text=([^&]*)/)[1]);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('analyzeSentence', () => {
  it('returns the analyzer’s morphemes in order', async () => {
    stubAnalyzer(RECORDED);

    const { morphemes } = await analyzeSentence('昨日、友達と映画を見に行きました。');

    expect(morphemes.map((m) => m.surface)).toEqual([
      '昨日', '、', '友達', 'と', '映画', 'を', '見', 'に', '行き', 'まし', 'た', '。',
    ]);
  });

  it('carries the lemma and POS tags the merge rule will need', async () => {
    // This is the whole reason the analyzer is worth 12.5 MB: 行き is not a word
    // you can look up, and only the POS tags say that まし and た belong with it
    // while を and に do not. Ticket #20 consumes exactly these fields.
    stubAnalyzer(RECORDED);

    const { morphemes } = await analyzeSentence('昨日、友達と映画を見に行きました。');
    const iki = morphemes.find((m) => m.surface === '行き');

    expect(iki.baseForm).toBe('行く');
    expect(iki.pos).toBe('動詞');
    expect(iki.posDetail).toBe('自立');
    expect(morphemes.find((m) => m.surface === 'まし').pos).toBe('助動詞');
    expect(morphemes.find((m) => m.surface === 'を').pos).toBe('助詞');
  });

  it('makes exactly one request, with the sentence url-encoded', async () => {
    const fetchMock = stubAnalyzer(RECORDED);

    await analyzeSentence('本を読む');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestedText(fetchMock)).toBe('本を読む');
  });

  it('trims surrounding whitespace before sending', async () => {
    const fetchMock = stubAnalyzer(RECORDED);

    await analyzeSentence('  本を読む\n');

    expect(requestedText(fetchMock)).toBe('本を読む');
  });

  it('returns empty for blank input without fetching at all', async () => {
    const fetchMock = stubAnalyzer(RECORDED);

    await expect(analyzeSentence('   ')).resolves.toEqual({ morphemes: [] });
    await expect(analyzeSentence('')).resolves.toEqual({ morphemes: [] });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps an unrecognised word as a morpheme rather than dropping it', async () => {
    // A name the dictionary doesn't know still has to reach the screen — the
    // user can drill its kanji even when there's no entry for the whole word.
    stubAnalyzer([
      { surface: 'ズンドコベロンチョ', baseForm: 'ズンドコベロンチョ', pos: '', posDetail: '', reading: '', isUnknown: true },
    ]);

    const { morphemes } = await analyzeSentence('ズンドコベロンチョ');

    expect(morphemes).toHaveLength(1);
    expect(morphemes[0].isUnknown).toBe(true);
  });

  it('drops a malformed morpheme instead of rendering a blank tap target', async () => {
    stubAnalyzer([...RECORDED.slice(0, 1), { baseForm: '???' }]);

    const { morphemes } = await analyzeSentence('昨日');

    expect(morphemes).toHaveLength(1);
    expect(morphemes[0].surface).toBe('昨日');
  });

  it('treats a response with no morphemes array as an empty result', async () => {
    stubAnalyzer(undefined);

    await expect(analyzeSentence('あ')).resolves.toEqual({ morphemes: [] });
  });

  it('survives a body that is null, or a morphemes field of the wrong type', async () => {
    // Without the Array.isArray guard these throw a raw TypeError, and
    // "x.map is not a function" lands on screen instead of the error copy.
    for (const body of [null, { morphemes: 'nope' }, { morphemes: {} }]) {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => body })));
      await expect(analyzeSentence('あ')).resolves.toEqual({ morphemes: [] });
    }
  });

  it('throws user-facing copy on a network failure, keeping the detail in cause', async () => {
    const boom = new Error('Failed to fetch');
    vi.stubGlobal('fetch', vi.fn(async () => { throw boom; }));

    await expect(analyzeSentence('本')).rejects.toThrow(/check your connection/i);
    await expect(analyzeSentence('本')).rejects.toHaveProperty('cause', boom);
  });

  it('explains a 400 rather than telling the user to retry something that cannot work', async () => {
    // The analyzer rejected the input itself (too long). "Please try again"
    // would send the user round a loop that is guaranteed to fail.
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400 })));

    await expect(analyzeSentence('あ'.repeat(301))).rejects.toThrow(/300 characters maximum/);
    await expect(analyzeSentence('あ'.repeat(301))).rejects.not.toThrow(/try again/);
  });

  it('throws user-facing copy on an HTTP error, naming the status in cause', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));

    await expect(analyzeSentence('本')).rejects.toThrow(/Could not analyze the sentence/i);
    await expect(analyzeSentence('本')).rejects.toMatchObject({
      cause: { message: expect.stringContaining('500') },
    });
  });

  it('throws user-facing copy when the response body is not JSON', async () => {
    // A gateway can return an HTML error page with a 200. Without this the user
    // would see a raw "Unexpected token '<'" on screen.
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    })));

    await expect(analyzeSentence('本')).rejects.toThrow(/Could not analyze the sentence/i);
  });
});
