# KanJutsu

A Japanese study web app — inspired by what the Pleco dictionary does for Chinese learners.

**Live features:**

- **Dictionary (public, no login).** Word-first search that accepts English, kana, or kanji. Tap any kanji in a result to open a Pleco-style explorer overlay — readings, meanings, stroke count, JLPT level, and common words — and keep drilling from kanji to kanji without losing your place.
- **Past- and te-form verbs find their dictionary entry.** Search 飲んだ, 見て or のんだ and you get 飲む / 見る, with a note naming the dictionary form — so a verb met in the wild leads back to the form worth memorising. The substitution is never silent, and one tap searches your original text instead.
- **Sentence breakdown (public, no login).** Paste Japanese and see it split into words — Japanese has no spaces, so the app finds the boundaries for you. 行きました comes back as one word showing its dictionary form 行く, while を and に stand on their own. Tap any word for its dictionary entry without losing the sentence behind it, and tap the kanji inside that to keep drilling. Measured in August 2026 against a 32-sentence corpus, 97.3% of tappable words reach their dictionary entry, and every verb and adjective in the corpus does — deinflection being the hard part.
- **Verb forms.** Verbs show their dictionary and polite (ます) forms, computed rule-based from the verb class.
- **Cloud flashcards (login).** Build decks of kanji and word cards from dictionary results. Decks persist to your account and are studied with SM-2 spaced repetition — rate each card Again/Hard/Good/Easy and it schedules the next review.
- **Per-card control.** Open any card in a deck to reword its definition in your own words (the dictionary original is kept, so you can revert), see its full review history — added, last reviewed, next due, interval, ease factor — reset its scheduling, or add it to another deck.
- **Works on phones and tablets.** Fluid layout down to 360px, touch targets sized to the 44px guideline, modals that go full-screen on phones and lock the page behind them, and a device Back button that closes the current overlay instead of leaving the app.

## Tech

React 19 + Vite frontend, Bootstrap CSS. AWS Amplify Gen 2 backend: Cognito (auth), AppSync + DynamoDB (decks/cards, owner-scoped), a Lambda proxy for the Jisho API (which doesn't allow browser CORS), and a second Lambda running [Lindera](https://github.com/lindera/lindera-wasm) with the IPADIC dictionary for Japanese word segmentation — 12.5 MB of WebAssembly that has no business in a browser. Dictionary data from [kanjiapi.dev](https://kanjiapi.dev) and [Jisho](https://jisho.org). Vitest unit tests and GitHub Actions CI; deployed with Amplify Hosting.

## Development

```bash
nvm use 22          # Node 22 LTS required
npm install
npm run dev         # local dev server (Vite proxies the Jisho API)
npm run lint && npm test && npm run build   # definition of done
npx ampx sandbox    # personal cloud dev backend (writes amplify_outputs.json)
```

## Roadmap

- Adding a word straight from a sentence breakdown to a deck
- Radicals for richer kanji entries
- More verb conjugations (past, negative, て-form)
- Installable as a PWA (home-screen icon, offline study), plus real-time deck sync across devices
- AI-generated example sentences using the words you just studied
