import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  normalizeMorpheme,
  analyzeSentence,
  warmUpAnalyzer,
  containsJapanese,
  MAX_SENTENCE_LENGTH,
} from './sentence';
import { CORPUS } from './sentence.fixtures';

/**
 * Pin the analyzer URL.
 *
 * sentence.js reads it from amplify_outputs.json, which is a REAL sandbox URL
 * on a developer's machine and a `{}` stub in CI (see the workflow). Anything
 * conditioned on that value — asserting the request URL, or the "not
 * configured" guard in warmUpAnalyzer — would otherwise pass on one machine and
 * fail on the other. Mocking the import makes this suite say the same thing
 * everywhere, which is the whole point of an offline test.
 */
vi.mock('../../amplify_outputs.json', () => ({
  default: { custom: { sentenceAnalyzerUrl: 'https://analyzer.test/' } },
}));

/* -------------------------------------------------------------------------- */
/* Test seam                                                                  */
/*                                                                            */
/* Everything here attaches to analyzeSentence() with `fetch` stubbed, so the  */
/* suite runs offline like the rest of the project. src/utils/chunk.js gets    */
/* NO test file of its own: the merge rule is only meaningful against          */
/* morphemes IPADIC really emits, so testing it in isolation would test less   */
/* while costing a second seam. One seam, real inputs. See ADR-0003.           */
/*                                                                            */
/* The inputs in sentence.fixtures.js are RECORDED from the deployed analyzer  */
/* by scripts/record-corpus.mjs, never hand-written — being wrong about what a */
/* segmenter emits is exactly what disqualified the lighter alternative during */
/* design. The expected boundaries below were reviewed by hand.                */
/*                                                                            */
/* The analyzer URL is mocked at the top of this file, so request URLs can be   */
/* asserted and mean the same thing on every machine.                          */
/* -------------------------------------------------------------------------- */

/** Look up recorded analyzer output for a corpus sentence. */
function recorded(sentence) {
  const entry = CORPUS.find((c) => c.sentence === sentence);
  if (!entry) throw new Error(`No recorded fixture for "${sentence}" — re-run scripts/record-corpus.mjs`);
  return entry.morphemes;
}

