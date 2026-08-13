/**
 * Looking a Token up in the dictionary.
 *
 * This sits on top of src/api/words.js and adds the two things a *sentence*
 * lookup needs that a search-box lookup doesn't:
 *
 *   1. It searches the Token's lemma with deinflection turned OFF. The analyzer
 *      has already deinflected — 飲んだ arrived here as baseForm 飲む — so
 *      ADR-0002's fallback would only spend extra requests re-deriving an answer
 *      we already have, and could second-guess it wrongly.
 *      See docs/adr/0003-sentence-analyzer-in-lambda.md.
 *
 *   2. It caches by lemma. A learner working through a sentence taps the same
 *      word twice constantly (は appears three times in a long sentence), and
 *      re-opening the overlay must not cost another round trip.
 *
 *   3. It falls back to the lemma a merged compound was built from, when the
 *      compound itself has no entry — tap 東京駅, get 東京. See `resolveToken`
 *      at the bottom of this file, and issue #30.
 *
 * Lookups happen on tap and are never prefetched across the Sentence: a
 * 20-Token sentence would otherwise fire 20 requests the moment it was
 * analyzed, most of which the learner never asked for.
 */

import { searchWords } from './words';

/**
 * lemma → in-flight-or-settled Promise of that lemma's entries.
 *
 * The *promise* is cached rather than the results, which also collapses two
 * taps that land before the first request resolves into a single request.
 *
 * Module scope, so it survives the overlay unmounting — closing and re-opening
 * the same Token, or tapping it again in a later Sentence, is free. Dictionary
 * entries don't change during a session, so there's nothing to invalidate, and
 * the map is bounded by how many distinct words a person can tap by hand.
 */
const cache = new Map();

/**
 * lemma → the entries a lookup already *settled* on, for the lemmas where one has.
 *
 * The promise cache above makes a repeat lookup free, but not *synchronous*: a
 * `.then` on an already-resolved promise still can't run before the render that
 * asked for it, so a component reading the cache on mount renders its loading
 * state once regardless. That's a visible flash every time the overlay is
 * re-mounted — closing the deck picker, or re-opening a word tapped earlier.
 *
 * This second map answers "do we already know?" during render, so the overlay
 * can start in its final state instead of blinking through "Looking up…".
 * Written only on success, alongside the promise cache, and cleared with it.
 */
const settled = new Map();

/**
 * The entries already known for `lemma`, or `undefined` if it has never been
 * looked up. Safe to call during render — it never starts a request.
 *
 * `undefined` and `[]` mean genuinely different things here: "not looked up
 * yet" versus "looked up, and this word has no entry". A caller deciding
 * whether to show a spinner needs to tell those apart, so don't collapse them.
 */
export function peekTokenEntries(lemma) {
  const key = (lemma ?? '').trim();
  // Matches lookUpToken below, which resolves an empty lemma immediately
  // without a request — so the answer is already known, and it's "no entry".
  if (!key) return [];
  return settled.get(key);
}

/**
 * Look up `lemma` and resolve with its entries (possibly an empty array).
 *
 * Rejects with the user-facing error from words.js on network/HTTP failure.
 * A failed lookup is deliberately NOT cached — otherwise a single blip would
 * make that word permanently un-lookupable for the rest of the session, and the
 * retry button in the overlay would do nothing.
 *
 * The one case this can't rescue: a Jisho hiccup that returns 200 with an empty
 * body is indistinguishable from a word that genuinely has no entry, so it IS
 * cached and sticks until the page is reloaded. Accepted — telling the two
 * apart would mean second-guessing a successful response, and "no entry" has to
 * stay a cheap, cacheable answer because plenty of Tokens really have none.
 */
