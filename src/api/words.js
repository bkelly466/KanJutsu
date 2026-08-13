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
import { deinflect } from '../utils/deinflect';

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
 * One round-trip to Jisho for a single keyword, normalised and capped.
 *
 * Throws on network/HTTP failure. The thrown error's `message` is user-facing
 * copy; the technical detail is attached as `error.cause` for debugging
 * (inspect it in devtools).
 */
async function fetchEntries(keyword) {
  let response;
  try {
    response = await fetch(`${JISHO_PROXY}?keyword=${encodeURIComponent(keyword)}`);
  } catch (cause) {
    // Network-level failure: offline, DNS, the proxy being unreachable.
    // `cause` keeps the original error attached for debugging without putting
    // its text in front of the user.
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
    // A proxy can return an HTML error page with a 200. Without this the user
    // would see a raw "Unexpected token '<'" in the results area.
    throw new Error('Word lookup failed. Please try again.', { cause });
  }

  // Guarded rather than trusted: a body of `null`, or a `data` that arrived as
  // an object, would make `.map` throw a raw TypeError and put "x.map is not a
  // function" on screen instead of the careful copy above. Every Token lookup
  // in the Sentence tab comes through here too, so that would break both tabs.
  // sentence.js was given the same guard in #25.
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
 *   - `resolvedFrom` `{ surfaceForm, headword }` when we searched something
 *                    other than what the user typed, otherwise null. The UI
 *                    uses this to tell the user what happened.
 *
 * Jisho normally deinflects for us, but gives up when a longer entry begins
 * with what was typed — 飲んだ returns 飲んだくれ and 飲む is absent from the
 * results entirely, so there's nothing to re-rank. In that one case we derive
 * candidate headwords locally and search those instead.
 * See docs/adr/0002-deinflection-fallback.md.
 *
 * Throws on network/HTTP failure of the *first* request only; a failed retry
 * falls back to the original results rather than losing them.
 *
 * Pass `{ allowDeinflection: false }` to search the string exactly as given.
 * The UI uses this for the "search X instead" escape hatch, so a substitution
 * the user didn't want is always one tap away from being undone.
 */
export async function searchWords(query, { allowDeinflection = true } = {}) {
  const q = query.trim();
  if (!q) return { results: [], resolvedFrom: null };

  const results = await fetchEntries(q);
  if (!allowDeinflection) return { results, resolvedFrom: null };

  // No candidates means this doesn't look like a た/て form, which is the
  // common case — and is what stops an ordinary search costing two requests.
  const candidates = deinflect(q);
  if (candidates.length === 0) return { results, resolvedFrom: null };

  // Jisho returned the exact string that was typed, so it found a real entry
  // for it. 決して, として and 果たして are headwords in their own right that
  // merely *look* like て-forms — deinflecting them would replace a correct
  // result with a wrong one.
  if (results.some((entry) => entry.word === q || entry.reading === q)) {
    return { results, resolvedFrom: null };
  }

  // Jisho already found the headword by itself (読んだ → 読む). Nothing to fix.
  // Readings count too, so kana input (のんだ → 飲む/のむ) is recognised.
  const headwords = new Set(results.flatMap((entry) => [entry.word, entry.reading]));
  if (candidates.some((candidate) => headwords.has(candidate))) {
    return { results, resolvedFrom: null };
  }

  // Only the dictionary can say which candidate is a real word, so try them
  // all at once — one round-trip of latency rather than one per candidate.
  const attempts = await Promise.all(
    candidates.map((candidate) =>
      fetchEntries(candidate)
        .then((entries) => ({
          candidate,
          entries,
          // Match on the reading too: a kana candidate (のむ) finds an entry
          // whose `word` is the kanji form (飲む).
          match: entries.find(
            (entry) => entry.word === candidate || entry.reading === candidate,
          ),
        }))
        // A failed retry must not sink the results we already have.
        .catch(() => null),
    ),
  );

  const resolved = attempts.filter((attempt) => attempt?.match);
  if (resolved.length === 0) return { results, resolvedFrom: null };

  // Prefer a common word. Array.sort is stable, so candidates that tie keep
  // deinflect()'s priority order — which is what puts 行く ahead of 行う.
  resolved.sort((a, b) => Number(b.match.isCommon) - Number(a.match.isCommon));
  const winner = resolved[0];

  return {
    results: winner.entries,
    // Show the entry's own headword, not the candidate we guessed — searching
    // のんだ should say "飲む", not "のむ".
    resolvedFrom: { surfaceForm: q, headword: winner.match.word },
  };
}
