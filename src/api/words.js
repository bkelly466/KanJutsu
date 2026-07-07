/**
 * Word (vocabulary) data access layer.
 *
 * Unlike the kanji lookup — which pulls single-character data from kanjiapi.dev
 * and enriches it with Jisho — a *word* lookup goes straight to the Jisho word
 * dictionary. Jisho's search endpoint already understands English, kana, and
 * kanji queries, so we can pass the user's raw input through to it.
 *
 * We reuse the SAME proxy as the kanji enrichment call (JISHO_PROXY), so no
 * backend change is needed: the Vite dev server proxies it locally, and the
 * AWS Lambda Function URL proxies it in production.
 */

import { JISHO_PROXY } from './jishoProxy';

// Cap how many results we render so a broad query (e.g. "time") doesn't dump a
// hundred entries onto the screen. Jisho returns the most relevant first.
const MAX_WORD_RESULTS = 20;

/**
 * Jisho tags JLPT levels like "jlpt-n5". Turn that into a clean "N5".
 * Returns a de-duplicated array (an entry can carry more than one tag).
 */
export function cleanJlpt(jlptTags) {
  if (!Array.isArray(jlptTags)) return [];
  const levels = jlptTags
    .map((tag) => tag.replace(/^jlpt-/, '').toUpperCase()) // "jlpt-n5" → "N5"
    .filter(Boolean);
  return [...new Set(levels)];
}

/**
 * Convert one raw Jisho entry into a stable shape the UI can rely on.
 *
 * Doing this normalisation here (rather than in components) means the rest of
 * the app never has to know about Jisho's nested `japanese`/`senses` structure.
 * If we ever swap dictionaries, only this file changes.
 *
 * Returns null for malformed entries so the caller can filter them out.
 */
export function normalizeWord(entry) {
  const japanese = entry.japanese?.[0];
  if (!japanese) return null;

  // Kana-only words have no `word` (kanji) field — fall back to the reading.
  const word = japanese.word || japanese.reading;
  const reading = japanese.reading || '';
  if (!word) return null;

  const senses = (entry.senses || []).map((sense) => ({
    definitions: sense.english_definitions || [],
    partsOfSpeech: sense.parts_of_speech || [],
  }));

  return {
    // `slug` is Jisho's stable id for the entry; fall back to a composed key.
    id: entry.slug || `${word}::${reading}`,
    word,
    reading,
    isCommon: Boolean(entry.is_common),
    jlpt: cleanJlpt(entry.jlpt),
    senses,
    // Convenience: the first sense's definitions, handy for compact display.
    meanings: senses[0]?.definitions || [],
  };
}

/**
 * Search the Jisho word dictionary for `query` (English, kana, or kanji).
 * Returns an array of normalised word entries (possibly empty).
 * Throws on network/HTTP failure so the hook can surface an error message.
 */
export async function searchWords(query) {
  const q = query.trim();
  if (!q) return [];

  const response = await fetch(`${JISHO_PROXY}?keyword=${encodeURIComponent(q)}`);
  if (!response.ok) {
    throw new Error('Word lookup failed. Please try again.');
  }

  const json = await response.json();
  return (json.data || [])
    .map(normalizeWord)
    .filter(Boolean)
    .slice(0, MAX_WORD_RESULTS);
}
