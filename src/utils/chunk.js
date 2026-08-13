/**
 * Merge the analyzer's morphemes into Tokens — the tap targets a learner sees.
 *
 * IPADIC emits morphemes, not words: 行きました comes back as 行き|まし|た, and
 * 行き is not something you can look up. Something has to put them back
 * together, and this is it. See docs/adr/0003-sentence-analyzer-in-lambda.md.
 *
 * This module is an internal detail of src/api/sentence.js and has no test file
 * of its own — deliberately. The rule is only meaningful against morphemes the
 * real analyzer emits, so it's tested through `analyzeSentence()` against
 * recorded fixtures, at one seam rather than two. Same reasoning that made
 * hand-written fixtures unacceptable in the first place.
 *
 * Vocabulary note: a **Morpheme** is the analyzer's raw unit; a **Token** is one
 * or more Morphemes merged into a single tap target. CONTEXT.md defines both.
 *
 * The guiding test for every rule below: **would this Token be a real thing to
 * look up?** A Token a learner taps and gets nothing from is worse than two
 * Tokens that each resolve.
 */

/**
 * Morphemes that attach to whatever came before rather than starting something
 * new.
 *
 * IMPORTANT — this is expressed as "what gets absorbed", not "what starts a
 * Token", and that is not a stylistic choice. ADR-0003 originally described the
 * rule as "start a Token at each independent (自立) word", but the recorded
 * corpus shows IPADIC never tags a noun 自立: 名詞 comes back as 一般, 代名詞,
 * 副詞可能, サ変接続, 固有名詞, 数 and so on. Keying off 自立 would leave every
 * noun in the language homeless. Listing the dependents instead is both correct
 * and shorter.
 */

/** Auxiliaries: だ, まし, た, なかっ, ます — pure inflection, never standalone. */
const DEPENDENT_POS = new Set(['助動詞']);

/**
 * Sub-categories that attach to the preceding word:
 *   非自立  bound forms — ください, いる (in ている), いい
 *   接尾    suffixes — 駅 (東京駅), さん (山田さん), られ/させ (passive/causative)
 */
const DEPENDENT_DETAIL = new Set(['非自立', '接尾']);

/**
 * The copula: です, だ, and な (its attributive form). IPADIC tags all three
 * 助動詞 with baseForm です or だ.
 *
 * It cannot be identified by the auxiliary alone — 飲んだ's past-tense だ is
 * ALSO baseForm だ, and that one must absorb or 飲んだ falls apart. What
 * separates them is what it attaches to; see `acceptsCopula`.
 */
const COPULA_LEMMAS = new Set(['です', 'だ']);

/**
 * Auxiliaries that carry meaning of their own rather than just inflecting.
 *
 * らしい (hearsay), よう/みたい (resemblance) and そう (appearance) are N4-N3
 * grammar with real dictionary entries — usually the entire point of the
 * sentence they appear in. Absorbing them produced Tokens like いるらしいです
 * whose "→ いる" actively lies to the learner, hiding the hearsay marker inside
 * a verb. Same argument that keeps bound nouns standing alone.
 *
 * Pure inflection (まし, た, ませ, ん, なかっ, れる, られる) is a different
 * animal and keeps absorbing.
 */
const STANDALONE_AUX = new Set(['らしい', 'よう', 'そう', 'みたい']);

/**
 * A bound NOUN — こと, よう, もの, とき. IPADIC tags these 名詞/非自立.
 *
 * Unlike a bound verb form, these stand alone: they are formal nouns with real
 * dictionary entries, and they are exactly the grammar a learner wants to tap.
 * Absorbing them produces non-words like 来ること and 話せるよう as visible tap
 * targets, which is the opposite of what this module is for.
 */
function isBoundNoun(morpheme) {
  return morpheme.pos === '名詞' && morpheme.posDetail === '非自立';
}

function isDependent(morpheme) {
  if (isBoundNoun(morpheme)) return false;
  if (STANDALONE_AUX.has(morpheme.baseForm)) return false;
  return DEPENDENT_POS.has(morpheme.pos) || DEPENDENT_DETAIL.has(morpheme.posDetail);
}

