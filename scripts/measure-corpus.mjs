/**
 * Measure what share of Tokens resolve to a dictionary Entry. Run by hand.
 *
 *   npx ampx sandbox          # must be running / deployed first
 *   npm run measure-corpus
 *
 * This is a MEASUREMENT, not a test, and it deliberately cannot run in CI: the
 * suite is offline (every fetch is stubbed), so "does this Token actually
 * resolve in Jisho?" — the claim the whole chunking rule rests on — is exactly
 * the question the tests are unable to ask. It follows the precedent of the
 * 55-word deinflection corpus in ADR-0002: evidence that a rule generalises,
 * recorded in an ADR with its date, not proof of anything.
 *
 * Run through vite-node rather than plain node, because it exercises the REAL
 * app modules — `analyzeSentence` and `lookUpToken`, extensionless imports,
 * `amplify_outputs.json` and `import.meta.env` and all. A reimplementation here
 * would measure this script rather than the app.
 *
 * `npm run measure-corpus` passes the Jisho proxy URL in as VITE_JISHO_PROXY_URL
 * — the same variable amplify.yml sets at build — because `jishoProxy.js` reads
 * it at import time, so it has to exist before any import runs. That makes the
 * npm script POSIX-shell-only (fine on macOS/Linux, not on cmd.exe); if the
 * outputs file is missing it substitutes an empty string and the guard below
 * explains what to do.
 *
 * Sentences come from the recorded fixtures rather than a list of their own, so
 * the measured corpus and the tested corpus cannot drift apart. Only the
 * sentence strings are used — the analyzer is called live, as the point is to
 * measure the live path end to end.
 */

import { readFileSync } from 'node:fs';

import { CORPUS } from '../src/api/sentence.fixtures.js';
import { analyzeSentence } from '../src/api/sentence.js';
import { resolveToken } from '../src/api/tokenLookup.js';
import { JISHO_PROXY } from '../src/api/jishoProxy.js';

/**
 * How long to wait between lookups.
 *
 * Two reasons, and the second one was measured here rather than assumed:
 *
 *   1. The Lambda concurrency ceiling on this account is 10, shared by every
 *      function including the dictionary's own proxy (see HANDOFF). A
 *      measurement run must not be capable of starving the live app, so this
 *      walks the corpus strictly sequentially.
 *
 *   2. **Jisho throttles rapid requests.** The first run of this script used a
 *      60 ms pause and 23 of 101 lemmas came back as proxy 502s ("Jisho API
 *      returned an error"), which would have been silently excluded from the
 *      rate and flattered it. Probing the same 16 words at four spacings gave
 *      5/16 failures at 60 ms, 3/16 at 150 ms, and 0/16 at both 250 ms and
 *      800 ms. 350 ms sits comfortably past that knee.
 *
 * `lookUpToken` caches by lemma, so a word appearing in five sentences still
 * costs one request and one pause.
 */
const PAUSE_MS = 350;

/** Wait before a second attempt at a lemma that failed. See RETRY note below. */
const RETRY_PAUSE_MS = 2000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/* -------------------------------------------------------------------------- */
/* Guards — a measurement that cannot measure must fail, not report 0.0%      */
/* -------------------------------------------------------------------------- */

// Tested as "is a real URL" rather than "isn't the dev path", because the npm
// script substitutes an empty string when amplify_outputs.json is missing the
// key, and `fetch('?keyword=…')` on a relative string throws a stack trace
// instead of saying what's wrong.
if (!/^https?:\/\//.test(JISHO_PROXY)) {
  console.error(
    'No usable Jisho proxy URL.\n' +
      'Run this via `npm run measure-corpus` (it passes the deployed URL in),\n' +
      'with `npx ampx sandbox` running so amplify_outputs.json exists.',
  );
  process.exit(1);
}

// The analyzer URL is read by src/api/sentence.js, which quietly falls back to
// '' — so check it here the way record-corpus.mjs does. Without this the run
// dies on the first sentence with "check your connection", copy written for a
// user on a flaky phone, which points a developer at entirely the wrong thing.
const outputs = JSON.parse(readFileSync(new URL('../amplify_outputs.json', import.meta.url)));
if (!outputs.custom?.sentenceAnalyzerUrl) {
  console.error('No sentenceAnalyzerUrl in amplify_outputs.json — run `npx ampx sandbox` first.');
  process.exit(1);
}

