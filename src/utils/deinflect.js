/**
 * Deinflection — turning a Surface form back into candidate Headwords.
 *
 * Jisho normally deinflects for us: searching 食べました finds 食べる. It only
 * fails when a longer Entry *begins with* the Surface form — 飲んだ returns
 * 飲んだくれ ("drunkard") and 飲む is absent from the results entirely. This
 * module covers that gap, and only that gap.
 *
 * Scope is deliberately narrow: the euphonic (音便) た/て forms, which are the
 * only shapes observed to fail. See docs/adr/0002-deinflection-fallback.md.
 *
 * This module is pure and network-free — it proposes candidates, it does not
 * verify them. Only the dictionary can say which candidate is a real word, so
 * `src/api/words.js` checks them.
 */

/**
 * Euphonic た/て endings, mapped to the Headword endings they can come from.
 *
 * These are many-to-one, which is the whole difficulty: 飲んだ and 遊んだ share
 * the んだ ending but come from 飲む and 遊ぶ. There is no way to tell them
 * apart without a dictionary, so every candidate has to be offered.
 */
const EUPHONIC_ENDINGS = {
  んだ: ['む', 'ぶ', 'ぬ'],
  んで: ['む', 'ぶ', 'ぬ'],
  った: ['う', 'つ', 'る'],
  って: ['う', 'つ', 'る'],
  いた: ['く'],
  いて: ['く'],
  いだ: ['ぐ'],
  いで: ['ぐ'],
  // した/して covers both godan す verbs (話した → 話す) and suru verbs
  // (勉強した → 勉強する). 話する and 勉強す aren't words, so the dictionary
  // discards whichever one is wrong.
  した: ['す', 'する'],
  して: ['す', 'する'],
};

/**
 * Endings that *look* like our patterns but aren't godan verbs at all.
 *
 * These are polite, copula and adjective morphology: 食べました, 学生でした,
 * 高かった, 行かなかった, 食べたかった. Left unguarded, the rules above shred
 * them into nonsense (食べました → 食べます, 食べまする) and spend a second
 * request doing it. Jisho deinflects every one of these correctly on its own,
 * so the right move is to propose nothing at all.
 *
 * Two accepted trade-offs:
 * - A godan す verb whose stem ends in ま (済ます → 済ました) is skipped. The
 *   polite past is a far larger share of what a learner types.
 * - Bare-kana かった is skipped, so a kana-only 買った/勝った won't resolve.
 *   With kanji both still work — 買った ends った, not かった.
 *
 * Known limitation this does *not* fix: よかった returns 良かったら, because the
 * answer is the i-adjective 良い. Deinflecting adjectives is out of scope here.
 */
const NON_GODAN_ENDINGS = [
  'ました',
  'まして',
  'でした',
  'でして',
  'かった',
  // Copula past: 学生だった would otherwise become 学生だう/だつ/だる.
  'だった',
  'だって',
];

/**
 * Ichidan verbs form た/て by dropping る: 見る → 見た, 出る → 出た.
 *
 * Not euphonic, so it needs its own rule — and it's a real gap without one:
 * 見た returns 見た目, 出た returns 出たて, and the verb is absent from both.
 *
 * This fires on any た/て the rules above didn't claim, which is broad — うた
 * (歌) would propose うる. That's safe because `searchWords` trusts an exact
 * match first: 歌 is a real entry for うた, so the retry never runs. The rule
 * and that guard have to stay together.
 */
const ICHIDAN_ENDINGS = ['た', 'て'];

/**
 * 行く is the one godan verb with irregular た/て forms: 行った, not 行いた.
 *
 * This case genuinely bites. 行った collides with 行ったり来たり, so the fallback
 * fires — and the regular った → う rule would resolve it to 行う (おこなう,
 * "to perform"), which is a real, common word and completely the wrong one.
 *
 * Matched as a suffix so compounds work too: 持って行った → 持って行く.
 */
const IRREGULAR_SUFFIXES = [
  ['行った', '行く'],
  ['行って', '行く'],
  ['いった', 'いく'],
  ['いって', 'いく'],
];

/**
 * Propose candidate Headwords for a Surface form, in priority order.
 *
 * Returns [] when the Surface form doesn't look like a た/て form at all —
 * which is the common case, and is what stops the caller from ever making a
 * second network request for an ordinary search.
 *
 * @param {string} surfaceForm - what the user typed, e.g. '飲んだ'
 * @returns {string[]} candidate Headwords, e.g. ['飲む', '飲ぶ', '飲ぬ']
 */
export function deinflect(surfaceForm) {
  const surface = (surfaceForm || '').trim();
  if (!surface) return [];

  const candidates = [];

  // Irregulars go first so they win a tie against a regular candidate that
  // also happens to be a real word (行く before 行う).
  for (const [suffix, replacement] of IRREGULAR_SUFFIXES) {
    if (surface.endsWith(suffix)) {
      candidates.push(surface.slice(0, -suffix.length) + replacement);
    }
  }

  // Polite, copula and adjective forms are Jisho's job — propose nothing.
  if (NON_GODAN_ENDINGS.some((e) => surface.endsWith(e))) {
    return [...new Set(candidates)];
  }

  const replacements = EUPHONIC_ENDINGS[surface.slice(-2)];
  if (replacements) {
    const stem = surface.slice(0, -2);
    // A bare ending ("った") is a suffix, not a word — there's no stem to keep.
    if (stem) {
      for (const replacement of replacements) {
        candidates.push(stem + replacement);
      }
    }
  } else if (ICHIDAN_ENDINGS.includes(surface.slice(-1))) {
    // Only when no euphonic rule claimed it — otherwise 買った would also
    // produce 買っる.
    const stem = surface.slice(0, -1);
    if (stem) candidates.push(stem + 'る');
  }

  // いった is both 行った and 言った, so the irregular and regular rules can
  // propose the same string twice.
  return [...new Set(candidates)];
}