function isCopula(morpheme) {
  return morpheme.pos === '助動詞' && COPULA_LEMMAS.has(morpheme.baseForm);
}

/**
 * Can a copula legitimately live inside this Token?
 *
 * Only when it is inflecting a verb or an adjective — 面白い+です is the polite
 * form of one word, 降る+でしょう likewise. After anything else the copula is
 * free-standing and keeps its own Token: 傘+です is a noun plus a copula, and
 * 傘です is not a word.
 *
 * Phrased as what MAY absorb rather than what may not, on purpose. The
 * inverted form fails safe: a morpheme with no POS tag at all — which is
 * exactly what an unrecognised word gets (see handler.ts) — falls through to
 * "stands alone" instead of silently swallowing the copula. Without this,
 * pasting a product name gives the learner ペヤングです as a single "word".
 */
function acceptsCopula(headPos) {
  return headPos === '形容詞' || headPos === '動詞' || headPos === '助動詞';
}

/**
 * A derivational suffix builds a NEW word, so the merged text is the dictionary
 * form: 東京 + 駅 should look up 東京駅, not 東京.
 *
 * But IPADIC files three different things under 接尾, and only one of them
 * behaves that way. The second sub-category separates them:
 *   一般 / 地域 …  genuine word-building — 東京駅, 子供たち. Merged text wins.
 *   人名 …         honorifics — さん, 様, 君. "山田さん" is in no dictionary;
 *                  the lookup must stay 山田.
 *   助数詞 …       counters — 杯, 時間, 円. "三杯" is in no dictionary either.
 *
 * Getting this wrong doesn't corrupt the visible text — 山田さん is the right
 * span to show — it just makes the tap a dead end, which the learner would read
 * as the app being broken rather than the word being absent.
 *
 * Getting it *right* can still dead-end: 東京駅 is genuinely a word, and Jisho
 * still has no entry for it. That's what `fallbackBaseForm` is for — see the
 * merge loop.
 */
const NON_DERIVATIONAL_SUFFIXES = new Set(['人名', '助数詞']);

function isDerivationalSuffix(morpheme) {
  return (
    morpheme.pos === '名詞' &&
    morpheme.posDetail === '接尾' &&
    !NON_DERIVATIONAL_SUFFIXES.has(morpheme.posDetail2)
  );
}

/**
 * する attaching to a サ変接続 noun — 勉強+する, 出席+する.
 *
 * This is the largest verb class in Japanese, and leaving it split shows 勉強
 * and し as unrelated words, against the feature's whole promise that
 * 行きました is one word rather than three morphemes. Every comparable tool
 * (ichi.moe, Yomichan, Anki's Japanese support) merges these.
 */
function isSuruAfterSahen(morpheme, headMorpheme) {
  return (
    morpheme.pos === '動詞' &&
    morpheme.baseForm === 'する' &&
    headMorpheme?.pos === '名詞' &&
    headMorpheme?.posDetail === 'サ変接続'
  );
}

/** 助詞 — を, に, は, が, て, から. Always their own Token. */
function isParticle(morpheme) {
  return morpheme.pos === '助詞';
}

/** 記号 — 。, 、, brackets. Rendered, but not tappable. */
function isSymbol(morpheme) {
  return morpheme.pos === '記号';
}

function startToken(morpheme) {
  return {
    // The text as it appears in the Sentence, e.g. 飲んだ.
    surface: morpheme.surface,
    // What a lookup should search. For an inflected word this is the head
    // morpheme's lemma (飲んだ → 飲む) — the analyzer has already done the
    // deinflection, which is why the Sentence tab handles adjectives that the
    // Dictionary tab's deinflect.js does not.
    baseForm: morpheme.baseForm,
    // Part of speech of the head morpheme, e.g. 動詞, 名詞, 助詞.
    pos: morpheme.pos,
    // Punctuation is rendered but not offered as a tap target — a learner
    // shouldn't tap a full stop expecting a definition, and a screen reader
    // shouldn't announce it as a button.
    isInteractive: !isSymbol(morpheme),
    // IPADIC didn't recognise it. Still tappable: the lookup may find nothing,
    // but the user can drill its kanji.
    isUnknown: Boolean(morpheme.isUnknown),
    // A second lemma to try if `baseForm` finds nothing — see the merge loop
    // below. null for almost every Token; only a derivational merge sets it.
    fallbackBaseForm: null,
  };
}

