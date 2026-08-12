# No morphological analyzer (MeCab / kuromoji)

> **Partly superseded by [ADR-0003](./0003-sentence-analyzer-in-lambda.md).**
> The Sentence tab added an analyzer — in Lambda, where the payload never
> reaches the client. Everything below about keeping kuromoji *out of the
> browser* still stands, as does the deinflection fallback for the Dictionary
> tab. Only "no analyzer anywhere" is retired, and by exactly the route the
> "When to revisit" section predicted.

We considered adding a Japanese morphological analyzer so that a Surface form
typed by the user (飲んだ) would resolve to the right Entry (飲む). We decided
not to, and to handle the narrow gap with a rule-based deinflection fallback in
`src/api/words.js` instead.

## Considered Options

**kuromoji in the browser** — rejected. The maintained fork
(`@sglkc/kuromoji`) ships 17 MB of already-gzipped dictionary that must reach
the client. The entire current bundle is under 1 MB, and the backlog wants a
PWA, where that payload would have to be cached offline.

**MeCab behind the existing Lambda proxy** — rejected as unnecessary once the
two findings below made the case for any analyzer collapse.

**Rule-based deinflection fallback** — chosen. See ADR-0002.

## Why the case collapsed

Two premises turned out not to hold, and both are easy to re-propose because
neither is visible from the code:

1. **Jisho already deinflects.** 食べました→食べる, 行かなかった→行く,
   買わせられた→買う and 面白くなかった→面白い all resolve correctly today. The
   only observed failure is when a longer Entry literally begins with the
   Surface form (飲んだ→飲んだくれ, 読んで→読んで字のごとく), where Jisho
   abandons deinflection and returns the substring match instead.

2. **Analyzers analyse; they do not generate.** An analyzer could not replace
   `src/utils/conjugate.js`, because it turns 食べました into 食べる, not the
   reverse. The one thing it would contribute to generation — identifying the
   Verb class — already arrives free in Jisho's `parts_of_speech`, which
   `detectVerbClass` reads.

## When to revisit

Segmentation is the one job only an analyzer can do: Japanese has no spaces, so
example sentences with individually tappable words are impossible without it.
If example sentences are ever added, reopen this decision — and note it will
also need a sentence corpus, which the project does not have.
