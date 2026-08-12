# A morphological analyzer, in Lambda, for the Sentence tab

To let a learner paste Japanese and tap the words in it, we need segmentation —
the one job ADR-0001 identified as impossible without an analyzer. We're adding
one, but in the `sentence-analyzer` Lambda rather than the browser, using
Lindera (WASM, IPADIC) rather than kuromoji.

**This supersedes ADR-0001 only where the analyzer runs.** ADR-0001's actual
rejection — kuromoji *in the browser* — still stands, and for its original
reason: 17 MB of dictionary reaching the client is unacceptable, more so with a
PWA in the backlog. What changed is the location, not the objection.

## Why Lindera rather than the kuromoji fork ADR-0001 named

`@sglkc/kuromoji` is 17.4 MB across 53 files and loads its dictionary from a
`dicPath` directory of `.dat.gz` at runtime. `lindera-wasm-nodejs-ipadic` is
12.5 MB across 6 files, with IPADIC compiled into a single `.wasm`.

The size difference is the lesser reason. esbuild — which Amplify uses to
bundle functions — bundles JavaScript, not binary assets, so kuromoji's
dictionary files would be **silently dropped at build time and fail at
runtime**. One WASM blob has nothing to lose. Both expose the same IPADIC
tagset, so the chunking rule below is unaffected by the choice.

Getting a 12.5 MB asset into the package needs Amplify's [custom functions][cf]
path — a CDK `NodejsFunction` declared in `backend.ts` — because plain
`defineFunction` exposes no bundling controls. This is the first function in the
repo that needs it; `jisho-proxy` uses the simple path.

Within that, the package is marked as an esbuild **external module** and copied
into the deployment package by an `afterBundling` command hook. CDK's own
`bundling.nodeModules` option is the documented answer to this problem and was
considered: it marks the package external, writes a `package.json` into the
output directory and runs `npm install` there, which would handle transitive
dependencies for free. It was not chosen because Lindera has **zero
dependencies** — the package is three files and a `.wasm` — so the install buys
nothing and costs a package-manager run on every deploy. The copy asserts the
`.wasm` landed (`test -f`), which converts the failure mode this whole section
exists to prevent from a runtime 500 into a failed build. If the package ever
grows a dependency, that assertion fires and `nodeModules` is the fix.

[cf]: https://docs.amplify.aws/react/build-a-backend/functions/custom-functions/

## A separate function, not a second mode on jisho-proxy

Loading 12.5 MB of WASM into `jisho-proxy` would tax the cold start of every
word search in the app — spending the most-used path's latency on the
least-used feature. Separate functions also mean the analyzer can fail without
taking the dictionary down.

The cold start is real and was accepted deliberately (accuracy over
performance). It's mitigated by a **warm-up ping fired when the Sentence tab
opens**, which buys back the seconds a user spends pasting and reading.
Provisioned concurrency was rejected: a standing bill for a portfolio app.

## Tokens are chunked on the client, from raw morphemes

The Lambda returns morphemes and their POS tags; `src/utils/chunk.js` merges
them into Tokens. IPADIC emits morphemes, not words — 行き|まし|た — and `行き`
is not lookupable, so something has to merge them back.

**The rule:** absorb auxiliaries (助動詞) and bound forms (非自立, 接尾) — except
名詞/非自立 — into the Token before them; particles (助詞) and punctuation (記号) stand alone and close
the current Token; everything else starts a new one. Full 文節 chunking was
rejected because it puts `で` inside the tap target and corrupts the lookup
string. Particles standing alone is deliberate, not a leftover: は vs. が is
exactly what a beginner taps on, and Jisho has real entries for them.

### Corrections the evidence forced (#20)

The rule was originally written as "start a Token at each independent (自立)
word". **That is factually wrong, and the recorded fixtures caught it** — the
clearest possible vindication of recording them instead of writing them.

The test every rule below answers to: **would this Token be a real thing to look
up?** A Token a learner taps and gets nothing from is worse than two Tokens that
each resolve.

1. **IPADIC never tags a noun 自立.** 名詞 comes back as 一般, 代名詞, 副詞可能,
   サ変接続, 固有名詞, 数. Keyed off 自立, every noun in the language would have
   been homeless. The rule has to name what gets *absorbed*, not what starts.
