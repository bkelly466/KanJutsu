# Handoff — KanJutsu

_Resume point between conversations. Update this when you finish a work session._

_Last updated: 2026-07-01_

## ⚠️ Active branch: `feat/cloud-flashcards`
The cloud-persistence work is on this branch and is NOT merged to `main`.
Production (`main`) is unchanged: flashcards there are still localStorage.

## Current state — cloud flashcards WORKING (in sandbox)
Tested end-to-end against a personal `ampx sandbox`: sign-up/login, create deck,
add kanji + word cards, study/rate, and persistence across reloads all work.
Remaining before production: final polish + the deliberate cutover (below).

Recent fixes on this branch:
- `a.json()` (AWSJSON) fields (`Deck.category`, `Card.back`) must be
  `JSON.stringify`-ed on write and `JSON.parse`-ed on read — done. This was the
  cause of the old "Create Deck does nothing" bug (`Variable 'category' has an
  invalid value`).
- `useDecks` now loads via `list()` and **re-fetches after every mutation**, so a
  new deck appears immediately (no page refresh). Replaced the earlier
  `observeQuery` approach, which wasn't reliably pushing updates.
- Mutations catch errors and surface a dismissible banner (expired sessions point
  the user to sign out / sign in again).

## Top priorities next session
1. Decide + do the **production cutover** for cloud flashcards (see below).
2. Merge **`feat/verb-forms`** (open PR → CI green → merge).

## Branches not yet on `main`
- **`feat/cloud-flashcards`** — online flashcards (backend + frontend). Working
  in sandbox; needs cutover.
  - Phase 1 (`amplify/data/resource.ts`): `Deck` + `Card` models, Deck→Cards
    relationship, owner auth, `userPool` mode.
  - Phase 2 (frontend): Amplify configured in `main.jsx`; Decks tab requires
    login (dictionary stays public); `useDecks` rewritten to the cloud client.
- **`feat/verb-forms`** (`936f84c`) — verbs show dictionary + polite (ます) forms
  on the detail card and flashcard back. Built, spot-checked, unit-tested. Needs
  a PR → merge.

## Decisions locked for cloud flashcards
- Dictionary is public; the flashcard feature requires login.
- Separate `Card` model with a Deck→Cards relationship (done).
- Do NOT migrate existing localStorage decks on first login.

## How to develop the backend (AWS)
- Local AWS profile is SSO, profile name `default`, region **us-east-2**.
- Run `npx ampx sandbox` and keep it running — it deploys the backend and writes
  `amplify_outputs.json` (gitignored). Stop with Ctrl-C.
- SSO session expires (~daily): if you see "Token is expired", run `aws sso login`.
  (This is your AWS/dev login — separate from the in-app Cognito user login.)
- Tear down the sandbox's cloud resources when done: `npx ampx sandbox delete`.
- **Use Node 22 LTS** (`nvm use 22`). Node 25 breaks `ampx` (a localStorage error).
- Billing: account is on the AWS paid plan. Check the Billing console for
  remaining credits and consider a $1–5 budget alert. Stopping the sandbox avoids
  lingering charges.

## Production cutover (do deliberately)
Merging `feat/cloud-flashcards` to `main` will: deploy the Deck/Card backend to
the live Amplify app, put the login gate on the live Decks tab, and switch real
users to cloud storage (their localStorage decks will NOT carry over). Do this
only when you're ready for the live app to require login for flashcards.

## Git / deploy
- Feature branch → PR → let CI (lint/test/build) go green → merge to `main`.
  Pushing `main` auto-deploys via Amplify. Pushes must be run locally.
- After committing the vitest `package-lock.json`, the CI step can switch from
  `npm install` to `npm ci`.

## Backlog / loose ends
- **Real-time sync (revisit for phones/tablets):** we intentionally traded live
  cross-device updates for reliable single-device refresh (list + refetch in
  `useDecks`). **When we make the app phone/tablet-friendly, switch decks back to
  real-time** (Amplify `observeQuery` subscriptions) so a deck created on one
  device shows on another without a reload.
- `list()` returns up to 100 items by default. Add pagination if a user ever
  exceeds ~100 decks or cards.
- Harden owner auth: the sandbox warned the `owner` field on Deck/Card is
  reassignable. Fine for now; lock down later if desired.
- Cosmetic: ある shows its kanji form (有る) because we display Jisho's first
  headword; consider preferring kana when "usually written using kana alone".
- Richer character data toward the Pleco feel: **radicals** and **example
  sentences** (need new data sources).
- Verb forms currently cover the polite present only; past/negative/て-form could
  follow (extend `conjugate.js` + its tests).
