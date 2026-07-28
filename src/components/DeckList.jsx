import { useState } from 'react';
import { getCardsForReview } from '../utils/srs';
import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR } from '../constants/categories';
import CreateDeckModal from './CreateDeckModal';
import Modal from './Modal';

export default function DeckList({ decks, onCreateDeck, onUpdateDeck, onDeleteDeck, onSelectDeck, onStudyDeck }) {
  const [showCreate, setShowCreate] = useState(false);
  const [editingDeck, setEditingDeck] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const handleCreate = async (deckData) => {
    await onCreateDeck(deckData);
    // Close either way; any failure is shown via the error banner.
    setShowCreate(false);
  };

  const handleEdit = (deckData) => {
    onUpdateDeck(editingDeck.id, deckData);
    setEditingDeck(null);
  };

  const handleDelete = (deckId) => {
    onDeleteDeck(deckId);
    setConfirmDelete(null);
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="fw-bold mb-0">My Decks</h4>
        <button className="btn btn-dark btn-sm" onClick={() => setShowCreate(true)}>
          + New Deck
        </button>
      </div>

      {decks.length === 0 ? (
        <div className="text-center py-5 text-muted">
          <div style={{ fontSize: '3rem' }}>🗂</div>
          <p className="mt-2">No decks yet.</p>
          <p className="small">Search for kanji and add them to a deck, or create a deck first.</p>
          <button className="btn btn-dark mt-2" onClick={() => setShowCreate(true)}>
            Create Your First Deck
          </button>
        </div>
      ) : (
        <div className="row g-3">
          {decks.map(deck => {
            const dueCount = getCardsForReview(deck.cards).length;
            const color = CATEGORY_COLORS[deck.category?.type] || DEFAULT_CATEGORY_COLOR;

            return (
              <div key={deck.id} className="col-12 col-md-6">
                <div className="card shadow-sm h-100" style={{ cursor: 'pointer' }}>
                  <div className="card-body" onClick={() => onSelectDeck(deck.id)}>
                    <div className="d-flex justify-content-between align-items-start mb-2">
                      <h5 className="card-title fw-bold mb-0">{deck.name}</h5>
                      {deck.category?.value && (
                        <span className={`badge bg-${color} ms-2`}>
                          {deck.category.value}
                        </span>
                      )}
                    </div>

                    {deck.description && (
                      <p className="card-text text-muted small mb-3">{deck.description}</p>
                    )}

                    <div className="d-flex gap-3 small text-muted">
                      <span>{deck.cards.length} cards</span>
                      {dueCount > 0 && (
                        <span className="text-danger fw-semibold">
                          {dueCount} due today
                        </span>
                      )}
                      {dueCount === 0 && deck.cards.length > 0 && (
                        <span className="text-success">All caught up!</span>
                      )}
                    </div>
                  </div>

                  <div className="card-footer bg-transparent border-top-0 d-flex gap-2 pt-0 pb-3 px-3">
                    {/* "Study (n)" starts a session directly; with nothing due
                        it opens the deck instead — so the label matches the
                        action. Empty decks stay openable (clicking the card
                        body already opened them, so the button shouldn't
                        disagree). */}
                    <button
                      className="btn btn-dark btn-sm flex-grow-1"
                      onClick={() =>
                        dueCount > 0 ? onStudyDeck(deck.id) : onSelectDeck(deck.id)
                      }
                    >
                      {dueCount > 0 ? `Study (${dueCount})` : 'View Deck'}
                    </button>
                    {/* Icon-only buttons: `touch-target` gives them a 44px
                        minimum, and aria-label carries the accessible name
                        since the `title` tooltip never shows on touch. */}
                    <button
                      className="btn btn-outline-secondary btn-sm touch-target"
                      onClick={e => { e.stopPropagation(); setEditingDeck(deck); }}
                      aria-label={`Edit ${deck.name}`}
                      title="Edit deck"
                    >
                      ✎
                    </button>
                    <button
                      className="btn btn-outline-danger btn-sm touch-target"
                      onClick={e => { e.stopPropagation(); setConfirmDelete(deck); }}
                      aria-label={`Delete ${deck.name}`}
                      title="Delete deck"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showCreate && (
        <CreateDeckModal onSave={handleCreate} onClose={() => setShowCreate(false)} />
      )}

      {editingDeck && (
        <CreateDeckModal
          existingDeck={editingDeck}
          onSave={handleEdit}
          onClose={() => setEditingDeck(null)}
        />
      )}

      {confirmDelete && (
        // closeOnBackdrop={false} preserves this modal's existing behaviour —
        // it never had a backdrop click handler. That matters more on touch,
        // where a stray tap outside a destructive confirm is easy to make.
        <Modal size="sm" closeOnBackdrop={false} onClose={() => setConfirmDelete(null)}>
          <div className="modal-body text-center py-4">
            <p className="fw-semibold mb-1">Delete &quot;{confirmDelete.name}&quot;?</p>
            <p className="text-muted small">This will remove the deck and all {confirmDelete.cards.length} cards.</p>
          </div>
          <div className="modal-footer border-0 justify-content-center gap-2">
            <button className="btn btn-outline-secondary btn-sm touch-target" onClick={() => setConfirmDelete(null)}>
              Cancel
            </button>
            <button className="btn btn-danger btn-sm touch-target" onClick={() => handleDelete(confirmDelete.id)}>
              Delete
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
