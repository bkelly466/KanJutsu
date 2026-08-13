# KanJutsu — Claude Code guide

A Japanese study web app: a public **dictionary** (kanji + vocab lookup) plus a
login-gated **flashcards** feature (spaced-repetition decks stored in the cloud).

## Project goal (this shapes every decision)

KanJutsu is three things at once:

1. **A real product** meant for actual users — reliability and polish beat
   feature count.
2. **A portfolio piece** — visible quality is part of the work: the README,
   UX states, and commit history all show.
3. **A learning vehicle** — the developer is building this to become a
   competent engineer, so explain as you go (rule 1 below).

Near-term focus: **stability & polish** and **research-grounded study
features**. When options conflict, prefer the one a real user would notice
and appreciate.

### Quality bar for user-facing changes

Any change a user can see ships with its loading, error, and empty states
handled, labels that match what buttons actually do, and styling consistent
with the existing Bootstrap patterns. Update `README.md` whenever a shipped
feature changes what the app does — it's portfolio-facing.

## Session start
Read `HANDOFF.md` first — it's the resume point (current state, what's next).
It's a local, gitignored file (not in the repo): edit it directly on `main`,
no branch or PR needed.

## Architecture map (read this before changing anything)

Two product surfaces, one React app (`src/App.jsx`).

**Shared state lives in two React Contexts, mounted in `src/main.jsx`**
(`NavigationProvider` → `DecksProvider` → `App`, all inside `Authenticator.Provider`).
Components read what they need instead of receiving it as props:
- `useNavigation()` — which tab, which Decks view, the selected deck id, and the
  Add-to-Deck picker target. Backed by `src/reducers/navigation.js`.
- `useDecksContext()` — the decks array plus all 12 members of `useDecks`.
- `useSelectedDeck()` (`src/hooks/`) joins the two: id from navigation, data from decks.

Keep genuinely local state local (form fields, the search box, a modal's own
busy/error flags). Context is for state that crosses component boundaries.

- **Dictionary (public, no login):** `Query.jsx` → `useWordSearch` → `src/api/words.js`
  (Jisho word search) → `WordList` / `WordDetailCard`. Tapping a kanji opens
  `KanjiInfoModal` → `src/api/kanji.js` (kanjiapi.dev enriched with Jisho) →
  `DetailedInfoCard`, with drill-down kanji→kanji. **All Jisho/kanji fetches go
  through the Lambda proxy** (`JISHO_PROXY` in `src/api/kanji.js`) — never call Jisho
  directly from a component (CORS). Verb forms come from `src/utils/conjugate.js`.
- **Flashcards (login-gated):** the "My Decks" tab renders the Amplify
  `Authenticator` (Cognito) when logged out. When logged in, `useDecks.js` talks to
  the Amplify data client — `Deck` and `Card` models (owner-scoped) on AppSync +
  DynamoDB. **`useDecks.js` is called exactly once, by `DecksProvider`**; components
  reach it via `useDecksContext()`, never by props. It
  **loads via `list()` and re-fetches after every mutation** (no live
  subscriptions yet — see HANDOFF backlog). Kanji and word cards share one shape;
  SRS scheduling is SM-2 in `src/utils/srs.js`; cards are built by `src/utils/card.js`.
- **Backend (`amplify/`, Amplify Gen 2 TypeScript):** `auth/` (email/Cognito),
  `data/` (`Deck`/`Card`, owner auth, `userPool` mode), `functions/jisho-proxy/`
  (Lambda + public Function URL). `backend.ts` wires them; `amplify.yml` deploys the
  backend **and** frontend on Amplify Hosting (a push to `main` triggers it).

### Shared vocabulary
`CONTEXT.md` (repo root) is the project glossary — Entry, Headword, Surface form,
Card, Deck, Due, and which synonyms to avoid. Read it before naming anything new;
the `_Avoid_` lists exist because the codebase drifted (`item` vs `entry` vs `word`).
Architectural decisions with their reasoning live in `docs/adr/`.

### Key directories
- `src/api/` — data-access layer (`words.js`, `kanji.js`). ALL external API calls live here.
- `src/context/` — React context plumbing only. Two files per context, and the split
  is required: Fast Refresh only hot-reloads a file that exports *components alone*
  (ESLint `react-refresh/only-export-components`), so the hook can't share a file
  with the provider. `<name>Context.js` = `createContext` + the `use<Name>()` hook;
  `<name>Provider.jsx` = the provider component.
- `src/reducers/` — pure reducers, one home for all of them: `navigation.js`
  (used by NavigationProvider) and `studySession.js` (local to StudySession).
  These are pure functions, so they're unit-testable in the existing node-env
  Vitest — put new multi-field state logic here rather than inside a component.
- `src/hooks/` — `useDecks.js` (cloud decks), `useWordSearch.js`, `useSelectedDeck.js`.
- `src/components/` — UI (Query, WordList, WordDetailCard, KanjiInfoModal, DeckList,
  DeckDetail, StudySession, CreateDeckModal, AddToDeckModal, DetailedInfoCard).
- `src/utils/` — `srs.js` (SM-2), `card.js` (card builders), `conjugate.js` (verb forms),
  `clickableKanji.jsx`.
- `amplify/` — backend definition (auth, data, jisho-proxy, sentence-analyzer).
- `scripts/` — one-off dev scripts, run by hand, never in CI. `record-corpus.mjs`
  regenerates `src/api/sentence.fixtures.js` from a deployed sandbox; those
  fixtures are recorded, never hand-written (ADR-0003).

