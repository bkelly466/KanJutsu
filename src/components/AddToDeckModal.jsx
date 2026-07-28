import { useState } from 'react';
import CreateDeckModal from './CreateDeckModal';
import Modal from './Modal';
import { sourceKey, getCardKey } from '../utils/card';

// Works for both a kanji item (type 'kanji') and a word item (type 'word').
export default function AddToDeckModal({ decks, item, type = 'kanji', onAdd, onCreateDeck, onClose }) {
  const [showCreate, setShowCreate] = useState(false);
  const [addedDeckIds, setAddedDeckIds] = useState(new Set());

  // Display + dedupe values that differ by item type.
  const key = sourceKey(item, type);
  const title = type === 'word' ? item.word : item.kanji;
  const subtitle = (item.meanings || []).slice(0, 3).join(', ');

  // Only mark the deck "✓ Added" once the cloud write actually succeeds —
  // onAdd resolves to false on failure (an error banner shows behind the modal).
  const handleAdd = async (deckId) => {
    const ok = await onAdd(deckId, item, type);
    if (ok) setAddedDeckIds(prev => new Set([...prev, deckId]));
  };

  const handleCreate = async (deckData) => {
    // createDeck is async now (cloud); await the new id before adding the card.
    // It returns null if the create failed (error shown via the banner).
    const newId = await onCreateDeck(deckData);
    setShowCreate(false);
    if (newId) handleAdd(newId);
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
    <Modal onClose={onClose}>
      <div className="modal-header border-0">
        <div>
          <h5 className="modal-title fw-bold">Add {title} to Deck</h5>
          <p className="text-muted small mb-0">{subtitle}</p>
        </div>
        <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
      </div>
      <div className="modal-body">
        {decks.length === 0 ? (
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
        <button type="button" className="btn btn-dark btn-sm touch-target" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
