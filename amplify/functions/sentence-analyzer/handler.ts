/**
 * Sentence analyzer — Lambda handler. Runs Lindera with IPADIC compiled into a
 * single ~12.5 MB `.wasm`, far too big to ship to a browser. Why it's here, and
 * why it's a separate function rather than a mode on jisho-proxy: ADR-0003.
 *
 * Returns raw morphemes with their POS tags, NOT finished words: IPADIC splits
 * 行きました into 行き|まし|た. Merging them into tappable Tokens is the client's
 * job (`src/utils/chunk.js`), where this project can unit-test the rule.
 *
 * Function URLs send an API Gateway HTTP API v2-shaped event, so the query
 * string arrives as `event.queryStringParameters`.
 */

import type { LambdaFunctionURLEvent, APIGatewayProxyResultV2 } from 'aws-lambda';

// CommonJS, and reads its dictionary off disk at load time. Marked EXTERNAL in
// amplify/backend.ts and copied into the deployment package whole — an
// "ENOENT ... lindera_wasm_bg.wasm" at runtime means that copy step broke.
import { TokenizerBuilder } from 'lindera-wasm-nodejs-ipadic';

/**
 * Longest sentence analyzed — several sentences of Japanese, comfortably past
 * the "paste a paragraph" case.
 *
 * The defensive copy of a limit the client enforces first with a visible
 * counter (src/api/sentence.js), stopping a hand-crafted request from burning
 * Lambda time on a novel. A 400 from here means something slipped past that
 * guard and is worth investigating.
 */
const MAX_TEXT_LENGTH = 300;

/**
 * Built once and kept: parsing the whole IPADIC dictionary is what makes a cold
 * start ~1.2 s against 2-3 ms warm, and anything outside the handler survives
 * into the next invocation of a warm container.
 *
 * Lazily rather than at module load, so a failure surfaces as a 500 with a
 * message instead of an opaque Lambda init error.
 */
let tokenizer: ReturnType<TokenizerBuilder['build']> | undefined;

function getTokenizer() {
  if (!tokenizer) {
    const builder = new TokenizerBuilder();
    builder.setDictionary('embedded://ipadic');
    // "normal" keeps compounds whole — 東京駅 stays 東京 + 駅. "decompose"
    // would split them further.
    builder.setMode('normal');
    tokenizer = builder.build();
  }
  return tokenizer;
}

/**
 * One morpheme as the client sees it. Lindera's native token shape never
 * escapes this file, so swapping the analyzer out changes only this and the
 * chunker's expectations.
 */
interface Morpheme {
  /** The text exactly as it appeared in the sentence, e.g. "行き". */
  surface: string;
  /** IPADIC's dictionary form, e.g. "行く". Falls back to `surface`. */
  baseForm: string;
  /** Top-level part of speech, e.g. "動詞", "助詞", "助動詞", "記号". */
  pos: string;
  /** First POS subcategory, carrying the 自立 / 非自立 / 接尾 the merge rule needs. */
  posDetail: string;
  /**
   * Second POS subcategory, emitted for one purpose: IPADIC files honorifics
   * (接尾,人名) and counters (接尾,助数詞) alongside genuine word-building
   * suffixes (東京+駅), and only the last should become the lookup string.
   * Searching "山田さん" finds nothing where "山田" finds the surname.
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
  // Lindera tags anything outside the dictionary "UNK". Such a token has no
  // lemma and no reading, leaving only the surface form — still enough for the
  // UI to make it tappable and let the user drill its kanji.
  const isUnknown = token.partOfSpeech === 'UNK';

  return {
    surface,
    // No lemma — unknown words, particles, punctuation — means the surface form
    // IS the dictionary form. Falling back here saves the client repeating the
    // check at every lookup.
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
  // The Function URL is on a different origin from Amplify Hosting, so the
  // browser blocks the response without these. Any origin is allowed: this is a
  // read-only text analyzer with no user data and no credentials.
  //
  // Here and ONLY here — backend.ts deliberately sets no `cors` block, because
  // configuring both produces duplicated headers that browsers reject.
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

  // Read-only, so anything but GET is rejected rather than falling through.
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
    // Logged rather than returned: the client replaces this message with its
    // own copy anyway, so returning the internal text would expose it on a
    // public endpoint and leave nothing searchable in CloudWatch.
    console.error('Tokenization failed:', err);

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: 'Analysis failed' }),
    };
  }
};
