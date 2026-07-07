/**
 * The URL both Jisho lookups (kanji enrichment and word search) go through.
 * Jisho doesn't send permissive CORS headers for browser requests, so calls
 * are proxied. This lives in its own module so kanji.js and words.js can both
 * import it without importing each other.
 *
 * import.meta.env is Vite's way of reading build-time environment variables.
 * Any variable prefixed with VITE_ is embedded into the JS bundle when you
 * run `vite build`. At runtime in the browser it resolves to the string value
 * (or undefined if it wasn't set during the build).
 *
 * In production: VITE_JISHO_PROXY_URL is set to an AWS Lambda Function URL
 *   (created in amplify/backend.ts) by the amplify.yml preBuild step, so the
 *   client calls the Lambda proxy directly.
 * In local dev:  VITE_JISHO_PROXY_URL is undefined, so we fall back to
 *   '/api/jishoapi', which the Vite dev server proxies to Jisho
 *   (see vite.config.js — no code change needed for local dev).
 */
export const JISHO_PROXY =
  import.meta.env.VITE_JISHO_PROXY_URL || '/api/jishoapi';
