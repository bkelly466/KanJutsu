// Shared helper for rendering a Japanese string with its kanji characters as
// clickable buttons. Used by both the kanji DetailedInfoCard (common-words list)
// and the word-lookup cards, so the logic lives in one place.
//
// This file is .jsx (not .js) because it returns JSX elements.

import { extractKanji } from '../api/kanji';

/**
 * Splits `text` into an array of React nodes:
 *   - Each kanji character → a <button> with the .kanji-link style
 *   - Everything else (kana, punctuation) → a plain text string
 *
 * Why character-by-character? React can't inject JSX into a plain string, so
 * we convert the string into an array of nodes we can map over. This is a
 * common React pattern sometimes called "inline tokenisation".
 *
 * @param {string} text          - The word string to render (e.g. "食べ物")
 * @param {string} currentKanji  - The kanji currently being viewed, if any.
 *                                 Clicking this same char is a no-op (it's the
 *                                 entry already on screen). Pass null/'' when
 *                                 there is no "current" kanji (e.g. word cards).
 * @param {function} onKanjiClick - Called with a single kanji char on click.
 */
export function renderWithClickableKanji(text, currentKanji, onKanjiClick) {
  // Guard: if the word is missing/empty, render nothing rather than letting
  // [...undefined] throw and crash the whole card.
  if (!text) return null;

  // Build a Set of the kanji chars present in this specific word for O(1) lookup
  const kanjiSet = new Set(extractKanji(text));

  // Split into individual characters and map each to a node.
  // key=index is safe here: extractKanji is deterministic, so which positions
  // are kanji vs. kana never changes between renders for a given word — no key
  // collisions or element-type flips.
  return [...text].map((char, index) => {
    // Wrap a kanji as a clickable link UNLESS it's the one already being viewed.
    // The current kanji renders as plain text (no link, no fade) — there's no
    // useful action in looking up the kanji you're already on, and graying it
    // out hurt readability.
    if (kanjiSet.has(char) && char !== currentKanji) {
      return (
        <button
          key={index}
          className="kanji-link"
          aria-label={`Look up ${char}`}
          onClick={() => onKanjiClick(char)}
        >
          {char}
        </button>
      );
    }

    // Kana, punctuation, or the currently-viewed kanji → plain inline text.
    return char;
  });
}
