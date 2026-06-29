/**
 * Kanji data access layer.
 *
 * Core kanji data comes from kanjiapi.dev and is enriched with the most common
 * words from the Jisho API. Jisho doesn't send permissive CORS headers for
 * browser requests, so calls go through a proxy.
 *
 * Locally:      The Vite dev server proxy rewrites /api/jishoapi → Jisho.
 *               (see vite.config.js — no code change needed for local dev)
 *
 * Production:   An AWS Lambda Function URL (created in amplify/backend.ts)
 *               proxies Jisho server-side. The Lambda's public HTTPS URL is
 *               baked into the bundle at build time as VITE_JISHO_PROXY_URL
 *               by the amplify.yml preBuild step. If that env var is present
 *               we use it directly; if it's absent (local dev) we fall back
 *               to the relative /api/jishoapi path that Vite proxies.
 */

const KANJI_API_BASE = 'https://kanjiapi.dev/v1/kanji';

// import.meta.env is Vite's way of reading build-time environment variables.
// Any variable prefixed with VITE_ is embedded into the JS bundle when you
// run `vite build`. At runtime in the browser it resolves to the string value
// (or undefined if it wasn't set during the build).
//
// In production: VITE_JISHO_PROXY_URL is set to the Lambda Function URL by
//   the amplify.yml preBuild step, so the client calls Lambda directly.
// In local dev:  VITE_JISHO_PROXY_URL is undefined, so we fall back to
//   '/api/jishoapi', which the Vite dev server proxies to Jisho.
// Exported so the word-lookup service (src/api/words.js) can reuse the exact
// same proxy resolution instead of duplicating the env logic.
export const JISHO_PROXY =
  import.meta.env.VITE_JISHO_PROXY_URL || '/api/jishoapi';
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
 * Fetch the most common words for a kanji from the Jisho proxy.
 * Returns an empty list on failure so a Jisho hiccup never discards the
 * (already successful) kanji entry.
 */
async function fetchCommonWords(char) {
  try {
    const response = await fetch(`${JISHO_PROXY}?keyword=${encodeURIComponent(char)}`);
    if (!response.ok) return [];
    const json = await response.json();
    return (json.data || []).slice(0, MAX_COMMON_WORDS);
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
