/**
 * Merge the analyzer's morphemes into Tokens — the tap targets a learner sees.
 *
 * IPADIC emits morphemes, not words (行きました → 行き|まし|た), and 行き is not
 * lookupable. CONTEXT.md defines Morpheme vs Token; ADR-0003, "Tokens are
 * chunked on the client", carries the rules below and the evidence for them.
 *
 * No test file by design: a rule only means anything against morphemes the real
 * analyzer emits, so these are tested through `analyzeSentence()` against
 * recorded fixtures.
 */

/**
 * Morphemes that attach to whatever came before rather than starting something
 * new. Expressed as what gets ABSORBED, never as what starts a Token: IPADIC
 * never tags a noun 自立, so the inverted phrasing would leave every noun
 * homeless. See ADR-0003, "Corrections the evidence forced".
 */

/** Auxiliaries — だ, まし, た, なかっ, ます. Pure inflection, never standalone. */
const DEPENDENT_POS = new Set(['助動詞']);

/**
 * Sub-categories that attach to the preceding word:
 *   非自立  bound forms — ください, いる (in ている), いい
 *   接尾    suffixes — 駅 (東京駅), さん (山田さん), られ/させ (passive/causative)
 */
const DEPENDENT_DETAIL = new Set(['非自立', '接尾']);

/**
 * The copula — です, だ, and な (its attributive form), all tagged 助動詞 with
 * baseForm です or だ.
 *
 * Not identifiable by the auxiliary alone: 飲んだ's past-tense だ is also
 * baseForm だ and must absorb, or 飲んだ falls apart. What separates them is
 * what it attaches to — see `acceptsCopula`.
 */
const COPULA_LEMMAS = new Set(['です', 'だ']);

/**
 * Auxiliaries carrying meaning of their own rather than just inflecting.
 * They stand alone; pure inflection (まし, た, ませ, ん, なかっ, れる, られる)
 * keeps absorbing. Absorbed, いるらしいです renders as "→ いる", hiding the
 * hearsay marker inside a verb.
 */
const STANDALONE_AUX = new Set(['らしい', 'よう', 'そう', 'みたい']);

/**
 * A bound NOUN — こと, よう, もの, とき, tagged 名詞/非自立.
 *
 * Unlike a bound verb form these stand alone: they are formal nouns with real
 * dictionary entries, and absorbing them offers 来ること and 話せるよう as tap
 * targets.
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
 * Only while inflecting a verb or adjective — 面白い+です is one word, 傘+です is
 * a noun plus a copula. Phrased as what MAY absorb so an unrecognised morpheme,
 * which carries no POS tag at all, fails safe to "stands alone" rather than
 * swallowing the copula (ペヤングです). See ADR-0003.
 */
function acceptsCopula(headPos) {
  return headPos === '形容詞' || headPos === '動詞' || headPos === '助動詞';
}

/**
 * IPADIC files three different things under 接尾 and only one builds a new word.
 * The second sub-category separates them:
 *   一般 / 地域 …  word-building — 東京駅, 子供たち. The merged text is the lookup.
 *   人名 …         honorifics — さん, 様, 君. In no dictionary; lookup stays 山田.
 *   助数詞 …       counters — 杯, 時間, 円. In no dictionary either.
 *
 * Excluded here so the visible span stays 山田さん while the lookup is 山田 —
 * getting it wrong costs a dead-end tap, not wrong text. See ADR-0003.
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
 * する attaching to a サ変接続 noun — 勉強+する, 出席+する. The largest verb
 * class in Japanese; split, it shows 勉強 and し as unrelated words.
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
    // What a lookup should search — the head morpheme's lemma (飲んだ → 飲む).
    // Already deinflected by the analyzer, which is why the Sentence tab handles
    // adjectives that the Dictionary tab's deinflect.js does not.
    baseForm: morpheme.baseForm,
    // Part of speech of the head morpheme, e.g. 動詞, 名詞, 助詞.
    pos: morpheme.pos,
    // False for punctuation: not a tap target, and not announced as a button.
    isInteractive: !isSymbol(morpheme),
    // IPADIC didn't recognise it. Still tappable — the lookup may find nothing,
    // but its kanji can be drilled.
    isUnknown: Boolean(morpheme.isUnknown),
    // A second lemma to try when `baseForm` finds nothing. null on every Token
    // but a derivational merge.
    fallbackBaseForm: null,
  };
}

/**
 * Merge `morphemes` into Tokens, in order. Every morpheme lands in exactly one
 * Token.
 *
 * Particles and punctuation stand alone AND close the Token before them, so
 * nothing attaches across one: ください in 乗り換えてください starts its own
 * Token because the particle て sits between it and the verb.
 *
 * The rule in full, and the evidence for each clause: ADR-0003, "Tokens are
 * chunked on the client".
 */
export function chunk(morphemes) {
  const tokens = [];
  // The Token able to accept dependents, or null after a particle or
  // punctuation closed one.
  let open = null;
  // The morpheme that started `open` — some rules key off the HEAD's tags
  // rather than the Token's accumulated text.
  let head = null;
  // Whether a copula may join `open`. Tracked rather than derived from `head`:
  // a サ変 noun that has absorbed する is verbal from that point on, and without
  // this 出席しませんでした breaks apart at でし.
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
      // The compound verb's dictionary form, not either half's: 勉強し → 勉強する.
      open.baseForm = `${head.surface}する`;
      takesCopula = true;
      continue;
    }

    const copulaBlocked = isCopula(morpheme) && !takesCopula;

    if (open && isDependent(morpheme) && !copulaBlocked) {
      open.surface += morpheme.surface;
      // A derivational suffix makes a new word, so the merged text becomes the
      // lookup string; inflection and honorifics leave the head's lemma alone.
      if (isDerivationalSuffix(morpheme)) {
        open.baseForm = open.surface;
        // The dictionary may not carry the compound just built (東京駅 has no
        // Jisho entry), so keep somewhere to fall back to. Always the HEAD's
        // lemma, never a partially-merged string, so 東京駅前 still yields 東京.
        open.fallbackBaseForm = head.baseForm;
      }
      continue;
    }

    // Everything else starts a Token, including a dependent with nothing to
    // attach to — a Sentence can open mid-phrase.
    open = startToken(morpheme);
    head = morpheme;
    takesCopula = acceptsCopula(morpheme.pos);
    tokens.push(open);
  }

  return tokens;
}
