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
    // Only wrap actual kanji chars — kana and punctuation stay as plain text
    if (kanjiSet.has(char)) {
      const isCurrent = char === currentKanji;

      return (
        <button
          key={index}
          className="kanji-link"
          // aria-label tells screen readers what the button does
          aria-label={isCurrent ? `${char} (currently viewing)` : `Look up ${char}`}
          // If this is the same kanji already on screen, clicking does nothing.
          // This prevents a confusing reload of the same card.
          onClick={isCurrent ? undefined : () => onKanjiClick(char)}
          // `disabled` removes this button from the tab order and blocks clicks.
          // That's intended: there's no useful action on the kanji you're already
          // viewing. (The aria-label is still read on mouse hover / focus mode.)
          disabled={isCurrent}
          // Visual hint that this is the current kanji (slightly faded)
          style={isCurrent ? { opacity: 0.45, cursor: 'default' } : undefined}
        >
          {char}
        </button>
      );
    }

    // Plain text character — just return the string; React will render it inline
    return char;
  });
}
