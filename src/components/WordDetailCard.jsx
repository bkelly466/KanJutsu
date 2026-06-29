// Presentational Component
//
// Shows the full detail for a single word: the word (with each kanji clickable
// for cross-navigation into Kanji mode), its reading, common/JLPT badges, and
// every sense with its parts of speech.

import { renderWithClickableKanji } from '../utils/clickableKanji';

// onKanjiClick: function(char) — called when a kanji in the word is clicked.
//   Passed down from Query, which switches to Kanji mode and runs the lookup.
export default function WordDetailCard({ wordData, onClose, onKanjiClick }) {
  if (!wordData) return null;

  return (
    <div className="card shadow-sm border-light mb-3 w-100">
      <div className="card-header bg-white border-0 text-end pb-0 pt-3">
        <button
          type="button"
          className="btn-close"
          aria-label="Close"
          onClick={onClose}
        ></button>
      </div>

      <div className="card-body p-4 pt-0">
        {/* Headword. Each kanji is a button that cross-navigates to Kanji mode.
            currentKanji is null here: in word mode no single kanji is "current". */}
        <h2 className="display-4 fw-bold text-dark mb-1">
          {onKanjiClick
            ? renderWithClickableKanji(wordData.word, null, onKanjiClick)
            : wordData.word}
        </h2>

        {wordData.reading && wordData.reading !== wordData.word && (
          <div className="fs-5 text-muted mb-2">{wordData.reading}</div>
        )}

        <div className="d-flex flex-wrap gap-2 mb-4">
          {wordData.isCommon && (
            <span className="badge bg-success">common word</span>
          )}
          {wordData.jlpt.map((level) => (
            <span key={level} className="badge bg-secondary">
              JLPT {level}
            </span>
          ))}
        </div>

        {/* Senses: Jisho groups definitions into senses, each with its own
            parts of speech (e.g. "Ichidan verb, transitive verb"). */}
        <ol className="ps-3 mb-0">
          {wordData.senses.map((sense, index) => (
            <li key={index} className="mb-3">
              {sense.partsOfSpeech.length > 0 && (
                <div className="text-body-secondary fst-italic small mb-1">
                  {sense.partsOfSpeech.join(', ')}
                </div>
              )}
              <div className="fs-5">{sense.definitions.join('; ')}</div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
