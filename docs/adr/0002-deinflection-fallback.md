# Rule-based deinflection fallback for 音便 た/て forms

When a user searches a Surface form and Jisho returns only longer Entries that
begin with it, we deinflect locally and re-search for the candidate Headwords.
This covers the one gap left after ADR-0001 without shipping an analyzer.

## The gap

Jisho deinflects well on its own, but abandons it when a longer Entry starts
with the typed string. 飲んだ returns 飲んだくれ and 飲んだくれる — 飲む is
absent from the result list entirely, not ranked low, so client-side re-ranking
cannot fix it. Observed on 飲んだ, 読んで and 待った; 読んだ, 遊んだ, 走った and
買った already work.

## Design

**Trigger.** Deinflect locally first. If the Surface form matches no た/て
pattern, there is no candidate and we never retry — this keeps forms Jisho
already handles (食べました) from costing a second call. Retry only when a
candidate exists *and* no returned Entry's Headword equals it.

**Ambiguity.** Euphonic endings are many-to-one: んだ/んで ← む, ぶ, ぬ, and
った/って ← う, つ, る. いた/いだ/した are unambiguous. Only the dictionary can
say which candidate is real, so all candidates are searched **in parallel** —
one round-trip of latency rather than three. If more than one returns a valid
Entry, prefer the one flagged `is_common`.

**Ichidan forms.** 見る → 見た is not euphonic and needed its own rule; without
it 見た returned 見た目 and 出た returned 出たて, with the verb absent. This rule
fires on any た/て the euphonic rules didn't claim, which is broad — うた (歌)
proposes うる. That is safe *only* because an exact match is trusted first (歌
is a real Entry for うた, so no retry runs). The rule and that guard have to
stay together.

**Kana input.** Candidates are matched against an Entry's Reading as well as
its Headword, so のんだ resolves via のむ to 飲む. Comparing Headwords alone
would have left beginners — the people most likely to type kana — seeing
"drunkard".

**Disclosure.** The substitution is shown to the user ("Showing results for
飲む"), not applied silently. Beyond matching the project's quality bar for
visible states, the Headword is the form a learner needs to memorise — hiding
it would discard the most useful information in the interaction.

**Failure.** If no candidate resolves, fall back silently to the original
results with no banner. Listing the candidates we tried would expose internals
and read as noise after a typo.

## An exact match is always trusted

If Jisho returns an Entry whose Headword or Reading *is* the string that was
typed, we keep it and never retry.

This was not the original decision. The design session assumed the trigger
would leave exact matches alone by itself, and accepted that 待った would
resolve to 待つ rather than the sumo/shogi noun. Code review found that
reasoning doesn't survive contact: the trigger compares results against the
*candidates*, so **any** exact hit ending in a た/て shape was being discarded.
Verified against the live API, that silently broke common vocabulary —

- 決して (けっして, "never") was being replaced by 決する
- として was being replaced by とする
- 果たして was being replaced by 果たす

These are N4/N3 grammar a learner looks up constantly, and they are Headwords
in their own right that merely *look* like て-forms. Losing them far outweighs
the 待った case, so the guard went in and 待った now returns the noun again.

The motivating cases are unaffected: Jisho returns no exact match for 飲んだ or
読んで, which is precisely why they were broken.

## How much residual risk is there?

The 決して bug raised a fair question: if a handful of searches found a wrong
substitution, how many more are out there in a language this size?

Measured against a 55-word corpus of real Japanese chosen to look like
conjugations — 決して, として, 全て, 初めて, かえって, したがって, 歌, 肩, 下,
舌, 旗, 蓋, 豚, 綿, 又, あなた, 明日, 北, 相手, 切手, 桁 and others, in both
kanji and kana — **0 produced a false substitution**, and all 8 genuine
conjugation controls still resolved correctly.

The reason is structural rather than lucky. A false positive now needs three
things at once: the typed string is not itself an Entry (which protects nearly
all real vocabulary, without us having to know it exists), Jisho doesn't
resolve it either, and our candidate happens to be a real but wrong word.
行った → 行う met all three, which is why it needed a hardcoded exception.

That said, the corpus was chosen from the same intuition that missed 決して in
the first place, so it is evidence the guards generalise, not proof the
residual class is empty. **The escape hatch below is the answer to the cases
neither we nor the corpus predicted** — rather than trying to enumerate a
living language, we made being wrong cheap.

## Escape hatch

The banner's original term is a button: "Search 飲んだ instead" re-runs the
search with `allowDeinflection: false`, returning exactly what was typed. Every
substitution is therefore both visible *and* undoable in one tap. This also
restores access to 待った's noun sense for anyone who wants it.

## Known limitations

- **Adjectives are out of scope.** よかった returns 良かったら, because the
  answer is the i-adjective 良い and nothing here deinflects adjectives.
- **A godan す verb whose stem ends in ま** (済ます → 済ました) is skipped, since
  ました is excluded to protect the far more common polite past.
- **Bare-kana かった** is skipped, so a kana-only 買った/勝った won't resolve.
  With kanji both work — 買った ends った, not かった.
- **〜ていた/〜ていて** produces one useless candidate (食べていた → 食べてく)
  and so costs one wasted request. Not worth a special case.

## Consequences

`searchWords` returns `{ results, resolvedFrom }` instead of a bare array —
the UI cannot render the disclosure without knowing a substitution occurred.
The pure table lives in `src/utils/deinflect.js` so it is unit-testable in the
node-env Vitest suite; only the orchestration touches the network, in
`src/api/words.js`.

A search that takes the fallback path costs **up to 4 requests** through the
Lambda proxy instead of 1, against an unofficial API with undocumented rate
limits. The guards above keep ordinary searches at exactly 1, so this is paid
only by conjugated input Jisho actually fails on. If Jisho ever starts
returning 429, `fetchEntries` treats it as a generic failure — that would be
the place to add backoff.
