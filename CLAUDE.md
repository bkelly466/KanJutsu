# Kanjutsu

A Japanese study tool. Started as a Kanji dictionary lookup (kanjiapi.dev + Jisho API), now also has a flashcard study mode.

## Session start (read first)
Before doing any work, read `HANDOFF.md` in the project root — it captures where we
left off, the current state of `main`, and the next planned feature. This file is
the resume point between conversations; keep it updated when finishing a work session.

## Stack
- Frontend: React (no framework like Next.js — plain React app)
- Backend: AWS Amplify Gen 2 — TypeScript backend defined in `amplify/` (data + auth)
- Version control: GitHub
- Deployment: AWS Amplify (Amplify Hosting auto-deploys on push to the connected branch)
- External APIs: kanjiapi.dev (kanji data), Jisho API (word/vocab lookup)

## Conventions
- Use functional React components with hooks. No class components.
- Keep API calls to kanjiapi/Jisho in dedicated service files under `src/api/` — never call fetch() to these directly from components.
- Match existing file/folder structure before creating new patterns.
- Prefer TypeScript types over `any`. If the existing code is JS, don't silently convert files to TS unless asked.
- Run `npm run lint` and `npm run build` before considering a task done.

## Commands
- `npm run dev` — local dev server
- `npm run build` — production build (must pass before deploy)
- `npm run lint` — lint check
- `npm test` — test suite (if/when one exists)

## Workflow notes
- This is a learning project worked on solo, and I (the dev) am about two months into coding — favor clear, well-commented code over clever abstractions, and briefly explain new patterns/tools when they're introduced.
- When adding a feature, check whether it should reuse the flashcard or dictionary lookup logic before writing new logic.
- Kanjutsu is a language-learning product, not just a coding exercise. Study-related features (scheduling, review intervals, quiz formats, progress tracking) should be grounded in language-acquisition research (spaced repetition, retrieval practice, comprehensible input, interleaving) and informed by how comparable apps (Anki, WaniKani, Duolingo, Bunpro, Renshuu) handle the same problem — what to borrow, what to avoid.
- Never commit API keys or .env values.

## Agents
Agent definitions live in `.claude/agents/` and are the default way work gets delegated:
- `feature-builder` — new features, pages, components, study modes
- `bug-fixer` — broken/unexpected behavior
- `code-reviewer` — pre-merge review (read-only, no edits)
- `deploy-manager` — git commit/push + Vercel deploy checks
- `content-strategist` — researches and proposes designs for study mechanics (scheduling, quiz formats, progress tracking) before code is written; hand off to feature-builder once a design is chosen
