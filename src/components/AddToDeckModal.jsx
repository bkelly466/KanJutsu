import { useState } from 'react';
import CreateDeckModal from './CreateDeckModal';
import Modal from './Modal';
import { sourceKey, getCardKey } from '../utils/card';
import { writeFailureMessage } from '../utils/writeFailure';
import { useNavigation } from '../context/navigationContext';
import { useDecksContext } from '../context/decksContext';

// Works for both a kanji item (type 'kanji') and a word item (type 'word').
// What's being added, and closing the picker, both come from navigation context —
// the picker is opened from the dictionary but rendered up at the app level.
export default function AddToDeckModal() {
  const { deckPickerTarget, closeDeckPicker } = useNavigation();
  const { decks, isLoading, addCardToDeck, createDeck } = useDecksContext();

  const [showCreate, setShowCreate] = useState(false);
  const [addedDeckIds, setAddedDeckIds] = useState(new Set());
  // Local, for the same reason CardDetailModal's actionError is local: the
  // app-level banner in App.jsx renders inside `.container`, underneath this
  // fixed-position modal, AND only inside the Decks tab — so a failed write
  // from the Dictionary or Sentence tab was invisible everywhere. The button
  // simply stayed on "Add" and the tap looked like it had missed.
  const [addError, setAddError] = useState('');

  // App only renders this when a target exists, but guard anyway — and do it
  // AFTER every hook, so the component can never bail out mid-hook-list. Reading
  // `deckPickerTarget.item` above the hooks would throw between two of them,
  // which is a far more confusing failure than rendering nothing.
  if (!deckPickerTarget) return null;

  // Display + dedupe values that differ by item type.
  const { item, type = 'kanji' } = deckPickerTarget;
  const key = sourceKey(item, type);
  const title = type === 'word' ? item.word : item.kanji;
  const subtitle = (item.meanings || []).slice(0, 3).join(', ');

  // Only mark the deck "✓ Added" once the cloud write actually succeeds —
  // a failed write reports `ok: false`, and says so inside this modal.
  const handleAdd = async (deckId) => {
    setAddError('');
    const result = await addCardToDeck(deckId, item, type);
    if (result.ok) setAddedDeckIds(prev => new Set([...prev, deckId]));
    else setAddError(
      writeFailureMessage(result, 'Couldn’t add that card. Check your connection and try again.'),
    );
  };

  const handleCreate = async (deckData) => {
    // Close BEFORE awaiting, matching DeckList: CreateDeckModal has no busy
    // state and doesn't disable its submit button, so leaving it up for the
    // whole round trip means a second tap creates a second deck.
    setShowCreate(false);
    // The new deck's id comes back as `data`; the card can't be added until
    // the deck exists, so this awaits before calling handleAdd.
    const result = await createDeck(deckData);
    if (result.ok) handleAdd(result.data);
    else setAddError(
      writeFailureMessage(result, 'Couldn’t create that deck. Check your connection and try again.'),
    );
  };

  const isInDeck = (deck) =>
    deck.cards.some(c => getCardKey(c) === key) || addedDeckIds.has(deck.id);

  if (showCreate) {
    return (
      <CreateDeckModal
        onSave={handleCreate}
        onClose={() => setShowCreate(false)}
      />
    );
  }

  return (
    <Modal onClose={closeDeckPicker}>
      <div className="modal-header border-0">
        <div>
          <h5 className="modal-title fw-bold">Add {title} to Deck</h5>
          <p className="text-muted small mb-0">{subtitle}</p>
        </div>
        <button type="button" className="btn-close" onClick={closeDeckPicker} aria-label="Close" />
      </div>
      <div className="modal-body">
        {/* Inside the modal, never the app-level banner — see addError above. */}
        {addError && (
          <div className="alert alert-warning py-2 small" role="alert">
            {addError}
          </div>
        )}

        {/* Three states, not two. Telling someone mid-load that they have no
            decks — and inviting them to create one they already have — is the
            empty state lying about a loading state. Wording matches App.jsx. */}
        {isLoading && decks.length === 0 ? (
          <p className="text-muted text-center py-3">Loading your decks…</p>
        ) : decks.length === 0 ? (
          <p className="text-muted text-center py-3">No decks yet. Create one to get started.</p>
        ) : (
          <div className="list-group list-group-flush">
            {decks.map(deck => {
              const added = isInDeck(deck);
              return (
                <div
                  key={deck.id}
                  className="list-group-item d-flex flex-wrap justify-content-between align-items-center gap-2 px-0"
                >
                  <div>
                    <div className="fw-semibold">{deck.name}</div>
                    <div className="text-muted small">
                      {deck.cards.length} card{deck.cards.length !== 1 ? 's' : ''}
                      {deck.category?.value && ` · ${deck.category.value}`}
                    </div>
                  </div>
                  <button
                    className={`btn btn-sm touch-target ${added ? 'btn-success' : 'btn-outline-dark'}`}
                    onClick={() => !added && handleAdd(deck.id)}
                    disabled={added}
                  >
                    {added ? '✓ Added' : 'Add'}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="modal-footer border-0 justify-content-between">
        <button
          type="button"
          className="btn btn-outline-dark btn-sm touch-target"
          onClick={() => setShowCreate(true)}
        >
          + New Deck
        </button>
        <button type="button" className="btn btn-dark btn-sm touch-target" onClick={closeDeckPicker}>
          Done
        </button>
      </div>
    </Modal>
  );
}
