/**
 * Sentence analyzer data access layer.
 *
 * The Lambda returns MORPHEMES (行きました → 行き|まし|た); this module merges
 * them into Tokens via src/utils/chunk.js before anything else sees them, the
 * same boundary words.js draws around Jisho's response. Why the analyzer runs
 * in Lambda at all: ADR-0003.
 *
 * Also the single seam the feature is tested at — chunk.js has no test file, so
 * sentence.test.js asserts Token boundaries through `analyzeSentence()` against
 * recorded analyzer output.
 */

import outputs from '../../amplify_outputs.json';
import { chunk } from '../utils/chunk';

/**
 * Where the analyzer lives — read from the generated outputs file rather than a
 * VITE_ variable like JISHO_PROXY, because the analyzer has no local fallback
 * and an env var would mean hand-copying a sandbox URL after every recreate.
 * This way `npx ampx sandbox` wires local dev up by itself.
 *
 * Empty in CI, which writes a stub `{}` outputs file. Harmless — tests stub
 * `fetch`, and amplify.yml's `test -n` check is what guards production.
 */
const ANALYZER_URL = outputs.custom?.sentenceAnalyzerUrl ?? '';

/**
 * Longest Sentence analyzed, enforced before any request is made. Over-long
 * text is refused outright, never truncated: studying a sentence quietly cut in
 * half is worse than being told to shorten it.
 *
 * The Lambda enforces the same number defensively, and SentenceAnalyzer.jsx's
 * counter reads this constant, so neither can drift.
 */
export const MAX_SENTENCE_LENGTH = 300;

/**
 * Japanese script — hiragana, katakana, CJK ideographs and extension A, CJK
 * compatibility ideographs, and halfwidth katakana. Escapes rather than literal
 * characters, so no invisible character can hide in the source.
 *
 * Halfwidth katakana (FF66-FF9D) is included because receipts, older sites and
 * some IME output use it, and refusing it would tell a learner their Japanese
 * isn't Japanese. CJK punctuation (3000-303F) is EXCLUDED: a string of full
 * stops is not text to analyze, and would spend a cold start on nothing.
 */
const JAPANESE_SCRIPT =
  /[\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF66-\uFF9D]/;

/** True when `text` contains at least one Japanese character worth analyzing. */
export function containsJapanese(text) {
  return JAPANESE_SCRIPT.test(text ?? '');
}

/**
 * One raw response item as the shape the app relies on, or null when it carries
 * no surface form and there would be nothing to render.
 *
 * The Lambda already normalises Lindera's output; this is the belt-and-braces
 * pass that degrades a truncated response into defaults rather than scattering
 * `undefined` through the UI, as normalizeWord() does in words.js.
 */
export function normalizeMorpheme(raw) {
  if (!raw || typeof raw.surface !== 'string' || raw.surface === '') return null;

  return {
    // The text as it appeared in the sentence, e.g. "行き".
    surface: raw.surface,
    // IPADIC's dictionary form, e.g. "行く" — what a lookup searches.
    baseForm: typeof raw.baseForm === 'string' && raw.baseForm ? raw.baseForm : raw.surface,
    // 動詞 (verb), 助詞 (particle), 助動詞 (auxiliary), 記号 (punctuation), …
    pos: raw.pos ?? '',
    // First POS subcategory, carrying 非自立 (bound) and 接尾 (suffix) — most of
    // what the merge rule turns on.
    posDetail: raw.posDetail ?? '',
    // Second POS subcategory. Only 接尾 uses it, to separate a word-building
    // suffix (東京+駅) from an honorific (山田+さん) or counter (三+杯). See chunk.js.
    posDetail2: raw.posDetail2 ?? '',
    // Katakana reading, e.g. "イキ". Empty when IPADIC has none.
    reading: raw.reading ?? '',
    // IPADIC didn't recognise it — a name, slang, or non-Japanese text.
    isUnknown: Boolean(raw.isUnknown),
  };
}

/**
 * Warm the analyzer up. Never throws and never reports — a failed warm-up just
 * means the next real request pays the cold start.
 *
 * A cold start costs ~1.2 s against 2-3 ms warm, so firing this as the Sentence
 * tab opens spends it while the user is still pasting. The single character is
 * the cheapest input that still forces the tokenizer to build.
 */
export async function warmUpAnalyzer() {
  // Without this, `fetch('?text=…')` resolves relative to the page and requests
  // our own origin, getting index.html with a 200 — a misconfiguration that
  // looks like a working ping.
  if (!ANALYZER_URL) return;

  try {
    await fetch(`${ANALYZER_URL}?text=${encodeURIComponent('あ')}`);
  } catch {
    // Swallowed deliberately; see above.
  }
}

/**
 * Analyze `text` and return `{ tokens }`, empty for blank input. Each Token is
 * a tap target:
 * `{ surface, baseForm, pos, isInteractive, isUnknown, fallbackBaseForm }`.
 *
 * Throws on network or HTTP failure and on input it refuses to send, with a
 * user-facing `message` and the technical detail as `error.cause`.
 */
export async function analyzeSentence(text) {
  const trimmed = (text ?? '').trim();

  // Early return rather than a throw, so an empty textarea isn't an error state.
  if (!trimmed) return { tokens: [] };

  // Both guards run before any request. Length first, because it's the one the
  // on-screen counter mirrors — a user watching it go red expects to be told
  // about length, not script.
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
    // Offline, DNS, or the Lambda unreachable.
    throw new Error(
      'Could not analyze the sentence. Please check your connection and try again.',
      { cause },
    );
  }

  // The analyzer rejected the input itself, meaning something slipped past the
  // guards above. Explain it rather than saying "try again", which would fail.
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
    // A proxy or gateway can return an HTML error page with a 200, which would
    // otherwise put a raw "Unexpected token '<'" on screen.
    throw new Error('Could not analyze the sentence. Please try again.', { cause });
  }

  // Array.isArray rather than `?? []`: a null body, or `morphemes` arriving as
  // an object or string, throws a raw TypeError past all the copy above.
  const raw = Array.isArray(json?.morphemes) ? json.morphemes : [];
  const morphemes = raw.map(normalizeMorpheme).filter(Boolean);

  // Morphemes stop here. Everything downstream sees Tokens.
  return { tokens: chunk(morphemes) };
}
