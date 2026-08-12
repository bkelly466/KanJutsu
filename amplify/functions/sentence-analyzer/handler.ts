/**
 * Sentence analyzer — Lambda handler
 *
 * Why this exists:
 *   Japanese has no spaces, so a learner can't look up a word inside a sentence
 *   without first knowing where it starts and ends. Finding those boundaries
 *   needs a morphological analyzer and a dictionary. We run Lindera with IPADIC
 *   compiled into a single ~12.5 MB `.wasm` — far too big to ship to a browser
 *   (see docs/adr/0001), so it lives here instead.
 *
 * Why its own function, not a second mode on jisho-proxy:
 *   Loading 12.5 MB of WASM would tax the cold start of *every* word search in
 *   the app — spending the most-used path's latency on the least-used feature.
 *   See docs/adr/0003-sentence-analyzer-in-lambda.md.
 *
 * What it returns:
 *   Raw morphemes with their part-of-speech tags — NOT finished words. IPADIC
 *   splits 行きました into 行き|まし|た, and `行き` isn't something you can look
 *   up. Merging morphemes back into tappable Tokens is the client's job
 *   (`src/utils/chunk.js`), because that rule is the error-prone part and the
 *   client is the only place this project can unit-test it.
 *
 * Event format:
 *   Lambda Function URLs send an API Gateway HTTP API v2-shaped event, so the
 *   query string arrives as event.queryStringParameters, e.g. { text: "本を読む" }.
 */

import type { LambdaFunctionURLEvent, APIGatewayProxyResultV2 } from 'aws-lambda';

// This package is CommonJS and reads its dictionary off disk at load time
// (`fs.readFileSync(__dirname + '/lindera_wasm_bg.wasm')`). esbuild bundles
// JavaScript, not binary assets, so it is deliberately marked as an EXTERNAL
// module in amplify/backend.ts and copied into the deployment package whole.
// If you ever see "ENOENT ... lindera_wasm_bg.wasm" at runtime, that copy step
// is what broke.
import { TokenizerBuilder } from 'lindera-wasm-nodejs-ipadic';

/**
 * Longest sentence we'll analyze. 300 characters is several sentences of
 * Japanese — comfortably more than the "paste a paragraph" case.
 *
 * NOTE: the client enforces the same number first, with a visible counter
 * (src/api/sentence.js). This copy is the defensive one — it stops a
 * hand-crafted request burning Lambda time on a novel. A 400 from here means
 * something slipped past the client guard, so it is worth investigating.
 */
const MAX_TEXT_LENGTH = 300;

/**
 * Building the tokenizer parses the whole IPADIC dictionary, so we do it once
 * and hang onto it.
 *
 * Lambda keeps a "warm" container alive between requests, and anything stored
 * outside the handler survives into the next invocation. So the first request
 * after a cold start pays this cost and every request after it gets the
 * tokenizer for free. Measured on the sandbox: ~1.2 s cold, 2-3 ms warm.
 * (The client fires a warm-up ping when the Sentence tab opens, so that first
 * cost lands while the user is still pasting rather than after.)
 *
 * It's built lazily rather than at module load so that a failure surfaces as a
 * normal 500 with a message, instead of an opaque Lambda init error.
 */
let tokenizer: ReturnType<TokenizerBuilder['build']> | undefined;

function getTokenizer() {
  if (!tokenizer) {
    const builder = new TokenizerBuilder();
    builder.setDictionary('embedded://ipadic');
    // "normal" keeps compound words whole (東京駅 stays 東京 + 駅 rather than
    // being decomposed further). "decompose" would split them more aggressively.
    builder.setMode('normal');
    tokenizer = builder.build();
  }
  return tokenizer;
}

/**
 * One morpheme as the client sees it.
 *
 * The client never sees Lindera's native token shape — same reason src/api/
 * normalises Jisho's: if the analyzer is ever swapped out, only this file and
 * the chunker's expectations change.
 */
