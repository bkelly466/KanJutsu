# Comments

The standard for every comment in this repo. Adopted 2026-08-13, replacing an
earlier habit of writing comments that explained the code to a new learner.

**The rule: follow the `writing-comments` skill.** This file records only what
that skill leaves open — the choices specific to KanJutsu.

## The bar

A comment carries what was in the designer's mind and could not be put in the
code. Every declaration you add or change carries an interface comment, and
every comment survives the stranger test: *could someone who has never seen this
code write this comment from the code next to it?* If yes, it's an echo — cut it
or move it to a different altitude.

## What changed, and why

The comments here were written to teach. That made sense while the code was
being learned, but it produced 26% comment density and 40-line block comments in
which the one or two sentences a caller actually needs were buried.

**Explanation moved out of the source.** It now lives in the conversation, in
`docs/adr/`, and in `CONTEXT.md` — places you can read once, rather than lines
every future reader pays for on every visit.

This does **not** mean fewer comments. It means comments that carry what the
code can't say, at a length a reader can absorb. Deleting a hard-won reason is
the failure mode to avoid; relocating it is the fix.

## KanJutsu rules

### 1. Decisions live in an ADR; the source points at them

If a reason spans more than a couple of sentences, or spans more than one file,
it belongs in `docs/adr/` under a named heading. The source gets a one-liner:

```js
// Expressed as what gets absorbed, never as what starts a Token: IPADIC never
// tags a noun 自立. See ADR-0003, "Corrections the evidence forced".
```

A single copy stays true. Two copies drift — and several already had.

Check the ADR before writing a long comment. Much of what was inline was already
written there, word for word.

### 2. No history in the source

How the code got to be this way is `git log`, the PR, and `HANDOFF.md`. A
comment describes the code as it is now.

```js
// tokenLookup.js hand-rolled both maps first (issue #22); this module is that
// code lifted out so the kanji explorer gets it too (issue #37).   ← cut
```

**The exception is a reason that is invisible in the code and still live:** a
workaround, a library quirk, a bug that will come back if someone "simplifies"
the line. Reference the issue instead of retelling it — `// Fixes #436: Safari
fires this event twice.`

### 3. Interface comments lead with the caller's view

One or two sentences on the behaviour as callers perceive it, then only what a
caller must know: arguments, return value, constraints between them, side
effects, preconditions. Implementation detail — internal data structures, helper
names, caching strategy — goes in the body or an ADR, not the interface comment.

For a React component, that's what it renders and what its props mean. Which
context it reads and which sibling owns a piece of state is a caller concern
only when the caller has to do something about it.

### 4. Precision on declarations, intent inside functions

Down for precision on fields, params, and returns: units, bounds, what `null` or
empty means, what's always true of it. Nouns, not verbs — what it represents,
not how it gets set.

Up for intent inside a function body: what the block is trying to do, so a
reader can judge whether the code achieves it.

### 5. Style

JSDoc `/** */` for interface comments on exports; `//` inside bodies. Match the
surrounding file. Sentence case, no trailing period on single-line `//` fragments.

## Tests

A test file's comments explain **why this case is worth testing** when that
isn't obvious from the test name — a regression's cause, a boundary that looks
arbitrary, a fixture's provenance. The test name says what is asserted; the
comment doesn't repeat it.

`describe`/`it` strings are the documentation. If a comment restates the `it`
string, cut the comment and sharpen the string.

## When revising an existing comment

Read it against the code it now sits on. A stale comment is worse than none.
Update the comment in the same edit that changes the code beneath it.
