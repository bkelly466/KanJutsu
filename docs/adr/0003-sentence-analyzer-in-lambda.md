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

**The rule:** start a Token at each independent (自立) word and absorb the
following auxiliaries (助動詞) and dependents (非自立); particles (助詞) stand
alone. Full 文節 chunking was rejected because it puts `で` inside the tap
target and corrupts the lookup string. Particles standing alone is deliberate,
not a leftover: は vs. が is exactly what a beginner taps on, and Jisho has real
entries for them.

Chunking lives on the client because it is the feature's most error-prone rule
and it is **pure** — the only kind of code this repo can test, since there is no
jsdom (CLAUDE.md). Putting it in the Lambda would place it where no test can
reach it (Vitest only collects `src/**`, and `amplify/` has no harness), and
make every iteration a backend redeploy.

## Lookups use IPADIC's lemma, not the Surface form

Tapping a Token searches its `basic_form` with `allowDeinflection: false`, and
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

Alongside that, a one-off script run by hand against the live API measures how
many Tokens resolve to an Entry. That hit rate belongs in this section once
measured — it is a measurement, not a test, and like the 55-word deinflection
corpus it is evidence the rule generalises, not proof.

_Hit rate: to be recorded when the corpus is run._

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
