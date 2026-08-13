// Full detail for a single word: the headword with each kanji clickable, its
// reading, common/JLPT badges, and every sense with its parts of speech.

import { renderWithClickableKanji } from '../utils/clickableKanji';
import { useNavigation } from '../context/navigationContext';
import EntryBody from './EntryBody';

// onKanjiClick is called with one kanji character; Query opens the explorer.
export default function WordDetailCard({ wordData, onClose, onKanjiClick }) {
  // From context rather than a prop: Query was only forwarding it.
  const { openDeckPicker } = useNavigation();

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
        {/* flex-wrap: on a phone the headword takes the full width and "Add to
            Deck" drops below rather than colliding with it. */}
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-1">
          {/* currentKanji is null: in word mode no single kanji is "current". */}
          <h2
            className="fw-bold text-dark mb-0"
            // This card IS the detail view, so the headword is never truncated;
            // overflowWrap engages only when a long word can't fit at all.
            style={{
              fontSize: 'clamp(2rem, 8vw, 3.5rem)',
              wordBreak: 'keep-all',
              overflowWrap: 'anywhere',
            }}
          >
            {onKanjiClick
              ? renderWithClickableKanji(wordData.word, null, onKanjiClick)
              : wordData.word}
          </h2>

          {/* Shown to signed-out users too — it sends them to the Decks tab to
              log in. */}
          <button
            // A bare Bootstrap button is about 36px tall; touch-target brings
            // it to the 44px floor used across the app.
            className="btn btn-dark touch-target flex-shrink-0 ms-2"
            onClick={() => openDeckPicker(wordData, 'word')}
          >
            Add to Deck
          </button>
        </div>

        {/* Shared with the Sentence tab's Token overlay. */}
        <EntryBody entry={wordData} />
      </div>
    </div>
  );
}