/**
 * Merge `morphemes` into Tokens.
 *
 * The rule, in order:
 *   1. Punctuation stands alone and is non-interactive.
 *   2. Particles stand alone. This is deliberate, not a leftover — は vs. が is
 *      exactly what a beginner taps on, and the dictionary has real entries for
 *      them. Absorbing them would corrupt the lookup string (東京駅で would
 *      search "at Tokyo Station" rather than the station).
 *   3. する absorbs into a サ変接続 noun, making 勉強し one Token that looks up
 *      勉強する.
 *   4. Auxiliaries and bound forms absorb into the Token before them, unless
 *      they carry meaning of their own (らしい) or are a copula the head can't
 *      take (傘 + です).
 *   5. Anything else starts a new Token.
 *
 * Particles and punctuation also CLOSE the current Token, so nothing can attach
 * to them. That matters for 乗り換えてください: ください is a bound form, but the
 * particle て sits between it and the verb, so it becomes its own Token rather
 * than making a "てください" whose lookup would be meaningless. ください is a
 * real dictionary entry; this way a learner can tap it.
 *
 * Every morpheme lands in exactly one Token — each iteration either pushes a
 * new Token or appends to the open one, and no branch skips.
 */
export function chunk(morphemes) {
  const tokens = [];
  // The Token currently able to accept dependents, or null when the last thing
  // we emitted was closed (a particle or punctuation).
  let open = null;
  // The morpheme that started `open`. Needed because some rules depend on the
  // HEAD's tags, not the Token's accumulated text.
  let head = null;
  // Whether a copula may join `open`. Tracked rather than derived, because a
  // サ変 noun that has absorbed する is verbal from that point on — without
  // this, 出席しませんでした would break apart at でし.
  let takesCopula = false;

  for (const morpheme of morphemes) {
    if (isSymbol(morpheme) || isParticle(morpheme)) {
      tokens.push(startToken(morpheme));
      open = null;
      head = null;
      takesCopula = false;
      continue;
    }

    if (open && isSuruAfterSahen(morpheme, head)) {
      open.surface += morpheme.surface;
      // 勉強 + し looks up 勉強する — the dictionary form of the compound verb,
      // not of either half.
      open.baseForm = `${head.surface}する`;
      takesCopula = true;
      continue;
    }

    const copulaBlocked = isCopula(morpheme) && !takesCopula;

    if (open && isDependent(morpheme) && !copulaBlocked) {
      open.surface += morpheme.surface;
      // A derivational suffix makes a new word, so the whole thing becomes the
      // lookup string. Inflection and honorifics leave the head's lemma alone.
      if (isDerivationalSuffix(morpheme)) {
        open.baseForm = open.surface;
        // …but the dictionary may not carry the compound this rule just built.
        // 子供たち resolves; 東京駅 does not, and Jisho has no entry for it at
        // all, which made that tap a dead end (issue #30). Remembering the head
        // lemma lets the lookup fall back to 東京 — the word the compound is
        // built from, and a genuinely useful answer — instead of showing
        // nothing. Always the HEAD's lemma, never a partially-merged string, so
        // a second suffix (東京駅前) still falls back to 東京.
        open.fallbackBaseForm = head.baseForm;
      }
      continue;
    }

    // Everything else starts a Token — including a dependent with nothing to
    // attach to, which happens when a Sentence opens mid-phrase.
    open = startToken(morpheme);
    head = morpheme;
    takesCopula = acceptsCopula(morpheme.pos);
    tokens.push(open);
  }

  return tokens;
}
