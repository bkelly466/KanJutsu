/**
 * Word (vocabulary) data access layer.
 *
 * A word lookup goes straight to Jisho's search endpoint, which already
 * understands English, kana and kanji, so the user's raw input passes through
 * untouched. (The kanji lookup is different — kanjiapi.dev enriched with Jisho.)
 *
 * Uses the same JISHO_PROXY as the kanji enrichment call: the Vite dev server
 * proxies it locally, the Lambda Function URL in production.
 */

import { JISHO_PROXY } from './jishoProxy';
import { deinflect } from '../utils/deinflect';

// A broad query like "time" would otherwise dump a hundred entries on screen.
// Jisho returns the most relevant first, so a cap loses nothing useful.
const MAX_WORD_RESULTS = 20;

/**
 * Jisho's JLPT tags ("jlpt-n5") as clean levels ("N5"), de-duplicated — an
 * entry can carry the same level more than once.
 */
export function cleanJlpt(jlptTags) {
  if (!Array.isArray(jlptTags)) return [];
  const levels = jlptTags
    .map((tag) => tag.replace(/^jlpt-/, '').toUpperCase()) // "jlpt-n5" → "N5"
    .filter(Boolean);
  return [...new Set(levels)];
}

/**
 * One raw Jisho entry as the stable shape the UI relies on, or null when the
 * entry is malformed so the caller can filter it out.
 *
 * Normalising here rather than in components keeps Jisho's nested
 * `japanese`/`senses` structure out of the rest of the app — swapping
 * dictionaries would change only this file.
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
    // Jisho's stable id, or a composed key when the entry has none.
    id: entry.slug || `${word}::${reading}`,
    word,
    reading,
    isCommon: Boolean(entry.is_common),
    jlpt: cleanJlpt(entry.jlpt),
    senses,
    // The first sense's definitions, for compact display.
    meanings: senses[0]?.definitions || [],
  };
}

/**
 * One round-trip to Jisho for a single keyword, normalised and capped.
 *
 * Throws on network or HTTP failure, with a user-facing `message` and the
 * technical detail attached as `error.cause`.
 */
async function fetchEntries(keyword) {
  let response;
  try {
    response = await fetch(`${JISHO_PROXY}?keyword=${encodeURIComponent(keyword)}`);
  } catch (cause) {
    // Offline, DNS, or the proxy unreachable.
    throw new Error('Word lookup failed. Please check your connection and try again.', { cause });
  }

  if (!response.ok) {
    throw new Error('Word lookup failed. Please try again.', {
      cause: new Error(`Jisho proxy returned ${response.status} for "${keyword}"`),
    });
  }

  let json;
  try {
    json = await response.json();
  } catch (cause) {
    // A proxy can return an HTML error page with a 200, which would otherwise
    // put a raw "Unexpected token '<'" in the results area.
    throw new Error('Word lookup failed. Please try again.', { cause });
  }

  // Guarded, not trusted: a null body or an object `data` would make `.map`
  // throw a raw TypeError past all the careful copy above, in both tabs — every
  // Sentence-tab Token lookup comes through here too.
  if (!Array.isArray(json?.data)) return [];

  return json.data
    .map(normalizeWord)
    .filter(Boolean)
    .slice(0, MAX_WORD_RESULTS);
}

/**
 * Search the Jisho word dictionary for `query` (English, kana, or kanji).
 *
 * Returns `{ results, resolvedFrom }`:
 *   - `results`      normalised entries, possibly empty
 *   - `resolvedFrom` `{ surfaceForm, headword }` when something other than what
 *                    the user typed was searched, else null. The UI shows this.
 *
 * Falls back to locally-derived headwords when Jisho fails to deinflect, which
 * it does when a longer entry begins with what was typed — 飲んだ returns
 * 飲んだくれ with 飲む absent entirely. See ADR-0002.
 *
 * Throws on failure of the FIRST request only; a failed retry keeps the
 * original results rather than losing them.
 *
 * `{ allowDeinflection: false }` searches the string exactly as given — the UI
 * uses it for the "search X instead" escape hatch.
 */
export async function searchWords(query, { allowDeinflection = true } = {}) {
  const q = query.trim();
  if (!q) return { results: [], resolvedFrom: null };

  const results = await fetchEntries(q);
  if (!allowDeinflection) return { results, resolvedFrom: null };

  // No candidates means this isn't a た/て form — the common case, and what
  // stops an ordinary search costing two requests.
  const candidates = deinflect(q);
  if (candidates.length === 0) return { results, resolvedFrom: null };

  // An exact hit is always trusted: 決して, として and 果たして are headwords in
  // their own right that merely LOOK like て-forms, and deinflecting them would
  // replace a correct result with a wrong one. See ADR-0002.
  if (results.some((entry) => entry.word === q || entry.reading === q)) {
    return { results, resolvedFrom: null };
  }

  // Jisho already found the headword itself (読んだ → 読む). Readings count, so
  // kana input (のんだ → 飲む/のむ) is recognised too.
  const headwords = new Set(results.flatMap((entry) => [entry.word, entry.reading]));
  if (candidates.some((candidate) => headwords.has(candidate))) {
    return { results, resolvedFrom: null };
  }

  // Only the dictionary can say which candidate is a real word. All at once, so
  // this costs one round-trip of latency rather than one per candidate.
  const attempts = await Promise.all(
    candidates.map((candidate) =>
      fetchEntries(candidate)
        .then((entries) => ({
          candidate,
          entries,
          // Reading counts, so a kana candidate (のむ) matches the kanji entry.
          match: entries.find(
            (entry) => entry.word === candidate || entry.reading === candidate,
          ),
        }))
        // A failed retry must not sink the results already in hand.
        .catch(() => null),
    ),
  );

  const resolved = attempts.filter((attempt) => attempt?.match);
  if (resolved.length === 0) return { results, resolvedFrom: null };

  // Prefer a common word. Array.sort is stable, so ties keep deinflect()'s
  // priority order — which is what puts 行く ahead of 行う.
  resolved.sort((a, b) => Number(b.match.isCommon) - Number(a.match.isCommon));
  const winner = resolved[0];

  return {
    results: winner.entries,
    // The entry's own headword, not the candidate guessed: searching のんだ
    // should say 飲む, not のむ.
    resolvedFrom: { surfaceForm: q, headword: winner.match.word },
  };
}
