import { useState } from 'react';
import { getCardsForReview } from '../utils/srs';
import { writeFailureMessage } from '../utils/writeFailure';
import { CATEGORY_COLORS, DEFAULT_CATEGORY_COLOR } from '../constants/categories';
import { useNavigation } from '../context/navigationContext';
import { useDecksContext } from '../context/decksContext';
import CreateDeckModal from './CreateDeckModal';
import Modal from './Modal';

export default function DeckList() {
  // Opening a deck and jumping into a session are navigation, not deck data.
  const { selectDeck, studyDeck } = useNavigation();
  const { decks, createDeck, updateDeck, deleteDeck } = useDecksContext();

  const [showCreate, setShowCreate] = useState(false);
  const [editingDeck, setEditingDeck] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  // Create and edit failures show on the list itself, because both close their
  // modal first: CreateDeckModal has no busy state, so leaving it open during
  // the round trip leaves a live submit button a second tap would fire again.
  const [actionError, setActionError] = useState('');
  // Delete is the exception — see handleDelete.
  const [deleteError, setDeleteError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const handleCreate = async (deckData) => {
    setShowCreate(false);
    const result = await createDeck(deckData);
    setActionError(result.ok ? '' : writeFailureMessage(result, "Couldn't create that deck. Please try again."));
  };

  const handleEdit = async (deckData) => {
    const deckId = editingDeck.id;
    setEditingDeck(null);
    const result = await updateDeck(deckId, deckData);
    setActionError(result.ok ? '' : writeFailureMessage(result, "Couldn't save those changes. Please try again."));
  };

  // Keeps its modal open until the write succeeds and reports failure INSIDE
  // it: a confirmation box disappearing reads as "done", which would leave the
  // deck sitting in a list the user believes they just emptied.
  const handleDelete = async (deckId) => {
    setIsDeleting(true);
    setDeleteError('');
    const result = await deleteDeck(deckId);
    if (result.ok) setConfirmDelete(null);
    else setDeleteError(writeFailureMessage(result, "Couldn't delete that deck. Please try again."));
    setIsDeleting(false);
  };

  return (
    <div>
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h4 className="fw-bold mb-0">My Decks</h4>
        <button className="btn btn-dark btn-sm" onClick={() => setShowCreate(true)}>
          + New Deck
        </button>
      </div>

      {/* role="alert" matches App.jsx and CardDetailModal.jsx, so a failure is
          announced rather than only seen. */}
      {actionError && (
        <div className="alert alert-warning alert-dismissible d-flex justify-content-between align-items-center" role="alert">
          <span>{actionError}</span>
          <button type="button" className="btn-close" aria-label="Dismiss" onClick={() => setActionError('')}></button>
        </div>
      )}

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
                  <div className="card-body" onClick={() => selectDeck(deck.id)}>
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
                    {/* The label matches the action: with nothing due this
                        opens the deck rather than starting a session, which is
                        what tapping the card body already does. */}
                    <button
                      className="btn btn-dark btn-sm flex-grow-1"
                      onClick={() =>
                        dueCount > 0 ? studyDeck(deck.id) : selectDeck(deck.id)
                      }
                    >
                      {dueCount > 0 ? `Study (${dueCount})` : 'View Deck'}
                    </button>
                    {/* Icon-only, so aria-label carries the accessible name —
                        a `title` tooltip never shows on touch. */}
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
        // A stray tap outside a destructive confirm is easy to make on touch.
        <Modal size="sm" closeOnBackdrop={false} onClose={() => { setConfirmDelete(null); setDeleteError(''); }}>
          <div className="modal-body text-center py-4">
            <p className="fw-semibold mb-1">Delete &quot;{confirmDelete.name}&quot;?</p>
            <p className="text-muted small">This will remove the deck and all {confirmDelete.cards.length} cards.</p>
            {/* Inside the modal, never the list behind it: this box is what's
                on screen, so it has to carry the bad news. */}
            {deleteError && (
              <div className="alert alert-warning py-2 small mb-0 mt-3" role="alert">
                {deleteError}
              </div>
            )}
          </div>
          <div className="modal-footer border-0 justify-content-center gap-2">
            <button
              className="btn btn-outline-secondary btn-sm touch-target"
              onClick={() => { setConfirmDelete(null); setDeleteError(''); }}
              disabled={isDeleting}
            >
              Cancel
            </button>
            <button
              className="btn btn-danger btn-sm touch-target"
              onClick={() => handleDelete(confirmDelete.id)}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
