/**
 * Kanji data access layer — kanjiapi.dev for the core data, enriched with the
 * most common words from Jisho via the shared proxy (./jishoProxy.js).
 */

import { JISHO_PROXY } from './jishoProxy';
import { normalizeWord } from './words';
import { createLookupCache } from './lookupCache';

const KANJI_API_BASE = 'https://kanjiapi.dev/v1/kanji';
const MAX_COMMON_WORDS = 10;

// CJK Unified Ideographs + Extension A — i.e. kanji characters.
const KANJI_REGEX = /[一-龯㐀-䶿]/g;

/** Extract the unique kanji characters from an arbitrary string. */
export function extractKanji(text) {
  return [...new Set(text.match(KANJI_REGEX) || [])];
}

/**
 * Core data for a single kanji, or null when kanjiapi doesn't have it. Throws
 * with user-facing copy on failure, as words.js does.
 */
async function fetchKanjiDetails(char) {
  let response;
  try {
    response = await fetch(`${KANJI_API_BASE}/${encodeURIComponent(char)}`);
  } catch (cause) {
    throw new Error('Could not load kanji info — check your connection.', { cause });
  }

  // 404 is an honest "no such character", not an error — the overlay says so
  // plainly rather than offering a pointless retry.
  if (response.status === 404) return null;

  // Anything else is a fault at their end, and the two must stay distinct now
  // that answers are cached: a 500 recorded as "no such kanji" would stick for
  // the session, when retrying is exactly what would fix it.
  if (!response.ok) {
    throw new Error('Could not load kanji info.', {
      cause: new Error(`kanjiapi returned ${response.status} for "${char}"`),
    });
  }

  try {
    return await response.json();
  } catch (cause) {
    throw new Error('Could not load kanji info.', { cause });
  }
}

/**
 * The most common words for a kanji, normalised to the same shape the word
 * lookup returns.
 *
 * `null` means the request failed; `[]` means Jisho has no words for this
 * character. The distinction is load-bearing — a failure here must not discard
 * the kanji entry that already succeeded (different host, and the part the
 * overlay is mostly for), but only one of the two answers is worth caching.
 */
async function fetchCommonWords(char) {
  try {
    const response = await fetch(`${JISHO_PROXY}?keyword=${encodeURIComponent(char)}`);
    if (!response.ok) return null;
    const json = await response.json();
    if (!Array.isArray(json?.data)) return null;
    return json.data
      .slice(0, MAX_COMMON_WORDS)
      .map(normalizeWord)
      .filter(Boolean);
  } catch {
    return null;
  }
}

/**
 * char → its entry. Worth caching: an entry costs two requests, and the
 * explorer asks for the same character constantly — the drill stack's Back
 * button is always a repeat lookup. `null` (not found) is cached like any other
 * answer, and nothing needs invalidating within a session.
 */
const entryCache = createLookupCache(
  async (char) => {
    const details = await fetchKanjiDetails(char);
    if (!details) return null;

    const commonWords = await fetchCommonWords(char);
    return {
      ...details,
      commonWords: commonWords ?? [],
      // Jisho failed where kanjiapi succeeded. Readings, meanings and strokes
      // are all here, so the entry is still worth showing — but the word list
      // is missing for a reason the user can't see.
      commonWordsUnavailable: commonWords === null,
    };
  },
  {
    // Without this, one Jisho blip hides Common Words for that character for
    // the whole session, indistinguishable from a kanji that has none.
    // Re-opening the overlay used to recover; the cache has to keep that true.
    isCacheable: (entry) => entry === null || !entry.commonWordsUnavailable,
  }
);

/**
 * A single kanji enriched with its common words, or null when kanjiapi doesn't
 * have the character. Cached, so a repeat open costs nothing.
 */
export function fetchKanjiEntry(char) {
  return entryCache.load(char);
}

/**
 * The entry already known for `char`, or `undefined` if it has never been
 * fetched. Safe during render — it never starts a request.
 *
 * `undefined` and `null` are different answers — "not looked up yet" versus
 * "looked up, and kanjiapi doesn't have it" — and the overlay chooses between a
 * spinner and a "no data" message on exactly that.
 */
export function peekKanjiEntry(char) {
  return entryCache.peek(char);
}

/** Empty the kanji cache. Exists for tests; nothing in the app needs it. */
export function clearKanjiEntryCache() {
  entryCache.clear();
}
