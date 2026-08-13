/**
 * The URL both Jisho lookups — kanji enrichment and word search — go through.
 * Jisho sends no permissive CORS headers, so browser calls must be proxied.
 *
 * In production `VITE_JISHO_PROXY_URL` is the Lambda Function URL, set by
 * amplify.yml's preBuild step. It is unset in local dev, so the fallback goes
 * to the Vite dev server's proxy (vite.config.js) — no code change either way.
 *
 * Its own module so kanji.js and words.js can share it without importing each
 * other.
 */
export const JISHO_PROXY =
  import.meta.env.VITE_JISHO_PROXY_URL || '/api/jishoapi';
