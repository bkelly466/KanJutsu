import { useState } from 'react';
import { fetchKanjiEntry, peekKanjiEntry } from '../api/kanji';
import { useLookup } from '../hooks/useLookup';
import DetailedInfoCard from './DetailedInfoCard';
import Modal from './Modal';

/**
 * Pleco-style kanji explorer: one kanji's full info, opened over whatever the
 * user was looking at. Tapping a kanji inside pushes onto a drill stack, so
 * they can wander character to character and Back out, or Close to return
 * exactly where they were.
 *
 * Props:
 *   initialKanji - the character to show first
 *   onClose      - close the whole overlay
 */
export default function KanjiInfoModal({ initialKanji, onClose }) {
  // The drill stack, last item current.
  const [stack, setStack] = useState([initialKanji]);
  const current = stack[stack.length - 1];

  // Re-fetches on open, drill and Back. The peek is what makes Back instant
  // rather than re-blinking through "Loading 食…".
  const {
    data: entry,
    isLoading,
    error,
    retry,
  } = useLookup(
    current,
    () => fetchKanjiEntry(current),
    () => peekKanjiEntry(current)
  );

  const handleDrill = (char) => {
    if (char === current) return;
    setStack((prev) => [...prev, char]);
  };

  const handleBack = () => {
    setStack((prev) => prev.slice(0, -1));
  };

  return (
    <Modal onClose={onClose} size="lg" scrollable>
      {/* Always rendered, contents varying, so the body below doesn't jump as
          a lookup resolves — an uncached open would otherwise drop this whole
          header the moment the card arrived, which on a phone reads as a
          flicker.

          Back appears only once we've drilled at least one level deep. The
          close (X) is the card's own when there IS a card; the loading, error
          and no-data states have no card, so the header carries one for them
          rather than leaving the overlay dismissable only by Escape. */}
      <div className="modal-header border-0 pb-0">
        {stack.length > 1 && (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary touch-target"
            onClick={handleBack}
          >
            ← Back
          </button>
        )}
        {!entry && (
          <button
            type="button"
            className="btn-close ms-auto"
            aria-label="Close"
            onClick={onClose}
          ></button>
        )}
      </div>

      <div className="modal-body pt-0">
        {isLoading && <p className="text-muted text-center py-4">Loading {current}…</p>}

        {/* A failed fetch is recoverable, and now says so. Failures aren't
            cached (src/api/lookupCache.js), so this really does re-request.
            The copy from kanji.js deliberately doesn't end in "please try
            again" — the button says that. */}
        {!isLoading && error && (
          <div className="text-center py-4">
            <p className="text-danger" role="alert">
              {error}
            </p>
            <button type="button" className="btn btn-outline-secondary" onClick={retry}>
              Try again
            </button>
          </div>
        )}

        {/* kanjiapi doesn't carry this character — a settled answer, not a
            failure, so it reads like the Token overlay's "no entry" state
            rather than an error the user could do something about. */}
        {!isLoading && !error && !entry && (
          <p className="text-muted text-center py-4">No kanji data found for {current}.</p>
        )}

        {!isLoading && !error && entry && (
          <DetailedInfoCard
            selectedData={entry}
            // The card's own close button (X) closes the whole overlay.
            onClose={onClose}
            // Tapping a kanji inside drills deeper instead of leaving.
            onKanjiClick={handleDrill}
          />
        )}
      </div>
    </Modal>
  );
}
