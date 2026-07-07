// Shared helper: renders a string with its kanji characters as clickable
// buttons. Extracted to src/utils/clickableKanji.jsx so the word-lookup cards
// can reuse the exact same behaviour.
import { renderWithClickableKanji } from '../utils/clickableKanji';

// Presentational Component
//
// Shows the full detail for a single kanji: readings, meanings, stats, and its
// most common words (each kanji in them clickable for drill-down).
//
// Props:
//   selectedData     - enriched kanji entry (kanjiapi data + commonWords)
//   onClose          - close the card (the X button)
//   onOpenDeckPicker - (item, type) → open the "Add to Deck" picker
//   onKanjiClick     - (char) → drill into another kanji (from common words)
export default function DetailedInfoCard({ selectedData, onClose, onOpenDeckPicker, onKanjiClick }) {
  if (!selectedData) return null;

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
        <div className="d-flex justify-content-between align-items-center mb-3">
          <h2 className="display-1 fw-bold text-dark mb-3">{selectedData.kanji}</h2>

          <button
            className="btn btn-dark"
            onClick={() => onOpenDeckPicker?.(selectedData, 'kanji')}
          >
            Add to Deck
          </button>
        </div>

        <div className="mb-4">
          <div className="d-flex flex-wrap gap-4 mb-2">
            {selectedData.kun_readings && (
              <div className="fs-5">
                <strong className="text-body-secondary">Kun&apos;yomi:</strong>
                <span> {selectedData.kun_readings.join('、 ')}</span>
              </div>
            )}
            {selectedData.on_readings && (
              <div className="fs-5">
                <strong className="text-body-secondary">On&apos;yomi:</strong>
                <span> {selectedData.on_readings.join('、 ')}</span>
              </div>
            )}
          </div>

          {selectedData.meanings && (
            <div className="fs-5">
              <strong className="text-body-secondary">Meanings:</strong>{' '}
              {selectedData.meanings.join(', ')}
            </div>
          )}
        </div>

        <div className="d-flex flex-wrap gap-4 mb-4 text-muted small">
          {selectedData.stroke_count && <div><strong>Strokes:</strong> {selectedData.stroke_count}</div>}
          {selectedData.jlpt && <div><strong>JLPT:</strong> N{selectedData.jlpt}</div>}
          {selectedData.grade && <div><strong>Grade Level:</strong> {selectedData.grade}</div>}
          {selectedData.freq_mainichi_shinbun && (
            <div><strong>Frequency Rank: </strong> {selectedData.freq_mainichi_shinbun}</div>
          )}
        </div>

        {selectedData.notes && selectedData.notes.length > 0 && (
          <div className="mb-3"><strong>Notes:</strong> {selectedData.notes}</div>
        )}

        {selectedData.commonWords && selectedData.commonWords.length > 0 && (
          <div>
            <h5 className="fw-bold border-bottom pb-2 mb-3 text-secondary">
              Common Words
            </h5>

            <div className="ps-2">
              {/* commonWords arrive already normalised (see src/api/words.js),
                  so each entry has the same { word, reading, meanings } shape
                  the word lookup uses. */}
              {selectedData.commonWords.map((word) => (
                <div key={word.id} className="mb-2">
                  {/* Render the word with kanji chars as clickable buttons.
                      onKanjiClick may be undefined if this component is used
                      outside the kanji explorer; in normal use it's provided. */}
                  <strong className="text-info-emphasis fs-5">
                    {onKanjiClick
                      ? renderWithClickableKanji(word.word, selectedData.kanji, onKanjiClick)
                      : word.word}
                  </strong>
                  {word.reading && word.reading !== word.word && (
                    <span className="text-muted ms-1">({word.reading})</span>
                  )}
                  <span className="text-muted ms-2">— {word.meanings.join(', ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
