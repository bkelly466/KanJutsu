import { useState } from 'react';
import CreateDeckModal from './CreateDeckModal';
import Modal from './Modal';
import { sourceKey, getCardKey } from '../utils/card';
import { writeFailureMessage } from '../utils/writeFailure';
import { useNavigation } from '../context/navigationContext';
import { useDecksContext } from '../context/decksContext';

// The "Add to Deck" picker, for both kanji and word items. What's being added
// comes from navigation context: the picker is opened from the dictionary or
// the Sentence tab but rendered at the app level.
export default function AddToDeckModal() {
  const { deckPickerTarget, closeDeckPicker } = useNavigation();
  const { decks, isLoading, addCardToDeck, createDeck } = useDecksContext();

  const [showCreate, setShowCreate] = useState(false);
  const [addedDeckIds, setAddedDeckIds] = useState(new Set());
  // Local, like CardDetailModal's actionError: App's banner renders under this
  // fixed-position modal AND only inside the Decks tab, so a failed write from
  // the Dictionary or Sentence tab appeared nowhere at all — the button stayed
  // on "Add" and the tap looked like it had missed.
  const [addError, setAddError] = useState('');

  // Guarded even though App only renders this with a target — and AFTER every
  // hook, so the component can never bail out mid-hook-list.
  if (!deckPickerTarget) return null;

  // Display and dedupe values, which differ by item type.
  const { item, type = 'kanji' } = deckPickerTarget;
  const key = sourceKey(item, type);
  const title = type === 'word' ? item.word : item.kanji;
  const subtitle = (item.meanings || []).slice(0, 3).join(', ');

  // "✓ Added" only once the cloud write succeeds.
  const handleAdd = async (deckId) => {
    setAddError('');
    const result = await addCardToDeck(deckId, item, type);
    if (result.ok) setAddedDeckIds(prev => new Set([...prev, deckId]));
    else setAddError(
      writeFailureMessage(result, 'Couldn’t add that card. Check your connection and try again.'),
    );
  };

  const handleCreate = async (deckData) => {
    // Close BEFORE awaiting, matching DeckList: CreateDeckModal doesn't disable
    // its submit button, so a second tap would create a second deck.
    setShowCreate(false);
    // The card can't be added until the deck exists, hence the await; the new
    // deck's id comes back as `data`.
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

        {/* Three states, not two: telling someone mid-load that they have no
            decks invites them to create one they already own. */}
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