export function lookUpToken(lemma) {
  const key = (lemma ?? '').trim();
  // Nothing to search. Resolving empty (rather than throwing) lets the overlay
  // treat it exactly like a word the dictionary doesn't have.
  if (!key) return Promise.resolve([]);

  const cached = cache.get(key);
  if (cached) return cached;

  const pending = searchWords(key, { allowDeinflection: false })
    .then(({ results }) => {
      // Record the answer synchronously-readable for peekTokenEntries above.
      settled.set(key, results);
      return results;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, pending);
  return pending;
}

/* -------------------------------------------------------------------------- */
/* Falling back to the head lemma                                             */
/* -------------------------------------------------------------------------- */

/**
 * Does anything in `entries` actually answer for `lemma`?
 *
 * Stricter than "did the dictionary return something", and deliberately so: a
 * search for a non-word usually returns entries that merely *start* with the
 * string. That's tolerable for the word the user tapped — they asked for it —
 * but not for a fallback they didn't, where a loosely related entry under a
 * heading saying "showing 東京" would be a confident wrong answer. Better a
 * clean "no entry" than that (issue #30).
 *
 * Reading counts, so a kana lemma matching a kanji entry (こと → 事) is a match.
 * scripts/measure-corpus.mjs keeps its own copy of this test on purpose — a
 * measurement that imported its own yardstick from the code under measurement
 * would agree with it even when both were wrong.
 */
function answersFor(entries, lemma) {
  return entries.some((entry) => entry.word === lemma || entry.reading === lemma);
}

/**
 * Decide what to show, given what each lookup came back with.
 *
 * Pure, and shared by the async and the synchronous paths below so the two can
 * never disagree about the same pair of answers. `undefined` for either
 * argument means "not looked up"; the return is **null** when the answer isn't
 * known yet and the caller has to go and find out.
 *
 * Returns `{ entries, lemma, usedFallback }` — `lemma` being the word the
 * entries are actually FOR, which is what the overlay puts on screen.
 */
function decide(lemma, fallbackLemma, primary, fallback) {
  // Nothing settled yet for the word itself; the fallback can't matter.
  if (primary === undefined) return null;

  // The normal case, and the one that must cost no extra request.
  if (primary.length > 0) return { entries: primary, lemma, usedFallback: false };

  // No entry, and nothing to fall back to — an ordinary dead end (a name, slang,
  // an unrecognised word). This is the great majority of empty results, and it
  // keeps the honest "no dictionary entry" state it has always had.
  if (!fallbackLemma) return { entries: [], lemma, usedFallback: false };

  if (fallback === undefined) return null;

  // The head lemma has to genuinely resolve, or we're better off saying nothing.
  if (!answersFor(fallback, fallbackLemma)) return { entries: [], lemma, usedFallback: false };

  return { entries: fallback, lemma: fallbackLemma, usedFallback: true };
}

/**
 * Look a Token up, falling back to the lemma it was built from.
 *
 * `chunk.js` merges a derivational suffix into the word before it and searches
 * the compound — 東京 + 駅 looks up 東京駅. That's right for how the word reads
 * on the page, and right for 子供たち, which resolves. It just outruns Jisho's
 * entry list for place names: 東京駅 has no entry at all, so the tap dead-ended
 * (issue #30). Only those Tokens carry a `fallbackBaseForm`, so this fires
 * nowhere else.
 *
 * The second request happens **only** after the first came back empty — which
 * is exactly the case that had already failed — and both halves go through
 * `lookUpToken`, so each lemma is still cached and requested once.
 *
 * Resolves with `{ entries, lemma, usedFallback }`. `lemma` is the word the
 * entries are for: the Token's own lemma normally, the head lemma when the
 * fallback fired. Rejects like `lookUpToken` on network/HTTP failure.
 */
export async function resolveToken(lemma, fallbackLemma) {
  const primary = await lookUpToken(lemma);

  // `??` and not an if/else: when the first call answers, the second operand is
  // never evaluated and the fallback request is never made.
  return (
    decide(lemma, fallbackLemma, primary, undefined) ??
    decide(lemma, fallbackLemma, primary, await lookUpToken(fallbackLemma))
  );
}

/**
 * What `resolveToken` would resolve with, if both halves are already known —
 * `null` when they aren't. Safe during render; never starts a request.
 *
 * Same purpose as `peekTokenEntries`: let the overlay mount in its final state
 * instead of blinking through "Looking up…". A Token whose fallback hasn't been
 * looked up yet is genuinely not known, so it reports null and gets a spinner.
 */
export function peekResolvedToken(lemma, fallbackLemma) {
  const primary = peekTokenEntries(lemma);
  return (
    decide(lemma, fallbackLemma, primary, undefined) ??
    decide(lemma, fallbackLemma, primary, peekTokenEntries(fallbackLemma))
  );
}

/** Empty the cache. Exists for tests; nothing in the app needs it. */
export function clearTokenLookupCache() {
  cache.clear();
  settled.clear();
}

/**
 * Which entry should the overlay show first?
 *
 * Jisho orders by its own relevance, which is usually right but not always: a
 * search for 中 can put a compound ahead of the character itself. Preferring an
 * entry whose Headword or Reading IS the lemma keeps the overlay showing the
 * word that was actually tapped. Reading is checked too, so a kana lemma (こと)
 * still matches an entry written 事.
 *
 * Falls back to Jisho's first result, and returns null for no results at all.
 */
export function pickPrimaryEntry(entries, lemma) {
  if (!Array.isArray(entries) || entries.length === 0) return null;
  const exact = entries.find((entry) => entry.word === lemma || entry.reading === lemma);
  return exact ?? entries[0];
}
