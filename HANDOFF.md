# Handoff — KanJutsu

_Resume point between conversations. Update this when you finish a work session._

_Last updated: 2026-07-07_

## Current state — polish pass merged, main is clean
Everything is merged to `main` and pushed; local merged branches are cleaned up.
On top of the cloud-flashcards cutover (see below), `main` now also includes:
- **PR #5** — deck delete no longer removes the deck if any card delete in the
  batch fails (prevents orphaned, invisible cards).
- **PR #6** — "Hard" rating maps to SM-2 quality 3 (a pass): keeps the streak
  and grows the interval by a fixed 1.2x, matching Anki's convention.
- **PR #7** — deep-module refactor pass (Ousterhout review), 5 commits:
  `getDefaultSRSState()` + `daysUntilDue()` centralise SRS state/date math in
  `srs.js`; `throwIfErrors()` in `useDecks` owns the Amplify error shape;
  `commonWords` are normalised at the API boundary (`normalizeWord`), with
  `JISHO_PROXY` moved to `src/api/jishoProxy.js`; a pass-through handler
  dropped from `App.jsx`. No user-facing changes intended (one nicety:
  kana-only common words in the kanji overlay now show readings per the
  app-wide rule). Tests grew to 55.

Established base (from the cloud cutover):
- **Word-first dictionary** with the Pleco-style kanji explorer overlay
  (`KanjiInfoModal`): readings, meanings, stroke count, JLPT, common words,
  drill-down kanji→kanji.
- **Verb forms**: verbs show dictionary + polite (ます) forms on the detail card
  and flashcard back (`conjugate.js`, unit-tested).
- **Cloud flashcards**: decks/cards persist in AWS (Amplify `Deck`/`Card`
  models, owner-scoped). The Decks tab **requires login**; the dictionary stays
  public. `useDecks` uses the Amplify data client (list + refetch after each
  mutation) with error surfacing.
- CI (lint/test/build), and `.claude/` + `CLAUDE.md` are gitignored.

## Verify next session (if not already confirmed)
- Merging PR #7 (2026-07-07) triggered an Amplify production deploy — check the
  console shows it **succeeded**, then quick smoke test: search a word, open the
  kanji overlay, confirm Common Words render with readings + clickable kanji;
  study a deck and rate a card "Hard" → interval grows, streak kept.

## How to develop the backend (AWS)
- Local AWS profile is SSO, profile name `default`, region **us-east-2**.
- `npx ampx sandbox` deploys a personal dev backend and writes
  `amplify_outputs.json` (gitignored). Keep it running; Ctrl-C to stop.
- SSO session expires (~daily): if you see "Token is expired", run `aws sso login`.
  (That's your AWS/dev login — separate from the in-app Cognito user login.)
- `npx ampx sandbox delete` tears down the sandbox's cloud resources.
- **Use Node 22 LTS** (`nvm use 22`). Node 25 breaks `ampx`.
- Billing: on the AWS paid plan. Check the Billing console for remaining credits;
  consider a $1–5 budget alert. Stopping the sandbox avoids lingering charges.

## Git / deploy workflow
- Feature branch → PR → CI green → **Squash and merge** to `main`. Pushing `main`
  auto-deploys via Amplify. Pushes are run locally.
- Vercel was disconnected (it was a stale integration failing on the gitignored
  `amplify_outputs.json`). Amplify is the only deploy target.
- Lesson learned: avoid running terminal git and having the assistant run git at
  the same time — it caused divergent-branch churn. Pick one driver per moment.

## Backlog / next ideas
- **Real-time sync (revisit for phones/tablets):** decks currently use list +
  refetch (reliable single-device, no live cross-device updates). **When making
  the app phone/tablet-friendly, switch decks back to real-time** (Amplify
  `observeQuery`) so a deck made on one device appears on another without reload.
- `list()` returns up to 100 items by default — add pagination if a user exceeds
  ~100 decks or cards.
- Harden owner auth: the `owner` field on Deck/Card is reassignable (sandbox
  warning). Fine for now; lock down later if desired.
- Cosmetic: ある shows its kanji form (有る) because we display Jisho's first
  headword; consider preferring kana when "usually written using kana alone".
- Richer character data toward the Pleco feel: **radicals** and **example
  sentences** (need new data sources).
- Verb forms cover the polite present only; past/negative/て-form could follow
  (extend `conjugate.js` + its tests).
- ~~Study-mechanic question for content-strategist~~ — resolved: "Hard" now
  maps to SM-2 quality 3 (a pass) and grows the interval by a fixed 1.2x
  instead of the full ease-factor multiplier, matching Anki's convention.
  See `src/utils/srs.js` (`HARD_QUALITY`, `HARD_INTERVAL_MULTIPLIER`).
