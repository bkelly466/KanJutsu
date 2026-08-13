import { renderWithClickableKanji } from '../utils/clickableKanji';
import { useNavigation } from '../context/navigationContext';

// Full detail for a single kanji: readings, meanings, stats, and its most
// common words, whose kanji are clickable for drill-down.
//
// Props:
//   selectedData - enriched kanji entry (kanjiapi data + commonWords)
//   onClose      - close the card
//   onKanjiClick - called with one kanji character, to drill into it
export default function DetailedInfoCard({ selectedData, onClose, onKanjiClick }) {
  // From context rather than a prop: Query and KanjiInfoModal were only
  // forwarding it.
  const { openDeckPicker } = useNavigation();

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
        {/* flex-wrap so the (very large) kanji and the Add to Deck button
            stack rather than collide on a narrow screen. */}
        <div className="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-3">
          {/* clamp() replaces Bootstrap's fixed `display-1` (~6rem), which is
              nearly half the width of a 375px phone. */}
          <h2
            className="fw-bold text-dark mb-3"
            style={{ fontSize: 'clamp(3.5rem, 16vw, 6rem)', lineHeight: 1.1 }}
          >
            {selectedData.kanji}
          </h2>

          <button
            className="btn btn-dark"
            onClick={() => openDeckPicker(selectedData, 'kanji')}
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

        {/* A different service from the kanji data above, so it fails on its
            own — and rendering nothing is what a kanji with genuinely no common
            words looks like. */}
        {selectedData.commonWordsUnavailable && (
          <p className="text-muted small mb-0">
            Common words couldn’t be loaded. Close and re-open to try again.
          </p>
        )}

        {selectedData.commonWords && selectedData.commonWords.length > 0 && (
          <div>
            <h5 className="fw-bold border-bottom pb-2 mb-3 text-secondary">
              Common Words
            </h5>

            <div className="ps-2">
              {/* Already normalised by src/api/words.js, so each entry has the
                  same shape the word lookup returns. */}
              {selectedData.commonWords.map((word) => (
                <div key={word.id} className="mb-2">
                  {/* onKanjiClick is absent outside the kanji explorer. */}
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
