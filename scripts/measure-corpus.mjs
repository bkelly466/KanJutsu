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
 * would measure this script rather than the app. (vite-node ships with vitest,
 * already a devDependency; `npm run measure-corpus` also passes the Jisho proxy
 * URL through as VITE_JISHO_PROXY_URL, which is how the app gets it at build.)
 *
 * Sentences come from the recorded fixtures rather than a list of their own, so
 * the measured corpus and the tested corpus cannot drift apart. Only the
 * sentence strings are used — the analyzer is called live, as the point is to
 * measure the live path end to end.
 */

import { CORPUS } from '../src/api/sentence.fixtures.js';
import { analyzeSentence } from '../src/api/sentence.js';
import { lookUpToken } from '../src/api/tokenLookup.js';
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

if (JISHO_PROXY.startsWith('/')) {
  console.error(
    'JISHO_PROXY is the dev-server path, which a Node process cannot fetch.\n' +
      'Run this via `npm run measure-corpus`, which passes the deployed proxy URL in.',
  );
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
      // RETRY: one second attempt after a long pause, because a throttled 502
      // says something about Jisho's rate limiting and nothing about whether
      // the Token resolves — and an error excluded from the denominator
      // quietly inflates the headline number, which is the one way this
      // measurement could lie.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const entries = await lookUpToken(lemma);
          if (entries.length === 0) status = 'none';
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

      record = { status, pos: token.pos, topResult, surfaces: new Set(), sentences: new Set() };
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
console.log(`Measured ${new Date().toISOString().slice(0, 10)}\n`);

// Token-weighted first: it's what a learner experiences, since common words
// are tapped more often than rare ones.
console.log('By Token (what a learner meets):');
console.log(`  resolved exactly   ${tokenExact}/${tokensMeasured.length}  (${pct(tokenExact, tokensMeasured.length)}%)`);
console.log(`  results, no match  ${count(tokensMeasured, 'partial')}`);
console.log(`  nothing at all     ${count(tokensMeasured, 'none')}`);

console.log('\nBy distinct lemma (what the rule is asked to do):');
console.log(`  resolved exactly   ${lemmaExact}/${lemmasMeasured.length}  (${pct(lemmaExact, lemmasMeasured.length)}%)`);
console.log(`  results, no match  ${count(lemmasMeasured, 'partial')}`);
console.log(`  nothing at all     ${count(lemmasMeasured, 'none')}`);

const errors = [...lemmas.entries()].filter(([, r]) => r.status === 'error');
if (errors.length > 0) {
  // Loud, because an excluded lemma is the one thing that can inflate the
  // headline rate. If this list isn't empty, the number below is provisional.
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

const unresolved = lemmaRecords
  .filter((r) => r.status === 'none' || r.status === 'partial')
  .sort((a, b) => a.pos.localeCompare(b.pos));

if (unresolved.length > 0) {
  console.log('\nEvery lemma that did not resolve — read this list, do not just take the number:');
  for (const [lemma, record] of lemmas) {
    if (record.status !== 'none' && record.status !== 'partial') continue;
    const surfaces = [...record.surfaces].join(', ');
    const detail = record.status === 'partial' ? `top result ${record.topResult}` : 'no results';
    console.log(`  ${lemma}  [${record.pos || '?'}]  as: ${surfaces}  — ${detail}`);
    console.log(`      in: ${[...record.sentences][0]}`);
  }
}

console.log('\nRecord the token-weighted figure and the date in ADR-0003.');
