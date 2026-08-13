/**
 * Kanji data access layer.
 *
 * Core kanji data comes from kanjiapi.dev and is enriched with the most common
 * words from the Jisho API (via the shared proxy — see ./jishoProxy.js for how
 * the proxying works locally vs. in production).
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
 * Fetch core data for a single kanji. Returns null if it isn't found.
 *
 * A network failure throws with copy that's safe to show, the way words.js
 * does: the raw rejection here is the browser's "Failed to fetch", and the
 * overlay renders whatever message it's given.
 */
async function fetchKanjiDetails(char) {
  let response;
  try {
    response = await fetch(`${KANJI_API_BASE}/${encodeURIComponent(char)}`);
  } catch (cause) {
    throw new Error('Could not load kanji info — check your connection.', { cause });
  }

  // 404 is kanjiapi's honest "no such character" and is NOT an error — the
  // overlay says so plainly instead of offering a pointless retry.
  if (response.status === 404) return null;

  // Anything else that isn't ok is a fault at their end, and it matters that
  // the two are told apart now that answers are cached: a 500 recorded as "no
  // such kanji" would stick for the whole session, and retrying is exactly
  // what would fix it.
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
 * Fetch the most common words for a kanji from the Jisho proxy, normalised to
 * the same word shape the word lookup uses (see normalizeWord in words.js) —
 * so components never see Jisho's raw nested structure.
 *
 * Returns **null** when the request itself failed, as against `[]` for a
 * character Jisho simply has no words for. A hiccup here must never discard
 * the (already successful) kanji entry — these are two different hosts, and
 * kanjiapi's half is the part the overlay is mostly for — but the caller does
 * have to be able to tell "no words" from "couldn't ask", because the answer
 * is cached and only one of those is worth keeping.
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
 * char → its entry, cached. Two requests per kanji (core data plus common
 * words), and the explorer asks for the same character constantly: the drill
 * stack's Back button is *always* a repeat lookup, and a word's kanji get
 * tapped again and again across a session.
 *
 * `null` (not found) is cached like any other answer — see lookupCache.js.
 * Kanji data doesn't change during a session, so nothing here needs
 * invalidating.
 */
const entryCache = createLookupCache(
  async (char) => {
    const details = await fetchKanjiDetails(char);
    if (!details) return null;

    const commonWords = await fetchCommonWords(char);
    return {
      ...details,
      commonWords: commonWords ?? [],
      // Jisho failed while kanjiapi succeeded. The entry is still worth
      // showing — readings, meanings and strokes are all here — but the word
      // list is missing for a reason the user can't see, so say so and don't
      // remember it.
      commonWordsUnavailable: commonWords === null,
    };
  },
  {
    // Without this, one Jisho blip would hide Common Words for that character
    // for the rest of the session, indistinguishable from a kanji that has
    // none. Before this cache existed, re-opening the overlay recovered; the
    // cache has to keep that true.
    isCacheable: (entry) => entry === null || !entry.commonWordsUnavailable,
  }
);

/**
 * Fetch a single kanji, enriched with its common words. Used by the kanji
 * info overlay (tap-a-character-to-explore). Returns null if not found.
 *
 * Cached per character, so a repeat open costs nothing.
 */
export function fetchKanjiEntry(char) {
  return entryCache.load(char);
}

/**
 * The entry already known for `char`, or `undefined` if it has never been
 * fetched. Safe to call during render — it never starts a request.
 *
 * `undefined` and `null` are different answers: "not looked up yet" versus
 * "looked up, and kanjiapi doesn't have this character". The overlay needs to
 * tell them apart to decide between a spinner and a plain "no data" message.
 */
export function peekKanjiEntry(char) {
  return entryCache.peek(char);
}

/** Empty the kanji cache. Exists for tests; nothing in the app needs it. */
export function clearKanjiEntryCache() {
  entryCache.clear();
}