## Commands
- `npm run dev` — local dev server
- `npm run build` — production build (must pass)
- `npm run lint` — ESLint (must pass)
- `npm test` — Vitest unit tests (must pass)
- `npx ampx sandbox` — deploy a personal dev backend + write `amplify_outputs.json`
- `npm run record-corpus` — re-record the sentence-analyzer test fixtures from
  the running sandbox (needed only when the analyzer's response shape changes)

## Non-negotiable rules
1. **Plan first, explain as you go.** Before a non-trivial change, state a short plan.
   Briefly explain any new pattern/tool — the developer is ~2 months into coding and
   values clarity over cleverness. **Explain in the conversation, not in the source.**
   Comments follow the `writing-comments` skill; see `docs/agents/comments.md`.
2. **Branch → PR → green CI → squash-merge to `main`. Never commit to `main` directly.**
   Pushing `main` auto-deploys via Amplify.
   **The assistant commits, pushes the feature branch, and opens the PR** — no
   need to ask each time. **The human does the final squash-merge to `main`**,
   because that is the step that deploys. Never push to `main`.
   **Exception: `HANDOFF.md` is a local, gitignored file** — edit it directly on
   `main` (no branch, no PR, no commit). It never reaches the repo, so it can't
   trigger a deploy.
3. **Definition of done = `npm run lint` + `npm test` + `npm run build` all pass.**
4. **Project gotchas (hard rules):**
   - `a.json()` / AWSJSON fields (`Deck.category`, `Card.back`) must be
     `JSON.stringify`-ed on write and `JSON.parse`-ed on read. The client does NOT
     auto-serialize them.
   - Keep all Jisho/kanjiapi calls in `src/api/*`, routed through the Lambda proxy.
     Never `fetch()` those APIs directly from a component.
   - Never commit secrets/`.env` or `amplify_outputs.json` (gitignored; generated).
   - Use **Node 22 LTS** (Node 25 breaks `ampx`).
   - Functional components + hooks only. No synchronous `setState` in a `useEffect`
     body (ESLint `react-hooks/set-state-in-effect`).
   - Match the existing file/folder structure before inventing new patterns.

## AWS dev workflow
- `npx ampx sandbox` runs a personal cloud backend and writes `amplify_outputs.json`.
  Keep it running while developing; Ctrl-C to stop; `npx ampx sandbox delete` to tear down.
- SSO session expires (~daily): on "Token is expired" run
  `aws sso login --sso-session Admin` and use `--profile Admin`, region `us-east-2`.
  **Do not use the `default` profile** — it points at a permission set that is no
  longer assigned, so `aws sso login` appears to succeed and then every call fails
  with `GetRoleCredentials: No access`. This AWS/dev login is **separate** from
  the in-app Cognito user login.
- **This account's Lambda concurrency limit is 10, not the default 1000**, shared
  by every function. So `reservedConcurrentExecutions` cannot be set on anything
  (AWS refuses any reservation leaving under 10 unreserved, and the attempt rolls
  the stack back). Raising the service quota is on the backlog.

## Tech stack
React 19, Vite 8, AWS Amplify Gen 2 (Cognito, AppSync, DynamoDB, Lambda), Bootstrap CSS,
Vitest, ESLint, GitHub Actions CI, Amplify Hosting. External data: kanjiapi.dev and Jisho
(via the Lambda proxy).

## Agents (`.claude/agents/`)
- `feature-builder` — new features, components, study modes.
- `bug-fixer` — diagnose and fix broken/unexpected behavior.
- `code-reviewer` — pre-merge review (correctness, security, conventions).
- `test-writer` — Vitest unit tests for pure logic and utilities.
- `amplify-backend` — data schema, auth, AppSync/DynamoDB, backend sandbox/deploy.
- `deploy-manager` — git/PR flow + Amplify deploy checks.
- `content-strategist` — study mechanics grounded in language-acquisition research.

### When to use them (rule)
Launch an agent at these points without waiting to be asked:

- **Before opening any PR** — `code-reviewer` on the diff. Non-negotiable: a fresh
  reader catches what the author has gone blind to.
- **New pure logic in `src/utils/` or `src/api/`** — `test-writer`. There is no
  jsdom/RTL in this project, so pure logic is the only thing that *can* be tested;
  don't let it ship untested.
- **"Where/how does X work?" spanning several files** — `Explore`, rather than
  opening files one at a time.
- **Any study-mechanic decision** (intervals, quiz formats, scheduling, progress)
  — `content-strategist` **before** writing code, per the domain note below.
- **Schema, auth, or AppSync/DynamoDB changes** — `amplify-backend`.

Skip agents when the full context needed is already in the conversation. Each
agent starts cold — no history, no files already read — so for a small edit or a
follow-up question it re-derives what's already known, which is slower and more
error-prone than doing it directly. Prefer one well-briefed agent over several.

## Domain note
KanJutsu is a language-learning product, not just a coding exercise. Study features
(scheduling, quiz formats, progress) should be grounded in language-acquisition research
(spaced repetition, retrieval practice, interleaving) and informed by how Anki / WaniKani
/ Bunpro handle the same problems. Use the `content-strategist` agent.

## Agent skills
Repo config that installed skills (`/to-tickets`, `/triage`, `/to-spec`,
`/wayfinder`, …) read before acting. Distinct from the subagents above.

### Issue tracker

Issues live in GitHub Issues on `bkelly466/KanJutsu`, managed with the `gh` CLI.
See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles, using the default label strings.
See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` + `docs/adr/` at the repo root.
See `docs/agents/domain.md`.

### Comments

Follow the `writing-comments` skill. Reasoning longer than a couple of sentences
goes in `docs/adr/` and the source points at it; history stays in `git log` and
`HANDOFF.md`. See `docs/agents/comments.md`.
