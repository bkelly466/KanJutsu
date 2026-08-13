/**
 * Deinflection — turning a Surface form back into candidate Headwords.
 *
 * Covers one gap and only one: Jisho deinflects 食べました → 食べる on its own,
 * but fails where a longer Entry *begins with* the Surface form (飲んだ returns
 * 飲んだくれ, and 飲む not at all). Scope is the euphonic (音便) た/て forms.
 * See ADR-0002.
 *
 * Pure and network-free — it proposes candidates and never verifies them. Only
 * the dictionary can say which is a real word, so `src/api/words.js` checks.
 */

/**
 * Euphonic た/て endings, mapped to the Headword endings they can come from.
 *
 * Many-to-one, which is the whole difficulty: 飲んだ and 遊んだ share んだ but
 * come from 飲む and 遊ぶ. Nothing short of a dictionary separates them, so
 * every candidate is offered.
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
 * Endings that look like the patterns above but are polite, copula or adjective
 * morphology — 食べました, 学生でした, 高かった. Jisho handles every one, so the
 * rules propose nothing rather than shredding them (食べました → 食べまする) and
 * spending a request on it.
 *
 * The trade-offs this buys, and the adjectives it doesn't fix: ADR-0002,
 * "Known limitations".
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
 * Fires on any た/て the euphonic rules didn't claim, which is broad enough to
 * propose うる for うた (歌). Safe only because `searchWords` trusts an exact
 * match first, so the retry never runs — this rule and that guard have to stay
 * together. See ADR-0002, "An exact match is always trusted".
 */
const ICHIDAN_ENDINGS = ['た', 'て'];

/**
 * 行く, the one godan verb with irregular た/て forms — 行った, not 行いた.
 *
 * Worth a rule of its own: 行った collides with 行ったり来たり, so the fallback
 * fires, and the regular った → う rule resolves it to 行う (おこなう) — a real,
 * common, entirely wrong word. Matched as a suffix so 持って行った works too.
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
