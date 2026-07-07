/**
 * Kanji data access layer.
 *
 * Core kanji data comes from kanjiapi.dev and is enriched with the most common
 * words from the Jisho API (via the shared proxy — see ./jishoProxy.js for how
 * the proxying works locally vs. in production).
 */

import { JISHO_PROXY } from './jishoProxy';
import { normalizeWord } from './words';

const KANJI_API_BASE = 'https://kanjiapi.dev/v1/kanji';
const MAX_COMMON_WORDS = 10;

// CJK Unified Ideographs + Extension A — i.e. kanji characters.
const KANJI_REGEX = /[一-龯㐀-䶿]/g;

/** Extract the unique kanji characters from an arbitrary string. */
export function extractKanji(text) {
  return [...new Set(text.match(KANJI_REGEX) || [])];
}

/** Fetch core data for a single kanji. Returns null if it isn't found. */
async function fetchKanjiDetails(char) {
  const response = await fetch(`${KANJI_API_BASE}/${encodeURIComponent(char)}`);
  if (!response.ok) return null;
  return response.json();
}

/**
 * Fetch the most common words for a kanji from the Jisho proxy, normalised to
 * the same word shape the word lookup uses (see normalizeWord in words.js) —
 * so components never see Jisho's raw nested structure.
 * Returns an empty list on failure so a Jisho hiccup never discards the
 * (already successful) kanji entry.
 */
async function fetchCommonWords(char) {
  try {
    const response = await fetch(`${JISHO_PROXY}?keyword=${encodeURIComponent(char)}`);
    if (!response.ok) return [];
    const json = await response.json();
    return (json.data || [])
      .slice(0, MAX_COMMON_WORDS)
      .map(normalizeWord)
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Look up every kanji found in `query`, each enriched with common words.
 * Characters that can't be found are skipped.
 */
export async function searchKanji(query) {
  const chars = extractKanji(query);
  if (chars.length === 0) return [];

  const entries = await Promise.all(
    chars.map(async (char) => {
      const details = await fetchKanjiDetails(char);
      if (!details) return null;
      const commonWords = await fetchCommonWords(char);
      return { ...details, commonWords };
    })
  );

  return entries.filter(Boolean);
}

/**
 * Fetch a single kanji, enriched with its common words. Used by the kanji
 * info overlay (tap-a-character-to-explore). Returns null if not found.
 */
export async function fetchKanjiEntry(char) {
  const details = await fetchKanjiDetails(char);
  if (!details) return null;
  const commonWords = await fetchCommonWords(char);
  return { ...details, commonWords };
}