interface Morpheme {
  /** The text exactly as it appeared in the sentence, e.g. "行き". */
  surface: string;
  /** IPADIC's dictionary form (lemma), e.g. "行く". Falls back to `surface`. */
  baseForm: string;
  /** Top-level part of speech, e.g. "動詞", "助詞", "助動詞", "記号". */
  pos: string;
  /** First POS subcategory. Carries 自立 / 非自立 / 接尾, which the merge rule needs. */
  posDetail: string;
  /**
   * Second POS subcategory. Only 接尾 needs it, and it matters: IPADIC lumps
   * honorifics (接尾,人名 — さん, 様) and counters (接尾,助数詞 — 杯, 円) in with
   * genuine word-building suffixes (東京+駅). The merge rule uses this to decide
   * whether the merged text becomes the lookup string, because searching
   * "山田さん" finds nothing while "山田" finds the surname.
   */
  posDetail2: string;
  /** Katakana reading, e.g. "イキ". Empty when IPADIC has none. */
  reading: string;
  /** True when IPADIC didn't recognise the word (names, slang, latin text). */
  isUnknown: boolean;
}

/**
 * IPADIC writes "*" in a field it has no value for, and Lindera leaves fields
 * undefined entirely for unknown words. Both mean "nothing here" to us.
 */
function clean(value: string | undefined): string {
  return !value || value === '*' ? '' : value;
}

function normalizeMorpheme(token: Record<string, string | undefined>): Morpheme {
  const surface = token.surface ?? '';
  // Lindera tags anything outside the dictionary as "UNK". Such a token has no
  // lemma and no reading, so the surface form is all we can offer — which is
  // still enough for the UI to make it tappable and let the user drill its kanji.
  const isUnknown = token.partOfSpeech === 'UNK';

  return {
    surface,
    // No lemma (unknown words, particles, punctuation) means the surface form
    // IS the dictionary form. Falling back here keeps the client from having to
    // repeat this check at every lookup.
    baseForm: clean(token.baseForm) || surface,
    pos: isUnknown ? '' : clean(token.partOfSpeech),
    posDetail: isUnknown ? '' : clean(token.partOfSpeechSubcategory1),
    posDetail2: isUnknown ? '' : clean(token.partOfSpeechSubcategory2),
    reading: clean(token.reading),
    isUnknown,
  };
}

export const handler = async (
  event: LambdaFunctionURLEvent
): Promise<APIGatewayProxyResultV2> => {
  // CORS headers — the Function URL is on a different origin
  // (*.lambda-url.*.on.aws) than Amplify Hosting, so without these the browser
  // blocks the response. Any origin is allowed: this is a read-only text
  // analyzer with no user data and no credentials.
  //
  // These live here and ONLY here. There is deliberately no `cors` block on the
  // Function URL in backend.ts — configuring both produces duplicated headers
  // (e.g. "Access-Control-Allow-Origin: *, *"), which browsers reject.
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json',
  };

  const method = event.requestContext?.http?.method;

  // The browser's CORS preflight, sent before the real cross-origin GET.
  if (method === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  // Read-only: only GET is supported. Reject anything else rather than letting
  // it fall through to the analysis path.
  if (method && method !== 'GET') {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  const text = event.queryStringParameters?.text;

  if (!text) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'text query parameter is required' }),
    };
  }

  if (text.length > MAX_TEXT_LENGTH) {
    return {
      statusCode: 400,
      headers: corsHeaders,
      body: JSON.stringify({
        error: `text must be ${MAX_TEXT_LENGTH} characters or fewer`,
      }),
    };
  }

  try {
    const tokens = getTokenizer().tokenize(text) as Record<string, string | undefined>[];

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ morphemes: tokens.map(normalizeMorpheme) }),
    };
  } catch (err) {
    // Log before responding. Without this the only record of a failure is a
    // response the user will never think to report, and the client throws the
    // message away anyway (src/api/sentence.js replaces it with its own copy) —
    // so returning the internal text would expose it on a public endpoint while
    // buying us nothing searchable in CloudWatch.
    console.error('Tokenization failed:', err);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Analysis failed' }),
    };
  }
};
