import { useState } from 'react';
import { fetchKanjiEntry, peekKanjiEntry } from '../api/kanji';
import { useLookup } from '../hooks/useLookup';
import DetailedInfoCard from './DetailedInfoCard';
import Modal from './Modal';

/**
 * Pleco-style kanji explorer.
 *
 * Opens on top of whatever the user was looking at (their word results) and
 * shows a single kanji's full info. Tapping a kanji inside it — e.g. in the
 * "Common Words" list — drills deeper by pushing onto a navigation stack, so
 * the user can wander from character to character and then Back out, or Close
 * to return exactly where they were.
 *
 * Props:
 *   initialKanji - the character to show first
 *   onClose      - close the whole overlay
 */
export default function KanjiInfoModal({ initialKanji, onClose }) {
  // The breadcrumb of kanji we've drilled through. The last item is current.
  const [stack, setStack] = useState([initialKanji]);
  const current = stack[stack.length - 1];

  // Fetch whenever the current kanji changes (initial open, drill, or back).
  // The lifecycle — cancelling a fetch the user drilled away from, the loading
  // and error states, the retry, and reading the cache so a Back doesn't
  // re-blink through "Loading 食…" — all lives in useLookup, shared with the
  // Token overlay and the Dictionary search. See src/hooks/useLookup.js.
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

  // Drill into another kanji (tapped inside the current card).
  const handleDrill = (char) => {
    if (char === current) return;
    setStack((prev) => [...prev, char]);
  };

  // Pop back to the previous kanji in the breadcrumb.
  const handleBack = () => {
    setStack((prev) => prev.slice(0, -1));
  };

  return (
    <Modal onClose={onClose} size="lg" scrollable>
      {/* Back appears only once we've drilled at least one level deep.
          The close (X) is the card's own when there IS a card; the loading,
          error and no-data states have no card, so the header carries one for
          them rather than leaving the overlay dismissable only by Escape. */}
      {(stack.length > 1 || !entry) && (
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
      )}

      <div className="modal-body pt-0">
        {isLoading && <p className="text-muted text-center py-4">Loading {current}…</p>}

        {/* A failed fetch is recoverable, and now says so. Failures aren't
            cached (src/api/lookupCache.js), so this really does re-request. */}
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
