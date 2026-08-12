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
