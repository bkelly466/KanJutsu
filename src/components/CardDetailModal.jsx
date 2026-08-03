import { useState } from 'react';
import Modal from './Modal';
import { applyCustomMeanings, hasCustomMeanings, revertMeanings } from '../utils/card';
import { dueLabel, getDefaultSRSState } from '../utils/srs';
import { formatDate } from '../utils/date';
import { useDecksContext } from '../context/decksContext';

/**
 * Everything about one card, reached by tapping its row in the deck view.
 *
 * Lets the user reword the definition, see the card's SRS history, reset that
 * history, add the card to another deck, or remove it from this one.
 *
 * The deck list and the four mutations come from DecksContext. They used to be
 * props, which meant DeckDetail had to accept five values it never used itself
 * just to hand them over.
 *
 * Props:
 *   card    - the card to show (looked up fresh by the parent each render, so
 *             it never goes stale after a refetch)
 *   deckId  - the deck the card is currently being viewed in
 *   onClose - dismiss the modal
 */
export default function CardDetailModal({ card, deckId, onClose }) {
  const {
    decks,
    updateCard,
    updateCardSRS,
    copyCardToDeck,
    removeCardFromDeck,
  } = useDecksContext();

  const [draftMeanings, setDraftMeanings] = useState(card.back.meanings ?? '');
  // One busy flag for every write in this modal. Without it, a save and a
  // revert can be in flight at once: revert computes from the pre-save
  // `card.back`, so whichever lands second wins and the textarea ends up
  // showing text that isn't what's stored.
  const [isBusy, setIsBusy] = useState(false);
  // Which destructive action is awaiting confirmation: 'reset' | 'remove' | null.
  // These swap content INSIDE this modal rather than opening a second one —
  // Modal owns the body scroll lock and a single back-button history entry, so
  // two mounted at once would corrupt both.
  const [confirming, setConfirming] = useState(null);
  const [copiedDeckIds, setCopiedDeckIds] = useState(new Set());
  // The deck currently being copied to, so its button can't be tapped twice.
  const [pendingDeckId, setPendingDeckId] = useState(null);
  // Failures have to be shown HERE. The app-level error banner renders inside
  // `.container`, underneath this fixed-position modal — and on a phone
  // `modal-fullscreen-sm-down` hides it completely, so a failed write would
  // otherwise look exactly like a successful one.
  const [actionError, setActionError] = useState(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const isWord = card.type === 'word';
  const isEdited = hasCustomMeanings(card.back);
  const trimmedDraft = draftMeanings.trim();
  // Compare trimmed to trimmed: the save writes the trimmed value, so an
  // untrimmed comparison would leave the button enabled forever after the user
  // types a trailing newline in the textarea.
  const hasDraftChanges = trimmedDraft !== (card.back.meanings ?? '').trim();
  // A blank definition would leave the card unanswerable in both the deck row
  // and the study session, so it can't be saved.
  const canSave = hasDraftChanges && trimmedDraft.length > 0 && !isBusy;

  const handleSaveDefinition = async () => {
    setIsBusy(true);
    setActionError(null);
    const ok = await updateCard(card.id, {
      back: applyCustomMeanings(card.back, trimmedDraft),
    });
    if (ok) setSavedNotice(true);
    else setActionError("Couldn't save your definition. Please try again.");
    setIsBusy(false);
  };

  const handleRevert = async () => {
    setIsBusy(true);
    setActionError(null);
    const reverted = revertMeanings(card.back);
    const ok = await updateCard(card.id, { back: reverted });
    // Only pull the textarea back in step once the write succeeded, so a failed
    // revert doesn't show the user text that isn't actually saved.
    if (ok) {
      setDraftMeanings(reverted.meanings ?? '');
      setSavedNotice(false);
    } else {
      setActionError("Couldn't restore the original definition. Please try again.");
    }
    setIsBusy(false);
  };

  const handleResetSRS = async () => {
    setIsBusy(true);
    setActionError(null);
    // getDefaultSRSState() is the exact state a brand-new card starts in, so
    // reset and card creation can't drift apart.
    const ok = await updateCardSRS(card.id, getDefaultSRSState());
    // Only dismiss the confirm when it actually worked — otherwise the box
    // disappearing reads as success.
    if (ok) setConfirming(null);
    else setActionError("Couldn't reset this card. Please try again.");
    setIsBusy(false);
  };

  const handleCopy = async (targetDeckId) => {
    // Mark the deck pending BEFORE awaiting. The dedupe check inside
    // copyCardToDeck reads the card list captured before this call, so two
    // quick taps would both see "not there yet" and create duplicates.
    setPendingDeckId(targetDeckId);
    setActionError(null);
    const ok = await copyCardToDeck(targetDeckId, card);
    if (ok) setCopiedDeckIds((prev) => new Set([...prev, targetDeckId]));
    else setActionError("Couldn't add the card to that deck. Please try again.");
    setPendingDeckId(null);
  };

  const handleRemove = async () => {
    setIsBusy(true);
    setActionError(null);
    const ok = await removeCardFromDeck(deckId, card.id);
    if (ok) onClose();
    else {
      setActionError("Couldn't remove this card. Please try again.");
      setIsBusy(false);
    }
  };

  // Decks this card could still be added to (everything but the current one).
  const otherDecks = decks.filter((d) => d.id !== deckId);

  return (
    <Modal onClose={onClose} scrollable>
      <div className="modal-header border-0">
        <div style={{ minWidth: 0 }}>
          <h5
            className="modal-title fw-bold"
            style={{ wordBreak: 'keep-all', overflowWrap: 'anywhere' }}
          >
            {card.front}
          </h5>
          <p className="text-muted small mb-0">{isWord ? 'Word card' : 'Kanji card'}</p>
        </div>
        <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
      </div>

      <div className="modal-body">
        {/* Failures surface here, not via the app-level banner, which this
            modal covers. */}
        {actionError && (
          <div className="alert alert-warning py-2 small" role="alert">
            {actionError}
          </div>
        )}

        {/* --- Definition (editable) --- */}
        <div className="mb-4">
          <label className="form-label fw-semibold" htmlFor="card-definition">
            Definition
          </label>
          <textarea
            id="card-definition"
            className="form-control"
            rows={3}
            value={draftMeanings}
            onChange={(e) => {
              setDraftMeanings(e.target.value);
              setSavedNotice(false);
            }}
            placeholder="Write this card's meaning in your own words..."
          />
          <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
            <button
              className="btn btn-dark btn-sm touch-target"
              onClick={handleSaveDefinition}
              disabled={!canSave}
            >
              {isBusy ? 'Saving…' : 'Save definition'}
            </button>
            {isEdited && (
              <button
                className="btn btn-outline-secondary btn-sm touch-target"
                onClick={handleRevert}
                disabled={isBusy}
              >
                Revert to original
              </button>
            )}
            {/* Without this the only success signal is the Save button greying
                out, which is easy to miss. */}
            {savedNotice && !hasDraftChanges && (
              <span className="text-success small">✓ Saved</span>
            )}
          </div>
          {isEdited && (
            <p className="text-muted small mt-2 mb-0">
              Original: {card.back.originalMeanings || '—'}
            </p>
          )}
        </div>

        {/* --- Readings (read-only) --- */}
        <div className="mb-4">
          <div className="form-label fw-semibold">Readings</div>
          <div className="text-muted small d-flex flex-wrap gap-3">
            {/* Cards saved before word support have no `type`, so they render
                as kanji — the same fallback used everywhere else. */}
            {isWord ? (
              card.back.reading ? (
                <span>読み: <strong>{card.back.reading}</strong></span>
              ) : (
                <span>—</span>
              )
            ) : (
              <>
                {card.back.onyomi && <span>音読み: <strong>{card.back.onyomi}</strong></span>}
                {card.back.kunyomi && <span>訓読み: <strong>{card.back.kunyomi}</strong></span>}
                {!card.back.onyomi && !card.back.kunyomi && <span>—</span>}
              </>
            )}
          </div>

          {/* Verb forms, stored at add time for verbs only. */}
          {isWord && card.back.verbForms && (
            <div className="text-muted small mt-2">
              {card.back.verbForms.base.word !== card.front && (
                <div>Dictionary: <strong>{card.back.verbForms.base.word}</strong></div>
              )}
              <div>Polite: <strong>{card.back.verbForms.polite.word}</strong></div>
            </div>
          )}
        </div>

        {/* --- Statistics --- */}
        <div className="mb-4">
          <div className="form-label fw-semibold">Statistics</div>
          <div className="bg-light rounded p-3">
            {/* Due status leads, since the deck row no longer shows a badge.
                Keyed off lastReviewedDate rather than repetitions: repetitions
                resets to 0 on a failed rating, so a card studied this morning
                and rated "Again" would otherwise report itself as "New" right
                next to "Last reviewed: today". */}
            <StatRow
              label="Status"
              value={card.lastReviewedDate ? dueLabel(card) : 'New'}
            />
            <StatRow label="Added" value={formatDate(card.addedAt) ?? '—'} />
            <StatRow
              label="Last reviewed"
              value={formatDate(card.lastReviewedDate) ?? 'Never reviewed'}
            />
            <StatRow label="Next review" value={formatDate(card.nextReviewDate) ?? '—'} />
            {/* Named for what SM-2 actually tracks: consecutive successful
                reviews, reset by any lapse — NOT a lifetime review count. */}
            <StatRow label="Correct streak" value={card.repetitions} />
            <StatRow
              label="Interval"
              value={card.interval === 1 ? '1 day' : `${card.interval} days`}
            />
            {/* Ease factor is SM-2's per-card difficulty multiplier: higher
                means the interval grows faster. 2.5 is the starting value. */}
            <StatRow label="Ease factor" value={card.easeFactor.toFixed(2)} />
          </div>

          {confirming === 'reset' ? (
            <div className="alert alert-warning d-flex flex-wrap align-items-center gap-2 mt-3 mb-0">
              <span className="small flex-grow-1">
                Reset this card to New? Its review history is discarded.
              </span>
              <button
                className="btn btn-outline-secondary btn-sm touch-target"
                onClick={() => setConfirming(null)}
                disabled={isBusy}
              >
                Cancel
              </button>
              <button
                className="btn btn-warning btn-sm touch-target"
                onClick={handleResetSRS}
                disabled={isBusy}
              >
                {isBusy ? 'Resetting…' : 'Reset'}
              </button>
            </div>
          ) : (
            <button
              className="btn btn-outline-secondary btn-sm touch-target mt-3"
              onClick={() => setConfirming('reset')}
              disabled={isBusy}
            >
              Reset SRS progress
            </button>
          )}
        </div>

        {/* --- Add to another deck --- */}
        <div>
          <div className="form-label fw-semibold">Add to another deck</div>
          {/* The copy is independent: its own review schedule, and later edits
              to this card's definition don't reach it. Say so rather than let
              the user infer a link that isn't there. */}
          <p className="text-muted small">
            Adds a copy with its own review schedule.
          </p>
          {otherDecks.length === 0 ? (
            <p className="text-muted small mb-0">
              You don&apos;t have any other decks yet.
            </p>
          ) : (
            <div className="list-group list-group-flush">
              {otherDecks.map((deck) => {
                // Already there either from a previous session (matched on the
                // card's stable key) or from a copy made in this one.
                const added =
                  deck.cards.some((c) => c.key === card.key) || copiedDeckIds.has(deck.id);
                return (
                  <div
                    key={deck.id}
                    className="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2 px-0"
                  >
                    <div style={{ minWidth: 0 }}>
                      <div className="fw-semibold">{deck.name}</div>
                      <div className="text-muted small">
                        {deck.cards.length} card{deck.cards.length !== 1 ? 's' : ''}
                      </div>
                    </div>
                    <button
                      className={`btn btn-sm touch-target ${added ? 'btn-success' : 'btn-outline-dark'}`}
                      onClick={() => !added && handleCopy(deck.id)}
                      disabled={added || pendingDeckId === deck.id}
                    >
                      {added ? '✓ Added' : pendingDeckId === deck.id ? 'Adding…' : 'Add'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="modal-footer border-0 justify-content-between">
        {confirming === 'remove' ? (
          <>
            <span className="small text-danger flex-grow-1">
              Remove this card from the deck?
            </span>
            <button
              className="btn btn-outline-secondary btn-sm touch-target"
              onClick={() => setConfirming(null)}
              disabled={isBusy}
            >
              Cancel
            </button>
            <button
              className="btn btn-danger btn-sm touch-target"
              onClick={handleRemove}
              disabled={isBusy}
            >
              {isBusy ? 'Removing…' : 'Remove'}
            </button>
          </>
        ) : (
          <>
            <button
              className="btn btn-outline-danger btn-sm touch-target"
              onClick={() => setConfirming('remove')}
              disabled={isBusy}
            >
              Remove from deck
            </button>
            <button className="btn btn-dark btn-sm touch-target" onClick={onClose}>
              Done
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

/** One label/value line in the statistics block. */
function StatRow({ label, value }) {
  return (
    <div className="d-flex justify-content-between align-items-center small py-1">
      <span className="text-muted">{label}</span>
      <span className="fw-semibold text-end">{value}</span>
    </div>
  );
}
