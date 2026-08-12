// Presentational Component
//
// Shows the full detail for a single word: the word (with each kanji clickable
// for cross-navigation into Kanji mode), its reading, common/JLPT badges, and
// every sense with its parts of speech.

import { renderWithClickableKanji } from '../utils/clickableKanji';
import { useNavigation } from '../context/navigationContext';
import EntryBody from './EntryBody';

// onKanjiClick: function(char) — called when a kanji in the word is clicked.
//   Passed down from Query, which switches to Kanji mode and runs the lookup.
export default function WordDetailCard({ wordData, onClose, onKanjiClick }) {
  // "Add to Deck" comes from navigation context rather than a prop: Query has no
  // use for it and was only forwarding it.
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
        {/* flex-wrap + gap: on a phone the headword takes the full width and
            "Add to Deck" drops below it instead of colliding with it. */}
        <div className="d-flex flex-wrap justify-content-between align-items-start gap-2 mb-1">
          {/* Headword. Each kanji is a button that cross-navigates to Kanji mode.
              currentKanji is null here: in word mode no single kanji is "current".
              Sized with clamp() rather than Bootstrap's fixed `display-4`. */}
          <h2
            className="fw-bold text-dark mb-0"
            // This card IS the detail view, so the headword is never truncated;
            // overflowWrap only engages when a long word can't fit at all.
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

          {/* Always rendered now: the handler comes from context, so there is
              no longer a case where it wasn't passed in. Signed-out users still
              get the button — it sends them to the Decks tab to log in. */}
          <button
            // touch-target brings this to the 44px floor the rest of the app
            // uses; a bare Bootstrap button is about 36px tall.
            className="btn btn-dark touch-target flex-shrink-0 ms-2"
            onClick={() => openDeckPicker(wordData, 'word')}
          >
            Add to Deck
          </button>
        </div>

        {/* Reading, badges, verb forms and senses — shared with the Sentence
            tab's Token overlay so the two read as one product. */}
        <EntryBody entry={wordData} />
      </div>
    </div>
  );
}
