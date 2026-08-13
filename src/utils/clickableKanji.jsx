// Rendering a Japanese string with its kanji as clickable buttons. Shared by
// DetailedInfoCard's common-words list and the word-lookup cards.

import { extractKanji } from '../api/kanji';

/**
 * Split `text` into React nodes: each kanji becomes a `.kanji-link` button,
 * everything else stays a plain string. Returns null for empty input.
 *
 * @param {string} text           - the word to render, e.g. "食べ物"
 * @param {string} currentKanji   - the kanji already on screen, rendered as
 *                                  plain text since looking it up is a no-op.
 *                                  null or '' where there is no current kanji.
 * @param {function} onKanjiClick - called with a single kanji character
 */
export function renderWithClickableKanji(text, currentKanji, onKanjiClick) {
  if (!text) return null;

  const kanjiSet = new Set(extractKanji(text));

  // key=index is safe: extractKanji is deterministic, so for a given word the
  // kanji and kana positions never change between renders.
  return [...text].map((char, index) => {
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

    return char;
  });
}