/** Stub fetch with a successful analyzer response. */
function stubAnalyzer(morphemes) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ morphemes }) }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Stub fetch so it replays whichever corpus sentence was requested. */
function stubCorpus() {
  const fetchMock = vi.fn(async (url) => {
    const text = decodeURIComponent(url.match(/text=([^&]*)/)[1]);
    return { ok: true, json: async () => ({ morphemes: recorded(text) }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Pull the `text` query parameter back out of a recorded fetch call. */
function requestedText(fetchMock) {
  return decodeURIComponent(fetchMock.mock.calls[0][0].match(/text=([^&]*)/)[1]);
}

/** The Token boundaries a caller sees, as a readable string. */
async function boundariesOf(sentence) {
  const { tokens } = await analyzeSentence(sentence);
  return tokens.map((t) => t.surface).join(' | ');
}

afterEach(() => {
  vi.unstubAllGlobals();
});

/* -------------------------------------------------------------------------- */
/* The corpus — roughly 30 sentences spanning N5-N3 grammar                    */
/* -------------------------------------------------------------------------- */

const EXPECTED_BOUNDARIES = [
  ["昨日ビールを飲んだ。", "昨日 | ビール | を | 飲んだ | 。"],
  ["昨日、友達と映画を見に行きました。", "昨日 | 、 | 友達 | と | 映画 | を | 見 | に | 行きました | 。"],
  ["東京駅で新幹線に乗り換えてください。", "東京駅 | で | 新幹線 | に | 乗り換え | て | ください | 。"],
  ["面白くなかった。", "面白くなかった | 。"],
  ["この本は面白いです。", "この | 本 | は | 面白いです | 。"],
  ["静かな部屋で勉強しています。", "静か | な | 部屋 | で | 勉強し | て | います | 。"],
  ["彼女はきれいな声で歌う。", "彼女 | は | きれい | な | 声 | で | 歌う | 。"],
  ["毎日コーヒーを三杯飲みます。", "毎日 | コーヒー | を | 三杯 | 飲みます | 。"],
  ["二時間ぐらい待ちました。", "二時間 | ぐらい | 待ちました | 。"],
  ["私は日本語を勉強しています。", "私 | は | 日本語 | を | 勉強し | て | います | 。"],
  ["子供たちが公園で遊んでいる。", "子供たち | が | 公園 | で | 遊ん | で | いる | 。"],
  ["私の友達は日本に住んでいます。", "私 | の | 友達 | は | 日本 | に | 住ん | で | います | 。"],
  ["先生に褒められました。", "先生 | に | 褒められました | 。"],
  ["母に野菜を食べさせられた。", "母 | に | 野菜 | を | 食べさせられた | 。"],
  ["彼が来ることを知っていますか。", "彼 | が | 来る | こと | を | 知っ | て | います | か | 。"],
  ["あまり高くないと思います。", "あまり | 高くない | と | 思います | 。"],
  ["ご飯を食べてから出かけます。", "ご飯 | を | 食べ | て | から | 出かけます | 。"],
  ["走って学校に行った。", "走っ | て | 学校 | に | 行った | 。"],
  ["昨日は忙しくて、寝られなかった。", "昨日 | は | 忙しく | て | 、 | 寝られなかった | 。"],
  ["窓を開けてもいいですか。", "窓 | を | 開け | て | も | いいです | か | 。"],
  ["宿題をしなければなりません。", "宿題 | を | しなけれ | ば | なりません | 。"],
  ["日本語が話せるようになりました。", "日本語 | が | 話せる | よう | に | なりました | 。"],
  ["彼は日本語も英語も話せる。", "彼 | は | 日本語 | も | 英語 | も | 話せる | 。"],
  ["電車が遅れているらしいです。", "電車 | が | 遅れ | て | いる | らしいです | 。"],
  ["明日は雨が降るでしょう。", "明日 | は | 雨 | が | 降るでしょう | 。"],
  ["山田さんは会議に出席しませんでした。", "山田さん | は | 会議 | に | 出席しませんでした | 。"],
  ["その問題は難しすぎる。", "その | 問題 | は | 難しすぎる | 。"],
  ["お茶を飲みながら話しましょう。", "お茶 | を | 飲み | ながら | 話しましょう | 。"],
  ["雨が降ったら、家にいます。", "雨 | が | 降ったら | 、 | 家 | に | います | 。"],
  ["犬と猫のどちらが好きですか。", "犬 | と | 猫 | の | どちら | が | 好き | です | か | 。"],
  ["これは誰の傘ですか。", "これ | は | 誰 | の | 傘 | です | か | 。"],
  ["私は寿司が大好きです。", "私 | は | 寿司 | が | 大好き | です | 。"],
];

describe('analyzeSentence — Token boundaries across the corpus', () => {
  it.each(EXPECTED_BOUNDARIES)('%s', async (sentence, expected) => {
    stubCorpus();
    expect(await boundariesOf(sentence)).toBe(expected);
  });
});

/* -------------------------------------------------------------------------- */
/* The specific rules the corpus above is checking, called out by name         */
/* -------------------------------------------------------------------------- */

describe('the merge rule', () => {
  it('absorbs auxiliaries into the verb they inflect (飲ん+だ → 飲んだ)', async () => {
    stubCorpus();
    // The motivating case from the spec: 行き is not lookupable on its own, so
    // 行き+まし+た must merge, while と and を must not.
    expect(await boundariesOf('昨日ビールを飲んだ。')).toBe('昨日 | ビール | を | 飲んだ | 。');
  });

  it('leaves particles standing alone rather than gluing them to nouns', async () => {
    stubCorpus();
    // で inside the tap target would make the lookup "at Tokyo Station" rather
    // than the station. は vs. が is also exactly what a beginner taps on.
    const boundaries = await boundariesOf('東京駅で新幹線に乗り換えてください。');
    expect(boundaries).toBe('東京駅 | で | 新幹線 | に | 乗り換え | て | ください | 。');
  });

  it('never absorbs a particle into a preceding Token, anywhere in the corpus', async () => {
    stubCorpus();
    for (const [sentence] of EXPECTED_BOUNDARIES) {
      const { tokens } = await analyzeSentence(sentence);
      const particles = tokens.filter((t) => t.pos === '助詞');

      // Assert the POPULATION first. Without this the test passes vacuously:
      // a change that absorbed particles into the preceding Token would leave
      // `particles` empty, the loop below would never run, and a test named
      // "never absorbs a particle" would happily go green.
      const expected = recorded(sentence).filter((m) => m.pos === '助詞').length;
      expect(particles).toHaveLength(expected);

      // A particle Token is exactly its own morpheme — never a longer string
      // with something merged onto it.
      for (const particle of particles) {
        expect(particle.surface).toBe(particle.baseForm);
      }
    }
  });

  it('loses no text: the Tokens always rejoin to the analyzed input', async () => {
    stubCorpus();
    for (const [sentence] of EXPECTED_BOUNDARIES) {
      const { tokens } = await analyzeSentence(sentence);
      const rejoined = tokens.map((t) => t.surface).join('');
      const analyzed = recorded(sentence).map((m) => m.surface).join('');
      // Every morpheme must land in exactly one Token — nothing dropped, and
      // nothing counted twice. A merge rule that silently ate a morpheme would
      // show the learner a sentence they didn't paste.
      expect(rejoined).toBe(analyzed);
    }
  });

  it('merges a noun suffix into the word it builds (東京+駅 → 東京駅)', async () => {
    stubCorpus();
    const { tokens } = await analyzeSentence('東京駅で新幹線に乗り換えてください。');
    const station = tokens[0];
    expect(station.surface).toBe('東京駅');
    // A suffix builds a NEW word, so the merged text is what a lookup searches —
    // unlike an auxiliary, where the head's lemma is already the dictionary form.
    expect(station.baseForm).toBe('東京駅');
    // …but the dictionary doesn't always carry the word this rule just built:
    // Jisho has no 東京駅 entry, which made this the one dead-end tap in the
    // measured corpus. The head's lemma rides along so the lookup can fall back
    // to 東京 (issue #30); tokenLookup.js decides when to use it.
    expect(station.fallbackBaseForm).toBe('東京');
  });

  it('carries a fallback lemma ONLY where a derivational suffix was merged', async () => {
    stubCorpus();
    const withFallback = [];

    for (const [sentence] of EXPECTED_BOUNDARIES) {
      const { tokens } = await analyzeSentence(sentence);
      for (const token of tokens) {
        if (token.fallbackBaseForm) withFallback.push(`${token.baseForm} → ${token.fallbackBaseForm}`);
      }
    }

    // The whole corpus, exhaustively: two Tokens, both of them a noun plus a
    // word-building suffix. Everything else — 行きました, 山田さん (honorific),
    // 三杯 (counter), 食べさせられた (verb suffixes) — already looks up a lemma
    // the dictionary carries, and a fallback there could only add a second
    // request and a chance to answer the wrong question.
    expect(withFallback).toEqual(['東京駅 → 東京', '子供たち → 子供']);
  });

  it('keeps the copula separate from a noun (傘 | です), but not from an adjective', async () => {
    stubCorpus();
    // です after a noun is a free-standing copula with its own entry; 傘です is
    // not a word. After an adjective it's polite inflection and belongs inside.
    // IPADIC can't tell them apart by the auxiliary alone — 飲んだ's past-tense
    // だ is also baseForm だ — so the rule keys off the head's part of speech.
    expect(await boundariesOf('これは誰の傘ですか。')).toContain('傘 | です');
    expect(await boundariesOf('この本は面白いです。')).toContain('面白いです');
  });

  it('keeps a bound noun tappable (来る | こと) instead of building a non-word', async () => {
    stubCorpus();
    // こと and よう are formal nouns with real dictionary entries, and they are
    // the grammar a learner most wants to tap. Absorbing them would offer
    // 来ること and 話せるよう as words, which they are not.
    expect(await boundariesOf('彼が来ることを知っていますか。')).toContain('来る | こと');
    expect(await boundariesOf('日本語が話せるようになりました。')).toContain('話せる | よう');
  });

  it('resolves a conjugated Token to its dictionary form', async () => {
    stubCorpus();
    const { tokens } = await analyzeSentence('昨日、友達と映画を見に行きました。');
    const went = tokens.find((t) => t.surface === '行きました');
    expect(went.baseForm).toBe('行く');
  });

  it('deinflects an adjective, which the Dictionary tab still cannot do', async () => {
    stubCorpus();
    // ADR-0002 leaves adjectives unhandled in deinflect.js; IPADIC handles them,
    // so the Sentence tab is quietly better at this. Documented in ADR-0003.
    const { tokens } = await analyzeSentence('面白くなかった。');
    expect(tokens[0].surface).toBe('面白くなかった');
    expect(tokens[0].baseForm).toBe('面白い');
  });

  it('marks punctuation non-interactive but still renders it', async () => {
    stubCorpus();
    const { tokens } = await analyzeSentence('昨日、友達と映画を見に行きました。');
    const marks = tokens.filter((t) => t.pos === '記号');

    expect(marks.map((t) => t.surface)).toEqual(['、', '。']);
    // A learner shouldn't tap a full stop expecting a definition, and a screen
    // reader shouldn't announce it as a button.
    expect(marks.every((t) => t.isInteractive === false)).toBe(true);
    // Everything that isn't punctuation is a tap target, including particles.
    expect(tokens.filter((t) => t.pos !== '記号').every((t) => t.isInteractive)).toBe(true);
  });

  it('keeps an unrecognised word as one interactive Token', async () => {
    // A name the dictionary doesn't know still has to be tappable — the user can
    // drill its kanji even when there's no entry for the whole word.
    stubAnalyzer([
      { surface: 'ズンドコベロンチョ', baseForm: 'ズンドコベロンチョ', pos: '', posDetail: '', reading: '', isUnknown: true },
      { surface: 'を', baseForm: 'を', pos: '助詞', posDetail: '格助詞', reading: 'ヲ', isUnknown: false },
    ]);

    const { tokens } = await analyzeSentence('ズンドコベロンチョを');

    expect(tokens.map((t) => t.surface)).toEqual(['ズンドコベロンチョ', 'を']);
    expect(tokens[0].isUnknown).toBe(true);
    expect(tokens[0].isInteractive).toBe(true);
  });

  /*
   * The cases below build morpheme arrays BY HAND, which the rest of this suite
   * refuses to do — so the exception needs justifying.
   *
   * A corpus of well-formed textbook sentences structurally cannot reach these
   * shapes: none of the 32 contains a word IPADIC doesn't know. And the shape of
   * an unrecognised morpheme isn't an assumption about IPADIC at all — it's
   * defined by our own handler, which sets `pos: ''` for anything tagged UNK.
   * So these assert against a contract we control, not one we guessed at.
   *
   * This gap is exactly what let the copula bug below ship past 32 green tests.
   */

  /** Build one morpheme, defaulting the fields these cases don't care about. */
  const morpheme = (surface, pos, posDetail = '', extra = {}) => ({
    surface,
    baseForm: surface,
    pos,
    posDetail,
    posDetail2: '',
    reading: '',
    isUnknown: false,
    ...extra,
  });

  it('does not glue the copula onto an unrecognised word', async () => {
    // ペヤング is a real product name IPADIC doesn't have. Our handler gives an
    // unknown morpheme `pos: ''`, so a rule phrased as "copula stands alone
    // after a 名詞" would let it absorb here and offer ペヤングです as a word —
    // teaching a false boundary, and in #21 searching text the chip doesn't show.
    stubAnalyzer([
      morpheme('ペヤング', '', '', { isUnknown: true }),
      morpheme('です', '助動詞', '', { baseForm: 'です' }),
    ]);

    expect(await boundariesOf('ペヤングです')).toBe('ペヤング | です');
  });

  it('does not glue the copula onto an adverb either', async () => {
    // Same hole, different tag: the rule must name what MAY take a copula
    // (verbs and adjectives), so anything unexpected fails safe to standing alone.
    stubAnalyzer([
      morpheme('ゆっくり', '副詞', '一般'),
      morpheme('です', '助動詞', '', { baseForm: 'です' }),
    ]);

    expect(await boundariesOf('ゆっくりです')).toBe('ゆっくり | です');
  });

  it('still merges the copula into an adjective, and past だ into a verb', async () => {
    // The other side of the same rule — over-correcting would break these.
    // Note 飲んだ's past-tense だ has baseForm だ, identical to the copula, so
    // the two can only be told apart by what they attach to.
    stubAnalyzer([
      morpheme('面白い', '形容詞', '自立'),
      morpheme('です', '助動詞', '', { baseForm: 'です' }),
    ]);
    expect(await boundariesOf('面白いです')).toBe('面白いです');

    stubAnalyzer([
      morpheme('飲ん', '動詞', '自立', { baseForm: '飲む' }),
      morpheme('だ', '助動詞', '', { baseForm: 'だ' }),
    ]);
    expect(await boundariesOf('飲んだ')).toBe('飲んだ');
  });

  it('keeps the lookup on the head for an honorific, not the merged text', async () => {
    // 山田さん is the right span to SHOW, but searching it finds nothing while
    // 山田 finds the surname. A tap that dead-ends reads as the app being
    // broken rather than the word being absent. IPADIC's second subcategory
    // (人名) is what separates this from 東京+駅.
    stubAnalyzer([
      morpheme('山田', '名詞', '固有名詞'),
      morpheme('さん', '名詞', '接尾', { posDetail2: '人名' }),
    ]);

    const { tokens } = await analyzeSentence('山田さん');

    expect(tokens[0].surface).toBe('山田さん');
    expect(tokens[0].baseForm).toBe('山田');
    // No fallback either: the lookup is already the head's lemma, so there is
    // nothing left to fall back TO. Setting one here would spend a second
    // request re-asking the question that just failed.
    expect(tokens[0].fallbackBaseForm).toBeNull();
  });

  it('starts a Token from a dependent morpheme with nothing to attach to', async () => {
    // A Sentence pasted mid-phrase opens with an auxiliary. It must not vanish.
    stubAnalyzer([
      { surface: 'まし', baseForm: 'ます', pos: '助動詞', posDetail: '', reading: 'マシ', isUnknown: false },
      { surface: 'た', baseForm: 'た', pos: '助動詞', posDetail: '', reading: 'タ', isUnknown: false },
    ]);

    const { tokens } = await analyzeSentence('ました');

    expect(tokens.map((t) => t.surface)).toEqual(['ました']);
  });
});

/* -------------------------------------------------------------------------- */
/* Input guards — no request is made for input we already know is unusable     */
/* -------------------------------------------------------------------------- */

describe('containsJapanese', () => {
  it('accepts hiragana, katakana and kanji', () => {
    expect(containsJapanese('ひらがな')).toBe(true);
    expect(containsJapanese('カタカナ')).toBe(true);
    // Halfwidth katakana is unambiguously Japanese — it turns up in text copied
    // from receipts, older sites and some IME output. Refusing it would tell a
    // learner their Japanese isn't Japanese, the worst kind of wrong label.
    expect(containsJapanese('ﾆﾎﾝｺﾞ')).toBe(true);
    expect(containsJapanese('漢字')).toBe(true);
    expect(containsJapanese('Mixed 日本語 text')).toBe(true);
  });

  it('rejects text with no Japanese in it', () => {
    expect(containsJapanese('hello world')).toBe(false);
    expect(containsJapanese('12345')).toBe(false);
    expect(containsJapanese('')).toBe(false);
    expect(containsJapanese(undefined)).toBe(false);
  });

  it('does not count Japanese punctuation as Japanese', () => {
    // A string of full stops is not text to analyze, and treating it as such
    // would spend a cold start on nothing.
    expect(containsJapanese('。。。')).toBe(false);
    expect(containsJapanese('、')).toBe(false);
    // Halfwidth punctuation is excluded for the same reason as fullwidth.
    expect(containsJapanese('｡｢｣')).toBe(false);
  });
});

describe('analyzeSentence — input guards', () => {
  it('returns empty for blank input without fetching', async () => {
    const fetchMock = stubAnalyzer([]);

    await expect(analyzeSentence('   ')).resolves.toEqual({ tokens: [] });
    await expect(analyzeSentence('')).resolves.toEqual({ tokens: [] });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses text over the cap, without fetching, naming the actual length', async () => {
    const fetchMock = stubAnalyzer([]);
    const tooLong = 'あ'.repeat(MAX_SENTENCE_LENGTH + 1);

    // Refused outright, never silently truncated — studying a sentence that was
    // quietly cut in half is worse than being told to shorten it.
    await expect(analyzeSentence(tooLong)).rejects.toThrow(/301 characters/);
    await expect(analyzeSentence(tooLong)).rejects.toThrow(/limit is 300/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts text exactly at the cap', async () => {
    const fetchMock = stubAnalyzer([]);

    await analyzeSentence('あ'.repeat(MAX_SENTENCE_LENGTH));

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fires no request at all when the text has no Japanese in it', async () => {
    const fetchMock = stubAnalyzer([]);

    await expect(analyzeSentence('hello world')).rejects.toThrow(/doesn't look like Japanese/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts several sentences in one paste with no special handling', async () => {
    const fetchMock = stubAnalyzer(recorded('昨日ビールを飲んだ。'));
    const twoSentences = '昨日ビールを飲んだ。明日も飲む。';

    await analyzeSentence(twoSentences);

    // One request, carrying the text whole. Nothing splits on 。 — a paragraph
    // is analyzed in a single pass, which is what makes "paste a few sentences"
    // work without special handling.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestedText(fetchMock)).toBe(twoSentences);
  });

  it('trims surrounding whitespace before sending', async () => {
    const fetchMock = stubCorpus();

    await analyzeSentence('  昨日ビールを飲んだ。\n');

    expect(requestedText(fetchMock)).toBe('昨日ビールを飲んだ。');
  });
});

/* -------------------------------------------------------------------------- */
/* Warm-up — an optimisation, never a feature                                  */
/* -------------------------------------------------------------------------- */

describe('warmUpAnalyzer', () => {
  it('sends one tiny request to build the tokenizer', async () => {
    const fetchMock = stubAnalyzer([]);

    await warmUpAnalyzer();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Cheapest input that still forces the 12.5 MB dictionary to load.
    expect(requestedText(fetchMock)).toBe('あ');
  });

  it('swallows a network failure instead of surfacing it', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));

    // If this rejected, the tab would show an error for something the user never
    // asked for. A failed warm-up just means the next request pays the cold start.
    await expect(warmUpAnalyzer()).resolves.toBeUndefined();
  });

  it('swallows an error response too', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));

    await expect(warmUpAnalyzer()).resolves.toBeUndefined();
  });
});

/* -------------------------------------------------------------------------- */
/* Failure paths                                                               */
/* -------------------------------------------------------------------------- */

describe('analyzeSentence — failures', () => {
  it('throws user-facing copy on a network failure, keeping detail in cause', async () => {
    const boom = new Error('Failed to fetch');
    vi.stubGlobal('fetch', vi.fn(async () => { throw boom; }));

    await expect(analyzeSentence('本')).rejects.toThrow(/check your connection/i);
    await expect(analyzeSentence('本')).rejects.toHaveProperty('cause', boom);
  });

  it('explains a 400 rather than telling the user to retry what cannot work', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400 })));

    await expect(analyzeSentence('本')).rejects.toThrow(/300 characters maximum/);
    await expect(analyzeSentence('本')).rejects.not.toThrow(/try again/);
  });

  it('throws user-facing copy on an HTTP error, naming the status in cause', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));

    await expect(analyzeSentence('本')).rejects.toThrow(/Could not analyze the sentence/i);
    await expect(analyzeSentence('本')).rejects.toMatchObject({
      cause: { message: expect.stringContaining('500') },
    });
  });

  it('throws user-facing copy when the response body is not JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token <'); },
    })));

    await expect(analyzeSentence('本')).rejects.toThrow(/Could not analyze the sentence/i);
  });

  it('survives a body that is null, or a morphemes field of the wrong type', async () => {
    for (const body of [null, { morphemes: 'nope' }, { morphemes: {} }]) {
      vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => body })));
      await expect(analyzeSentence('本')).resolves.toEqual({ tokens: [] });
    }
  });

  it('drops a malformed morpheme instead of rendering a blank tap target', async () => {
    stubAnalyzer([
      { surface: '昨日', baseForm: '昨日', pos: '名詞', posDetail: '副詞可能', reading: 'キノウ', isUnknown: false },
      { baseForm: '???' },
    ]);

    const { tokens } = await analyzeSentence('昨日');

    expect(tokens).toHaveLength(1);
    expect(tokens[0].surface).toBe('昨日');
  });
});

/* -------------------------------------------------------------------------- */
/* normalizeMorpheme — the defensive pass over one raw item                    */
/* -------------------------------------------------------------------------- */

describe('normalizeMorpheme', () => {
  it('falls back to the surface form when there is no lemma', () => {
    expect(normalizeMorpheme({ surface: 'を', baseForm: '' }).baseForm).toBe('を');
  });

  it('defaults the optional fields rather than leaking undefined into the UI', () => {
    expect(normalizeMorpheme({ surface: 'ズンドコ' })).toEqual({
      surface: 'ズンドコ',
      baseForm: 'ズンドコ',
      pos: '',
      posDetail: '',
      posDetail2: '',
      reading: '',
      isUnknown: false,
    });
  });

  it('returns null for an item with no surface form', () => {
    expect(normalizeMorpheme({})).toBeNull();
    expect(normalizeMorpheme({ surface: '' })).toBeNull();
    expect(normalizeMorpheme(null)).toBeNull();
  });
});
