# KanJutsu

A Japanese study web app — inspired by what the Pleco dictionary does for Chinese learners.

**Live features:**

- **Dictionary (public, no login).** Word-first search that accepts English, kana, or kanji. Tap any kanji in a result to open a Pleco-style explorer overlay — readings, meanings, stroke count, JLPT level, and common words — and keep drilling from kanji to kanji without losing your place.
- **Verb forms.** Verbs show their dictionary and polite (ます) forms, computed rule-based from the verb class.
- **Cloud flashcards (login).** Build decks of kanji and word cards from dictionary results. Decks persist to your account and are studied with SM-2 spaced repetition — rate each card Again/Hard/Good/Easy and it schedules the next review.

## Tech

React 19 + Vite frontend, Bootstrap CSS. AWS Amplify Gen 2 backend: Cognito (auth), AppSync + DynamoDB (decks/cards, owner-scoped), and a Lambda proxy for the Jisho API (which doesn't allow browser CORS). Dictionary data from [kanjiapi.dev](https://kanjiapi.dev) and [Jisho](https://jisho.org). Vitest unit tests and GitHub Actions CI; deployed with Amplify Hosting.

## Development

```bash
nvm use 22          # Node 22 LTS required
npm install
npm run dev         # local dev server (Vite proxies the Jisho API)
npm run lint && npm test && npm run build   # definition of done
npx ampx sandbox    # personal cloud dev backend (writes amplify_outputs.json)
```

## Roadmap

- Example sentences and radicals for richer kanji entries
- More verb conjugations (past, negative, て-form)
- Phone/tablet-friendly layout with real-time deck sync across devices
- AI-generated example sentences using the words you just studied