2. **The copula stands alone unless it's inflecting a verb or adjective.**
   です after 傘 is a free-standing copula with its own entry; 傘です is not a
   word. です after 面白い is polite inflection and belongs inside. IPADIC can't
   separate them by the auxiliary alone — 飲んだ's past-tense だ is *also*
   baseForm だ — so the rule keys off the head's part of speech.
   Phrased as what **may** absorb rather than what may not, deliberately: an
   unrecognised word carries no POS tag at all, so the inverted phrasing would
   have let ペヤングです through as one "word". Review caught that; the corpus
   never could, because 32 well-formed sentences contain nothing IPADIC doesn't
   know.
3. **Bound nouns (名詞/非自立) stand alone.** こと and よう are formal nouns with
   real dictionary entries and are exactly the grammar a learner taps.
   Absorbing them produced 来ること and 話せるよう as offered "words".
4. **Content-bearing auxiliaries stand alone.** らしい, よう, そう, みたい carry
   meaning — usually the whole point of the sentence. Absorbed, they produced
   いるらしいです, whose "→ いる" actively hides the hearsay marker inside a verb.
   Pure inflection (まし, た, ませ, ん, なかっ, れる, られる) keeps absorbing.
5. **する merges into a サ変接続 noun.** 勉強+し is one Token looking up 勉強する.
   Suru-verbs are the largest verb class in Japanese; leaving them split showed
   勉強 and し as unrelated words, against the feature's whole promise.

**On 接尾, which is three different things.** A *derivational* suffix makes the
merged text the lookup string — 東京 + 駅 searches 東京駅. But IPADIC also files
honorifics (接尾,人名 — さん, 様) and counters (接尾,助数詞 — 杯, 時間, 円) under
接尾, and neither is in any dictionary: 山田さん and 三杯 would be dead-end taps.
Those keep the head's lemma, so the visible span stays 山田さん while the lookup
is 山田. Telling them apart needs IPADIC's **second** subcategory, which the
Lambda now emits as `posDetail2` for this single purpose. Inflectional marking
(助動詞, 動詞/接尾) leaves the lemma alone regardless, so 食べさせられた still
searches 食べる.

### Known rough edges, accepted

- **Splitting on particles leaves some non-word surfaces.** しなけれ in
  宿題をしなければ is a Token because ば is a particle. Unavoidable while
  particles stand alone, and the lookup (する) is still right.
- **静か | な.** な is the attributive of a な-adjective, and Jisho lists 静かな.
  Merging 形容動詞語幹 + な was considered and rejected for consistency with the
  copula rule, but it is the weakest of these calls.
- **降るでしょう stays merged** while いる | らしいです splits, because でしょう is
  the polite form of です rather than an evidential. Defensible, but a line drawn
  by judgement rather than by the tagset.

Chunking lives on the client because it is the feature's most error-prone rule
and it is **pure** — the only kind of code this repo can test, since there is no
jsdom (CLAUDE.md). Putting it in the Lambda would place it where no test can
reach it (Vitest only collects `src/**`, and `amplify/` has no harness), and
make every iteration a backend redeploy.

## Lookups use IPADIC's lemma, not the Surface form

Tapping a Token searches its `baseForm` with `allowDeinflection: false`, and
the overlay displays the relationship (飲んだ → 飲む) because that is the
pedagogically useful part. One request instead of up to four, and no guessing.

**Consequence: the app now has two mechanisms for the same job** —
`deinflect.js` in the Dictionary tab, IPADIC in the Sentence tab. This was
accepted with eyes open rather than drifted into. It also means the Sentence tab
quietly closes gaps ADR-0002 left open: IPADIC deinflects adjectives, so
面白くなかった → 面白い resolves *there* while typing it into the Dictionary tab
still does not. If that inconsistency starts to bite, routing the Dictionary tab
through the analyzer too is the obvious next move — and would retire
`deinflect.js`.

## How the rule gets verified

The test suite is offline (`words.test.js` mocks `fetch`), so "does this Token
actually resolve in Jisho?" — the thing we care about — **cannot be a CI test**.
Only boundary correctness can.

The corpus is asserted through **`analyzeSentence()`**, not against `chunk()`
directly — one seam rather than the two ADR-0002 used for deinflection. The
`fetch` stub carries **recorded Lindera output**, so the corpus tests the merge
rule against morphemes the analyzer really emits rather than against our
assumption of what IPADIC produces — which was the whole failure mode that made
TinySegmenter unusable. Cap enforcement, the no-Japanese short circuit, error
paths and unknown Tokens land in the same suite for free. `chunk.js` stays a
module for organisation, but is an internal detail with no test file of its own.

Alongside that, `npm run measure-corpus` (`scripts/measure-corpus.mjs`) runs the
corpus against the live API by hand and measures how many Tokens resolve to an
Entry. It is a measurement, not a test, and like the 55-word deinflection corpus
it is evidence the rule generalises, not proof.

