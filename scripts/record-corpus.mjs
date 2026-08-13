/**
 * Record analyzer output for the test corpus. Run by hand, not in CI.
 *
 *   npx ampx sandbox        # must be running / deployed first
 *   node scripts/record-corpus.mjs
 *
 * The chunking rule is only meaningful against morphemes IPADIC really emits,
 * and hand-written fixtures would encode assumptions about what a segmenter
 * produces — being wrong about exactly that is what disqualified TinySegmenter
 * during design (ADR-0003). So they're recorded and committed as data.
 *
 * Re-run whenever the Lambda's response shape changes. It rewrites
 * src/api/sentence.fixtures.js wholesale; never hand-edit that file.
 */

import { writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';

/**
 * Roughly 30 sentences spanning N5-N3 grammar, chosen for coverage of the
 * shapes the merge rule must survive rather than literary variety: て-form,
 * plain past, negative, polite, passive, causative-passive, い- and
 * な-adjectives, compound verbs, counters, and embedded clauses.
 */
const CORPUS = [
  // Plain past + particles — the canonical case from the spec.
  '昨日ビールを飲んだ。',
  // Polite past, compound verb of motion (見に行きました).
  '昨日、友達と映画を見に行きました。',
  // て-form + ください, and two particles that must NOT glue to nouns.
  '東京駅で新幹線に乗り換えてください。',
  // い-adjective, past negative — deinflection ADR-0002 leaves unhandled.
  '面白くなかった。',
  'この本は面白いです。',
  // な-adjective + progressive て-form.
  '静かな部屋で勉強しています。',
  '彼女はきれいな声で歌う。',
  // Counters.
  '毎日コーヒーを三杯飲みます。',
  '二時間ぐらい待ちました。',
  // Progressive.
  '私は日本語を勉強しています。',
  '子供たちが公園で遊んでいる。',
  '私の友達は日本に住んでいます。',
  // Passive / causative-passive.
  '先生に褒められました。',
  '母に野菜を食べさせられた。',
  // Embedded clauses.
  '彼が来ることを知っていますか。',
  'あまり高くないと思います。',
  // て-form chains.
  'ご飯を食べてから出かけます。',
  '走って学校に行った。',
  '昨日は忙しくて、寝られなかった。',
  '窓を開けてもいいですか。',
  // Obligation, potential, change-of-state.
  '宿題をしなければなりません。',
  '日本語が話せるようになりました。',
  '彼は日本語も英語も話せる。',
  // Hearsay / conjecture.
  '電車が遅れているらしいです。',
  '明日は雨が降るでしょう。',
  // Polite negative past.
  '山田さんは会議に出席しませんでした。',
  // Compound verb suffix.
  'その問題は難しすぎる。',
  'お茶を飲みながら話しましょう。',
  // Conditional.
  '雨が降ったら、家にいます。',
  // Question forms / possessives.
  '犬と猫のどちらが好きですか。',
  'これは誰の傘ですか。',
  '私は寿司が大好きです。',
];

const outputs = JSON.parse(readFileSync(new URL('../amplify_outputs.json', import.meta.url)));
const url = outputs.custom?.sentenceAnalyzerUrl;

if (!url) {
  console.error('No sentenceAnalyzerUrl in amplify_outputs.json — run `npx ampx sandbox` first.');
  process.exit(1);
}

const recorded = [];

for (const sentence of CORPUS) {
  const response = await fetch(`${url}?text=${encodeURIComponent(sentence)}`);
  if (!response.ok) {
    console.error(`FAILED ${response.status} for ${sentence}`);
    process.exit(1);
  }
  const { morphemes } = await response.json();
  recorded.push({ sentence, morphemes });
  console.error(`ok  ${sentence}  (${morphemes.length} morphemes)`);
}

// One morpheme per line keeps the diff readable when this is re-recorded —
// a change to one sentence shouldn't reflow the whole file.
const body = recorded
  .map(({ sentence, morphemes }) => {
    const lines = morphemes.map((m) => `      ${JSON.stringify(m)},`).join('\n');
    return `  {\n    sentence: ${JSON.stringify(sentence)},\n    morphemes: [\n${lines}\n    ],\n  },`;
  })
  .join('\n');

const file = `/**
 * Recorded analyzer output — GENERATED, do not hand-edit.
 *
 * Written by \`node scripts/record-corpus.mjs\` against a deployed sandbox.
 * These are the morphemes IPADIC really emits, not what we assumed it would;
 * see ADR-0003 for why that distinction decided the whole design.
 *
 * Recorded ${new Date().toISOString().slice(0, 10)} against lindera-wasm-nodejs-ipadic.
 */

export const CORPUS = [
${body}
];
`;

await writeFile(new URL('../src/api/sentence.fixtures.js', import.meta.url), file);
console.error(`\nWrote ${recorded.length} sentences to src/api/sentence.fixtures.js`);