/**
 * Did the dictionary come back with the word we actually asked for?
 *
 * Deliberately stricter than "did Jisho return anything". A search for a
 * non-word usually returns *something* — entries that merely start with the
 * string — and counting those as a hit would flatter the chunking rule by
 * exactly the failure mode it exists to prevent. Reading counts as a match, so
 * a kana lemma resolving to a kanji entry (こと → 事) is a hit.
 *
 * Kept as its own copy rather than imported from tokenLookup.js, which applies
 * the same test when deciding whether to accept a fallback: a measurement that
 * borrowed its yardstick from the code being measured would agree with it even
 * when both were wrong.
 */
function isExactMatch(entries, lemma) {
  return entries.some((entry) => entry.word === lemma || entry.reading === lemma);
}

/** lemma → { status, pos, surfaces, sentences, topResult } */
const lemmas = new Map();
const tokenRecords = [];
let analyzed = 0;

for (const { sentence } of CORPUS) {
  let tokens;
  try {
    ({ tokens } = await analyzeSentence(sentence));
  } catch (error) {
    console.error(`ANALYZER FAILED for ${sentence}: ${error.message}`);
    process.exit(1);
  }
  analyzed += 1;

  for (const token of tokens) {
    // Punctuation is rendered but never tappable, so it can't succeed or fail
    // at resolving. Counting it either way would misstate the rate.
    if (!token.isInteractive) continue;

    const lemma = token.baseForm;
    let record = lemmas.get(lemma);

    if (!record) {
      let status;
      let topResult = '';
      // The lemma the entries turned out to be FOR — the Token's own, or the
      // one it was built from when the fallback fired (issue #30).
      let shownLemma = lemma;
      // RETRY: one second attempt after a long pause, because a throttled 502
      // says something about Jisho's rate limiting and nothing about whether
      // the Token resolves — and an error excluded from the denominator
      // quietly inflates the headline number, which is the one way this
      // measurement could lie.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        // Reset per attempt: a first-attempt error message must not survive
        // into a second attempt that succeeded.
        topResult = '';
        shownLemma = lemma;
        try {
          // The same call the overlay makes, fallback and all, so this measures
          // what a learner actually gets rather than the raw lookup.
          const resolved = await resolveToken(lemma, token.fallbackBaseForm);
          const entries = resolved.entries;
          shownLemma = resolved.lemma;

          if (entries.length === 0) status = 'none';
          // Counted apart from 'exact' on purpose: the Token DID reach a useful
          // Entry, but not the one its own lemma names, and lumping the two
          // together would hide the merged compounds the dictionary doesn't
          // carry — the very thing this measurement found last time.
          else if (resolved.usedFallback) status = 'fallback';
          else if (isExactMatch(entries, lemma)) status = 'exact';
          else {
            status = 'partial';
            topResult = entries[0].word;
          }
          break;
        } catch (error) {
          status = 'error';
          topResult = `${error.message} (${error.cause?.message ?? 'no cause'})`;
          if (attempt === 0) await sleep(RETRY_PAUSE_MS);
        }
      }

      // `pos` is the FIRST occurrence's tag. Verified against this corpus: no
      // lemma appears under two different parts of speech, so the breakdown
      // below is unambiguous. A lemma like よう (名詞/非自立 here, plausibly
      // 助動詞 elsewhere) would be filed under whichever came first — re-check
      // if the corpus grows.
      record = {
        status,
        pos: token.pos,
        topResult,
        shownLemma,
        surfaces: new Set(),
        sentences: new Set(),
      };
      lemmas.set(lemma, record);
      await sleep(PAUSE_MS);
    }

    record.surfaces.add(token.surface);
    record.sentences.add(sentence);
    tokenRecords.push({ lemma, surface: token.surface, pos: token.pos, status: record.status });
  }

  process.stderr.write(`\r  analyzed ${analyzed}/${CORPUS.length} sentences…`);
}

process.stderr.write('\n\n');

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

const count = (records, status) => records.filter((r) => r.status === status).length;
const pct = (n, total) => (total === 0 ? '0.0' : ((n / total) * 100).toFixed(1));

const tokensMeasured = tokenRecords.filter((r) => r.status !== 'error');
const lemmaRecords = [...lemmas.values()];
const lemmasMeasured = lemmaRecords.filter((r) => r.status !== 'error');

const tokenExact = count(tokensMeasured, 'exact');
const lemmaExact = count(lemmasMeasured, 'exact');

