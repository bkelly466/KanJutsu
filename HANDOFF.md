# Handoff — KanJutsu

_Resume point between conversations. Update this when you finish a work session._

_Last updated: 2026-06-29_

## Current state
- `main` builds and runs; deployed to AWS Amplify.
- Dictionary is **word-first**: every search returns Jisho vocabulary results
  (the Kanji/Words toggle was removed).
- Tapping any kanji opens a **Pleco-style explorer overlay** (`KanjiInfoModal`)
  on top of the word results — readings, meanings, stroke count, JLPT, and the
  common words that character appears in. You can drill kanji→kanji with a Back
  button, then Close to return to your word list.
- Flashcards support **both kanji and word cards** in decks and study sessions
  (card model carries a `type`; backward-compatible with older kanji-only cards).
- Decks are still stored in **localStorage** (per-browser, per-device).

## Git / deploy
- Work on a feature branch, then merge to `main`. Pushing `main` auto-deploys via Amplify.
- Definition of done: `npm run lint` and `npm run build` both pass.
- Note: pushes to GitHub must be run locally (the assistant's sandbox can't reach GitHub).

## Known loose ends
- `src/components/MiniKanjiCard.jsx` and `src/hooks/useKanjiSearch.js` are now
  unused (leftovers from the old kanji-grid view). Prune when convenient.
- `CLAUDE.md` "Agents" section mentions "Vercel" for deploy-manager, but the
  project deploys on AWS Amplify — small wording fix for later.

## Next planned feature
**Make flashcards persistent online** (replace localStorage with the cloud).
Design already discussed; decisions still to make when we start:
1. Require login for everyone, or keep a guest/local mode too?
2. Store cards as a JSON blob inside each Deck record, or as a separate `Card`
   model with a Deck→Cards relationship (better fit for per-card SRS updates)?
3. Migrate existing localStorage decks on first login?
- Backend pieces already scaffolded in `amplify/`: `auth` (email login) and
  `data` (currently the starter Todo model — to be replaced with a `Deck` schema
  using owner-based authorization).

## Other backlog ideas
- Richer character data toward the Pleco feel: **radicals** and **example
  sentences** (both need new data sources wired up).
