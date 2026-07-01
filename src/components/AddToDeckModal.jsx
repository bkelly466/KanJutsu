import { useState } from 'react';
import CreateDeckModal from './CreateDeckModal';
import { sourceKey, getCardKey } from '../utils/card';

// Works for both a kanji item (type 'kanji') and a word item (type 'word').
export default function AddToDeckModal({ decks, item, type = 'kanji', onAdd, onCreateDeck, onClose }) {
  const [showCreate, setShowCreate] = useState(false);
  const [addedDeckIds, setAddedDeckIds] = useState(new Set());

  // Display + dedupe values that differ by item type.
  const key = sourceKey(item, type);
  const title = type === 'word' ? item.word : item.kanji;
  const subtitle = (item.meanings || []).slice(0, 3).join(', ');

  const handleAdd = (deckId) => {
    onAdd(deckId, item, type);
    setAddedDeckIds(prev => new Set([...prev, deckId]));
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
    <div
      className="modal d-block"
      style={{ background: 'rgba(0,0,0,0.5)' }}
      onClick={onClose}
    >
      <div
        className="modal-dialog modal-dialog-centered"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-content">
          <div className="modal-header border-0">
            <div>
              <h5 className="modal-title fw-bold">Add {title} to Deck</h5>
              <p className="text-muted small mb-0">{subtitle}</p>
            </div>
            <button type="button" className="btn-close" onClick={onClose} />
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
                      className="list-group-item d-flex justify-content-between align-items-center px-0"
                    >
                      <div>
                        <div className="fw-semibold">{deck.name}</div>
                        <div className="text-muted small">
                          {deck.cards.length} card{deck.cards.length !== 1 ? 's' : ''}
                          {deck.category?.value && ` · ${deck.category.value}`}
                        </div>
                      </div>
                      <button
                        className={`btn btn-sm ${added ? 'btn-success' : 'btn-outline-dark'}`}
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
              className="btn btn-outline-dark btn-sm"
              onClick={() => setShowCreate(true)}
            >
              + New Deck
            </button>
            <button type="button" className="btn btn-dark btn-sm" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