console.log(`Corpus: ${CORPUS.length} sentences, ${tokenRecords.length} tappable Tokens, ${lemmas.size} distinct lemmas`);
// Local date, not toISOString's UTC one: this line exists to be transcribed
// into the ADR next to a commit, and an evening run in the Americas would
// otherwise be dated tomorrow. 'en-CA' is the locale that formats as YYYY-MM-DD.
console.log(`Measured ${new Date().toLocaleDateString('en-CA')}\n`);

// Token-weighted first: it's what a learner experiences, since common words
// are tapped more often than rare ones.
console.log('By Token (what a learner meets):');
console.log(`  resolved exactly   ${tokenExact}/${tokensMeasured.length}  (${pct(tokenExact, tokensMeasured.length)}%)`);
console.log(`  via head fallback  ${count(tokensMeasured, 'fallback')}`);
console.log(`  results, no match  ${count(tokensMeasured, 'partial')}`);
// The number issue #30 is about: a tap that opens the overlay and shows the
// learner nothing. Everything above it puts SOME entry on screen.
console.log(`  dead-end taps      ${count(tokensMeasured, 'none')}`);

console.log('\nBy distinct lemma (what the rule is asked to do):');
console.log(`  resolved exactly   ${lemmaExact}/${lemmasMeasured.length}  (${pct(lemmaExact, lemmasMeasured.length)}%)`);
console.log(`  via head fallback  ${count(lemmasMeasured, 'fallback')}`);
console.log(`  results, no match  ${count(lemmasMeasured, 'partial')}`);
console.log(`  dead-end taps      ${count(lemmasMeasured, 'none')}`);

const errors = [...lemmas.entries()].filter(([, r]) => r.status === 'error');
if (errors.length > 0) {
  // Loud, because an excluded lemma is the one thing that can inflate the
  // headline rate. If this list isn't empty, the numbers ABOVE are provisional
  // — and the exit code below is non-zero so it can't be missed.
  console.log(`\n  ${errors.length} lookup(s) errored TWICE and are excluded from both rates:`);
  for (const [lemma, record] of errors) {
    console.log(`    ${lemma} — ${record.topResult}`);
  }
}

// Grouped by part of speech, because a SYSTEMATIC failure is the finding worth
// having — "every 助動詞 misses" is actionable in chunk.js, while a scattered
// 5% is just the dictionary's coverage.
const byPos = new Map();
for (const record of lemmasMeasured) {
  const bucket = byPos.get(record.pos) ?? { total: 0, exact: 0 };
  bucket.total += 1;
  if (record.status === 'exact') bucket.exact += 1;
  byPos.set(record.pos, bucket);
}

console.log('\nBy part of speech (distinct lemmas):');
for (const [pos, { total, exact }] of [...byPos.entries()].sort((a, b) => b[1].total - a[1].total)) {
  console.log(`  ${(pos || '(none)').padEnd(6)} ${String(exact).padStart(3)}/${String(total).padEnd(3)}  ${pct(exact, total).padStart(5)}%`);
}

const unresolved = [...lemmas.entries()]
  .filter(([, record]) => record.status !== 'exact' && record.status !== 'error')
  .sort(([, a], [, b]) => (a.pos || '').localeCompare(b.pos || ''));

if (unresolved.length > 0) {
  console.log('\nEvery lemma that did not resolve to its own Entry — read this list, do not just take the number:');
  for (const [lemma, record] of unresolved) {
    // The Token count is printed so the ADR write-up can be TRANSCRIBED rather
    // than reconstructed by hand. Getting it wrong by hand is not theoretical:
    // the first draft of ADR-0003's miss list transposed two of these counts,
    // and code review caught it.
    const occurrences = tokenRecords.filter((t) => t.lemma === lemma).length;
    const surfaces = [...record.surfaces].join(', ');
    const detail =
      record.status === 'partial'
        ? `top result ${record.topResult}`
        : record.status === 'fallback'
          ? `no entry of its own — fell back to ${record.shownLemma}`
          : 'no results, and nothing to fall back to';
    console.log(
      `  ${lemma}  [${record.pos || '?'}]  ${occurrences} Token(s), as: ${surfaces}  — ${detail}`,
    );
    console.log(`      in: ${[...record.sentences].join(' / ')}`);
  }
}

console.log('\nRecord the token-weighted figure and the date in ADR-0003.');

// Non-zero when any lemma was excluded, so a run that couldn't measure what it
// set out to measure can't be mistaken for a clean result.
process.exit(errors.length > 0 ? 1 : 0);
