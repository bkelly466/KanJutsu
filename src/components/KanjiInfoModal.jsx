import { useState, useEffect } from 'react';
import { fetchKanjiEntry } from '../api/kanji';
import DetailedInfoCard from './DetailedInfoCard';

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
 *   initialKanji      - the character to show first
 *   onClose           - close the whole overlay
 *   onOpenDeckPicker  - (item, type) → open the Add-to-Deck picker
 */
export default function KanjiInfoModal({ initialKanji, onClose, onOpenDeckPicker }) {
  // The breadcrumb of kanji we've drilled through. The last item is current.
  const [stack, setStack] = useState([initialKanji]);
  const current = stack[stack.length - 1];

  const [entry, setEntry] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  // Fetch whenever the current kanji changes (initial open, drill, or back).
  // The effect itself only kicks off the async fetch and updates state from the
  // promise callbacks — it never sets state synchronously. The "show loading"
  // reset happens in the event handlers below instead.
  useEffect(() => {
    let cancelled = false;

    fetchKanjiEntry(current)
      .then((data) => {
        if (cancelled) return;
        if (data) setEntry(data);
        else setError(`No kanji data found for ${current}.`);
      })
      .catch(() => {
        if (!cancelled) setError('Failed to load kanji info. Please try again.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    // If the user drills/closes before the fetch resolves, ignore the result.
    return () => {
      cancelled = true;
    };
  }, [current]);

  // Reset the view into a fresh loading state before navigating to a new kanji.
  const resetForNav = () => {
    setIsLoading(true);
    setError('');
    setEntry(null);
  };

  // Drill into another kanji (tapped inside the current card).
  const handleDrill = (char) => {
    if (char === current) return;
    resetForNav();
    setStack((prev) => [...prev, char]);
  };

  // Pop back to the previous kanji in the breadcrumb.
  const handleBack = () => {
    resetForNav();
    setStack((prev) => prev.slice(0, -1));
  };

  return (
    <div
      className="modal d-block"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-content">
          {/* Back appears only once we've drilled at least one level deep.
              The card below renders its own close (X) wired to onClose. */}
          {stack.length > 1 && (
            <div className="modal-header border-0 pb-0">
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={handleBack}
              >
                ← Back
              </button>
            </div>
          )}

          <div className="modal-body pt-0">
            {isLoading ? (
              <p className="text-muted text-center py-4">Loading {current}…</p>
            ) : error ? (
              <p className="text-danger text-center py-4">{error}</p>
            ) : (
              <DetailedInfoCard
                selectedData={entry}
                // The card's own close button (X) closes the whole overlay.
                setExpandedKanji={onClose}
                onOpenDeckPicker={onOpenDeckPicker}
                // Tapping a kanji inside drills deeper instead of leaving.
                onKanjiClick={handleDrill}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