### Measured hit rate — 2026-08-12

**97.3% of Tokens resolve exactly** (179 of 184 tappable Tokens across the
32-sentence corpus; 97 of 101 distinct lemmas, 96.0%). Punctuation is excluded,
since it is rendered but never tappable.

"Resolve" is deliberately strict: the dictionary must return an Entry whose
Headword **or** Reading *is* the lemma. Counting "Jisho returned something"
would flatter the rule by exactly the failure mode it exists to prevent — a
search for a non-word usually returns entries that merely start with the string.

| Part of speech | Distinct lemmas resolved |
|---|---|
| 動詞 (verb) | 25/25 — 100% |
| 形容詞 (adjective) | 5/5 — 100% |
| 助動詞 (auxiliary) | 3/3 — 100% |
| 連体詞, 副詞 | 3/3 — 100% |
| 名詞 (noun) | 48/51 — 94.1% |
| 助詞 (particle) | 13/14 — 92.9% |

**The verbs are the result that matters.** Deinflection is the hard part and the
reason the analyzer exists at all; 100% of verbs and adjectives reaching their
dictionary Entry is the claim ADR-0003 was written to make.

### The five misses, one by one

Reading the list matters more than the percentage, and four of the five are
softer than the number suggests:

- **勉強する, 出席する** (2 lemmas, 2 Tokens) — the サ変 merge composes a lookup
  string (`head.surface + する`) that Jisho files under the bare noun. Searching
  勉強する returns 勉強 as its **top** result, tagged as a suru verb, so the
  learner who taps 勉強し sees the right entry. A miss by this script's strict
  definition; not a miss on screen.
- **ぐらい** (1 lemma, 2 Tokens) — Jisho's headword is くらい, of which ぐらい is
  a variant reading. Top result is again the correct entry.
- **東京駅** (1 lemma, 1 Token) — **the only true dead end in the corpus.** Jisho
  has no 東京駅 entry at all, so the overlay says there is none. This is the
  derivational-suffix rule (東京 + 駅 → look up the compound) doing exactly what
  it was designed to do and finding that the dictionary doesn't carry the
  compound. Recorded as a limitation below.

So: **1 dead-end tap in 184**, and 4 more where the top result is right but the
Headword isn't string-identical to the lemma.

### Limitation: a merged compound the dictionary doesn't carry

東京駅 is the shape to watch — a proper noun plus a 接尾/一般 suffix. The merge
is right for the *reading* (東京駅 is one word on the page) and right for
子供たち, which resolves; it just outruns Jisho's entry list for place names.

The fix, when it's worth doing, is a **fallback to the head morpheme's lemma**
when the merged lookup returns nothing: tap 東京駅, get 東京 with the Surface
form still shown above it. That costs a second request only in the case that
already failed. Deliberately not done in #24, which is a measurement ticket —
tracked separately so it isn't lost.

### Method note: Jisho throttles sustained request rates

The first run of the script paced lookups 60 ms apart and **23 of 101 lemmas
came back as proxy 502s**, which would have been excluded from the denominator
and silently inflated the headline number. Probing 16 words at four spacings:
5/16 failed at 60 ms, 3/16 at 150 ms, 0/16 at 250 ms, 0/16 at 800 ms. The script
now paces at 350 ms and retries once, and reports any remaining exclusions
loudly.

This does **not** affect the app: a burst of 4 simultaneous requests — the
pattern `searchWords` uses for ADR-0002's deinflection candidates — was tested
at 0/20 failures. The limit is on sustained rate, not concurrency, so it
constrains bulk tooling like this script rather than a person tapping words.
Anything that walks a corpus in future should pace itself the same way.

## Consequences

- The Function URL is read from `amplify_outputs.json` directly rather than
  through a `VITE_` env var. The Jisho proxy can fall back to the Vite dev proxy
  locally; **an analyzer that only exists in Lambda cannot**, so the env-var
  route would mean hand-copying a sandbox URL into `.env.local` and re-copying
  it every time the sandbox is recreated. `amplify.yml` keeps a loud `test -n`
  guard on the key so a failed backend deploy can't silently ship a dead tab.
- CI's `amplify_outputs.json` stub step must move **above** `npm test`; a
  `src/api/sentence.js` that imports outputs would otherwise fail the offline
  suite.
- A Sentence is ephemeral — not stored, not a Card. A Token that resolves can
  still be added to a Deck: `createCard(entry, 'word')` already consumes that
  shape, so this costs no schema change. Carrying the Sentence as example
  context on a Card's back is deliberately deferred.
