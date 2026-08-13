/**
 * Looking a Token up in the dictionary — src/api/words.js plus the three things
 * a sentence lookup needs that a search-box lookup doesn't:
 *
 *   1. Deinflection OFF. The analyzer already deinflected (飲んだ arrives as
 *      baseForm 飲む), so ADR-0002's fallback would spend requests re-deriving a
 *      known answer and could second-guess it wrongly. See ADR-0003, "Lookups
 *      use IPADIC's lemma".
 *   2. Caching by lemma — は appears three times in a long sentence, and
 *      re-opening the overlay must not cost a round trip.
 *   3. Falling back to the lemma a merged compound was built from, when the
 *      compound has no entry: tap 東京駅, get 東京. See `resolveToken`.
 *
 * Lookups happen on tap, never prefetched: a 20-Token sentence would otherwise
 * fire 20 requests the moment it was analyzed.
 */

import { searchWords } from './words';
import { createLookupCache } from './lookupCache';

/**
 * Module scope, so it survives the overlay unmounting — re-opening the same
 * Token, or tapping it again in a later Sentence, is free.
 */
const cache = createLookupCache((lemma) =>
  searchWords(lemma, { allowDeinflection: false }).then(({ results }) => results)
);

/** The lemma as the cache keys it. Empty means "nothing to search". */
function cacheKey(lemma) {
  return (lemma ?? '').trim();
}

/**
 * The entries already known for `lemma`, or `undefined` if it has never been
 * looked up. Safe during render — it never starts a request.
 *
 * `undefined` and `[]` differ and must not be collapsed: "not looked up yet"
 * versus "looked up, and this word has no entry". A caller deciding whether to
 * show a spinner needs both.
 */
export function peekTokenEntries(lemma) {
  const key = cacheKey(lemma);
  // An empty lemma is answered without a request, so its answer is always known.
  if (!key) return [];
  return cache.peek(key);
}

/**
 * Look up `lemma` and resolve with its entries, possibly an empty array.
 * Rejects with words.js's user-facing error on network or HTTP failure.
 *
 * A failure is not cached, so the overlay's retry button can work. A 200 with
 * an empty body IS cached and sticks until reload — indistinguishable from a
 * word that genuinely has no entry, and "no entry" has to stay cheap because
 * plenty of Tokens really have none.
 */
export function lookUpToken(lemma) {
  const key = cacheKey(lemma);
  // Resolving empty rather than throwing lets the overlay treat this exactly
  // like a word the dictionary doesn't have.
  if (!key) return Promise.resolve([]);

  return cache.load(key);
}

/* -------------------------------------------------------------------------- */
/* Falling back to the head lemma                                             */
/* -------------------------------------------------------------------------- */

/**
 * Is this Entry the one the lemma names? Reading counts as well as Headword, so
 * a kana lemma finds its kanji Entry (こと → 事).
 *
 * Shared by `answersFor` and `pickPrimaryEntry`, which must never drift: one
 * decides whether a fallback is trustworthy, the other what it then shows.
 */
function matchesLemma(entry, lemma) {
  return entry.word === lemma || entry.reading === lemma;
}

/**
 * Does anything in `entries` actually answer for `lemma`?
 *
 * Stricter than "the dictionary returned something": a search for a non-word
 * usually returns entries that merely *start* with the string. Tolerable for
 * the word the user tapped, but not for a fallback they didn't ask for, where a
 * loosely related entry under a heading reading "showing 東京" is a confident
 * wrong answer.
 *
 * scripts/measure-corpus.mjs keeps its own copy of this test deliberately — a
 * measurement importing its yardstick from the code under measurement would
 * agree with it even when both were wrong. See ADR-0003.
 */
function answersFor(entries, lemma) {
  return entries.some((entry) => matchesLemma(entry, lemma));
}

/**
 * What to show, given what each lookup came back with. `undefined` for either
 * argument means "not looked up"; returns null when the answer isn't known yet
 * and the caller has to go and find out.
 *
 * Pure, and shared by the async and synchronous paths below so the two can
 * never disagree about the same pair of answers.
 *
 * Returns `{ entries, lemma, usedFallback }`, where `lemma` is the word the
 * entries are FOR — what the overlay puts on screen.
 */
function decide(lemma, fallbackLemma, primary, fallback) {
  if (primary === undefined) return null;

  // The normal case, and the one that must cost no extra request.
  if (primary.length > 0) return { entries: primary, lemma, usedFallback: false };

  // An ordinary dead end — a name, slang, an unrecognised word. The great
  // majority of empty results, and they keep the honest "no entry" state.
  if (!fallbackLemma) return { entries: [], lemma, usedFallback: false };

  if (fallback === undefined) return null;

  // The head lemma has to genuinely resolve, or saying nothing is better.
  if (!answersFor(fallback, fallbackLemma)) return { entries: [], lemma, usedFallback: false };

  return { entries: fallback, lemma: fallbackLemma, usedFallback: true };
}

/**
 * Look a Token up, falling back to the lemma it was built from.
 *
 * Resolves with `{ entries, lemma, usedFallback }` — `lemma` being the Token's
 * own normally, the head lemma when the fallback fired. Rejects like
 * `lookUpToken`.
 *
 * The second request fires only after the first came back empty, and only for
 * Tokens carrying a `fallbackBaseForm` (a derivational merge like 東京駅, which
 * Jisho has no entry for). Both halves go through `lookUpToken`, so each lemma
 * is still requested once and cached. See ADR-0003, "Limitation, now handled".
 */
export async function resolveToken(lemma, fallbackLemma) {
  const primary = await lookUpToken(lemma);

  // Settled already for every Token but the one this feature exists for —
  // returning here is what keeps an ordinary tap at exactly one request.
  const settled = decide(lemma, fallbackLemma, primary, undefined);
  if (settled) return settled;

  return decide(lemma, fallbackLemma, primary, await lookUpToken(fallbackLemma));
}

/**
 * What `resolveToken` would resolve with if both halves are already known, or
 * null when they aren't. Safe during render; never starts a request.
 *
 * Same purpose as `peekTokenEntries` — let the overlay mount in its final state
 * instead of blinking through "Looking up…".
 */
export function peekResolvedToken(lemma, fallbackLemma) {
  const primary = peekTokenEntries(lemma);

  const settled = decide(lemma, fallbackLemma, primary, undefined);
  if (settled) return settled;

  return decide(lemma, fallbackLemma, primary, peekTokenEntries(fallbackLemma));
}

/** Empty the cache. Exists for tests; nothing in the app needs it. */
export function clearTokenLookupCache() {
  cache.clear();
}

/**
 * Which entry the overlay shows first: one whose Headword or Reading IS the
 * lemma, else Jisho's first result, else null.
 *
 * Jisho orders by its own relevance, which can put a compound ahead of the
 * character itself for a search like 中 — this keeps the tapped word on screen.
 */
export function pickPrimaryEntry(entries, lemma) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const exact = entries.find((entry) => matchesLemma(entry, lemma));
  return exact ?? entries[0];
}
