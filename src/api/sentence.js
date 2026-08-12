/**
 * Sentence analyzer data access layer.
 *
 * Japanese is written without spaces, so before a learner can look up a word
 * inside a sentence, something has to decide where the words begin and end.
 * That's a morphological analyzer, and ours runs in a Lambda — the IPADIC
 * dictionary is ~12.5 MB, which is far too much to send to a browser.
 * See docs/adr/0003-sentence-analyzer-in-lambda.md.
 *
 * What comes back is MORPHEMES, not words. IPADIC splits 行きました into
 * 行き|まし|た, and `行き` isn't something you can look up in a dictionary.
 * Merging those back into tappable words is a separate step (src/utils/chunk.js,
 * ticket #20) — this module deliberately stops at the raw morphemes so the
 * whole path from browser to Lambda and back can be proven first.
 */

import outputs from '../../amplify_outputs.json';

/**
 * Where the analyzer lives.
 *
 * Note this is read straight out of the generated outputs file, NOT from a
 * VITE_ environment variable the way JISHO_PROXY is. The difference is that the
 * Jisho proxy has a local fallback — the Vite dev server can proxy to jisho.org
 * itself (see vite.config.js) — so it's fine for the URL to be missing in dev.
 * The analyzer has no such fallback: a 12.5 MB dictionary only ever exists in
 * Lambda. Going through an env var would therefore mean hand-copying a sandbox
 * URL into .env.local, and re-copying it every time the sandbox is recreated.
 * Reading the outputs file means `npx ampx sandbox` wires local dev up by itself.
 *
 * The `?? ''` matters: CI has no backend, so it writes a stub `{}` outputs file
 * (see .github/workflows/ci.yml) and this is undefined there. That's fine —
 * tests stub `fetch`, and the real guard against a missing URL in production is
 * the loud `test -n` check in amplify.yml, which fails the build outright.
 */
const ANALYZER_URL = outputs.custom?.sentenceAnalyzerUrl ?? '';

/**
 * Turn one raw item from the response into the shape the app relies on.
 *
 * The Lambda already normalises Lindera's output, so this is the belt-and-braces
 * pass: it means a truncated or half-broken response degrades into sensible
 * defaults instead of scattering `undefined` through the UI. Same reason
 * normalizeWord() exists in words.js.
 *
 * Returns null for an item with no surface form, since there'd be nothing to
 * render — the caller filters those out.
 */
export function normalizeMorpheme(raw) {
  if (!raw || typeof raw.surface !== 'string' || raw.surface === '') return null;

  return {
    // The text as it appeared in the sentence, e.g. "行き".
    surface: raw.surface,
    // IPADIC's dictionary form, e.g. "行く". This is what a lookup will search.
    baseForm: typeof raw.baseForm === 'string' && raw.baseForm ? raw.baseForm : raw.surface,
    // Part of speech: "動詞" (verb), "助詞" (particle), "助動詞" (auxiliary),
    // "記号" (symbol/punctuation), and so on. The merge rule in #20 keys off this.
    pos: raw.pos ?? '',
    // First POS subcategory — carries 自立 (independent) vs 非自立 (dependent),
    // which is the distinction the merge rule actually turns on.
    posDetail: raw.posDetail ?? '',
    // Katakana reading, e.g. "イキ". Empty when IPADIC has none.
    reading: raw.reading ?? '',
    // IPADIC didn't recognise this one — a name, slang, or non-Japanese text.
    isUnknown: Boolean(raw.isUnknown),
  };
}

/**
 * Analyze `text` and return its morphemes.
 *
 * Returns `{ morphemes }`, an array that may be empty (blank input, or text the
 * analyzer found nothing in).
 *
 * Throws on network/HTTP failure. Following the convention set by words.js, the
 * thrown error's `message` is copy that can go straight in front of the user,
 * while the technical detail rides along as `error.cause` for devtools.
 */
export async function analyzeSentence(text) {
  const trimmed = (text ?? '').trim();

  // Nothing to analyze. Returning early rather than throwing keeps an empty
  // textarea from being an error state, and costs no round trip.
  if (!trimmed) return { morphemes: [] };

  let response;
  try {
    response = await fetch(`${ANALYZER_URL}?text=${encodeURIComponent(trimmed)}`);
  } catch (cause) {
    // Network-level failure: offline, DNS, the Lambda being unreachable.
    throw new Error(
      'Could not analyze the sentence. Please check your connection and try again.',
      { cause },
    );
  }

  // A 400 means the analyzer rejected the input itself — too long, or empty.
  // Retrying that is guaranteed to fail, so "please try again" would send the
  // user round a loop. Say what's actually wrong instead.
  //
  // This still earns its keep once #23 adds the client-side counter: anything
  // that slips past the client guard then explains itself rather than looping.
  if (response.status === 400) {
    throw new Error('That text is too long to analyze — 300 characters maximum.', {
      cause: new Error('Sentence analyzer rejected the input with 400'),
    });
  }

  if (!response.ok) {
    throw new Error('Could not analyze the sentence. Please try again.', {
      cause: new Error(`Sentence analyzer returned ${response.status}`),
    });
  }

  let json;
  try {
    json = await response.json();
  } catch (cause) {
    // A proxy or gateway can return an HTML error page with a 200 status.
    // Without this the user would see a raw "Unexpected token '<'" on screen.
    throw new Error('Could not analyze the sentence. Please try again.', { cause });
  }

  // Array.isArray rather than `?? []`: a body of `null`, or a `morphemes` that
  // came back as an object or a string, would otherwise throw a raw TypeError
  // and put "x.map is not a function" on screen — defeating all the careful
  // error copy above.
  const raw = Array.isArray(json?.morphemes) ? json.morphemes : [];

  return { morphemes: raw.map(normalizeMorpheme).filter(Boolean) };
}
