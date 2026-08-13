/**
 * Sentence analyzer data access layer.
 *
 * Japanese is written without spaces, so before a learner can look up a word
 * inside a sentence, something has to decide where the words begin and end.
 * That's a morphological analyzer, and ours runs in a Lambda — the IPADIC
 * dictionary is ~12.5 MB, which is far too much to send to a browser.
 * See docs/adr/0003-sentence-analyzer-in-lambda.md.
 *
 * The Lambda returns MORPHEMES — IPADIC splits 行きました into 行き|まし|た, and
 * 行き isn't something you can look up. This module merges them into **Tokens**
 * via src/utils/chunk.js before anything else sees them, so callers never deal
 * with the analyzer's native shape. Same boundary src/api/words.js draws around
 * Jisho's response.
 *
 * This is also the single seam the whole feature is tested at: chunk.js has no
 * test file of its own, and the corpus in sentence.test.js asserts Token
 * boundaries through `analyzeSentence()` against recorded analyzer output.
 */

import outputs from '../../amplify_outputs.json';
import { chunk } from '../utils/chunk';

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
 * Longest Sentence we'll analyze, enforced here BEFORE any request is made.
 *
 * The Lambda enforces the same number defensively, but a learner should be told
 * by the UI rather than by a round trip — and over-long text is refused
 * outright, never silently truncated. Studying a sentence that was quietly cut
 * in half is worse than being told to shorten it. The counter in
 * SentenceAnalyzer.jsx reads this constant, so the two can't drift.
 */
export const MAX_SENTENCE_LENGTH = 300;

/**
 * Does this text contain Japanese script?
 *
 * Written as escapes rather than literal characters so the ranges stay legible
 * and no invisible character can hide in the source:
 *   3040-309F  hiragana
 *   30A0-30FF  katakana
 *   3400-4DBF  CJK ideographs, extension A (rare kanji)
 *   4E00-9FFF  CJK ideographs (the common kanji)
 *   F900-FAFF  CJK compatibility ideographs
 *   FF66-FF9D  halfwidth katakana letters — text copied from receipts, older
 *              sites and some IME output is written this way, and refusing it
 *              would tell a learner their Japanese isn't Japanese
 *
 * Deliberately EXCLUDES the CJK punctuation block (3000-303F), which is where
 * the full stop and comma live. A string of Japanese full stops is not text to
 * analyze, and treating it as such would spend a cold start on nothing.
 */
const JAPANESE_SCRIPT =
  /[\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9D]/;

/** True when `text` contains at least one Japanese character worth analyzing. */
export function containsJapanese(text) {
  return JAPANESE_SCRIPT.test(text ?? '');
}

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
    // First POS subcategory — carries 非自立 (bound) and 接尾 (suffix), which is
    // most of what the merge rule turns on.
    posDetail: raw.posDetail ?? '',
    // Second POS subcategory. Only 接尾 uses it, to tell a word-building suffix
    // (東京+駅) from an honorific (山田+さん) or a counter (三+杯) — the first
    // sets the lookup string, the other two must not. See chunk.js.
    posDetail2: raw.posDetail2 ?? '',
    // Katakana reading, e.g. "イキ". Empty when IPADIC has none.
    reading: raw.reading ?? '',
    // IPADIC didn't recognise this one — a name, slang, or non-Japanese text.
    isUnknown: Boolean(raw.isUnknown),
  };
}

/**
 * Warm the analyzer up.
 *
 * The Lambda carries a 12.5 MB dictionary, so a cold start costs ~1.2 s while a
 * warm request costs 2-3 ms. Firing this the moment the Sentence tab opens
 * spends that 1.2 s while the user is still pasting and reading, instead of
 * after they hit Analyze. Accuracy was chosen over speed deliberately
 * (ADR-0003); this is what stops that choice being felt.
 *
 * Never throws and never reports anything. A warm-up is an optimisation, not a
 * feature — if it fails, the next real request simply pays the cold start, and
 * bothering the user about it would be noise about something they didn't ask
 * for. The single character is the cheapest input that still forces the
 * tokenizer to build.
 */
export async function warmUpAnalyzer() {
  // With no URL configured, `fetch('?text=…')` would resolve RELATIVE to the
  // page and quietly request our own origin, getting index.html back with a
  // 200. Harmless, but it makes a misconfiguration look like a working ping.
  if (!ANALYZER_URL) return;

  try {
    await fetch(`${ANALYZER_URL}?text=${encodeURIComponent('あ')}`);
  } catch {
    // Deliberately swallowed. See above.
  }
}

/**
 * Analyze `text` and return its Tokens.
 *
 * Returns `{ tokens }`, which may be empty for blank input. Each Token is a tap
 * target: `{ surface, baseForm, pos, isInteractive, isUnknown, fallbackBaseForm }`
 * — the last of those being a second lemma to try if `baseForm` finds nothing,
 * null on all but a merged compound (see chunk.js).
 *
 * Throws on network/HTTP failure, and on input this refuses to send. Following
 * the convention set by words.js, the thrown error's `message` is copy that can
 * go straight in front of the user, while the technical detail rides along as
 * `error.cause` for devtools.
 */
export async function analyzeSentence(text) {
  const trimmed = (text ?? '').trim();

  // Nothing to analyze. Returning early rather than throwing keeps an empty
  // textarea from being an error state, and costs no round trip.
  if (!trimmed) return { tokens: [] };

  // Both guards below run BEFORE any request. Length is checked first because
  // it's the one the on-screen counter mirrors — a user watching that counter
  // go red expects to be told about length, not script.
  if (trimmed.length > MAX_SENTENCE_LENGTH) {
    throw new Error(
      `That's ${trimmed.length} characters — the limit is ${MAX_SENTENCE_LENGTH}. ` +
        'Try a shorter passage.',
    );
  }

  // The cheapest possible defence against spending a cold start on garbage.
  if (!containsJapanese(trimmed)) {
    throw new Error(
      "That doesn't look like Japanese. Paste some Japanese text to see how it breaks into words.",
    );
  }

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

  // A 400 means the analyzer rejected the input itself. The client guards above
  // should have caught it, so reaching here means something slipped past them —
  // still, explain rather than say "try again", which is guaranteed to fail.
  if (response.status === 400) {
    throw new Error(
      `That text is too long to analyze — ${MAX_SENTENCE_LENGTH} characters maximum.`,
      { cause: new Error('Sentence analyzer rejected the input with 400') },
    );
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
  const morphemes = raw.map(normalizeMorpheme).filter(Boolean);

  // Morphemes stop here. Everything downstream sees Tokens.
  return { tokens: chunk(morphemes) };
}
