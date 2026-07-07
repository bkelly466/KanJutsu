import { getCardsForReview, daysUntilDue } from '../utils/srs';

export default function DeckDetail({ deck, onBack, onStudy, onRemoveCard }) {
  if (!deck) return null;

  const dueCards = getCardsForReview(deck.cards);

  // The day math lives in srs.js; this only turns the number into a label.
  const dueLabel = (card) => {
    const days = daysUntilDue(card);
    if (days <= 0) return 'Due today';
    if (days === 1) return 'Due tomorrow';
    return `Due in ${days} days`;
  };

  return (
    <div>
      <div className="d-flex align-items-center gap-3 mb-4">
        <button className="btn btn-outline-secondary btn-sm" onClick={onBack}>
          ← Back
        </button>
        <div className="flex-grow-1">
          <h4 className="fw-bold mb-0">{deck.name}</h4>
          {deck.description && (
            <p className="text-muted small mb-0">{deck.description}</p>
          )}
        </div>
        <button
          className="btn btn-dark"
          onClick={onStudy}
          disabled={dueCards.length === 0}
        >
          {dueCards.length > 0 ? `Study Now (${dueCards.length})` : 'Nothing Due'}
        </button>
      </div>

      {deck.cards.length === 0 ? (
        <div className="text-center py-5 text-muted">
          <div style={{ fontSize: '2.5rem' }}>📭</div>
          <p className="mt-2">No cards in this deck yet.</p>
          <p className="small">Search for kanji or words and use "Add to Deck" to add cards here.</p>
        </div>
      ) : (
        <>
          <div className="d-flex gap-3 mb-3 small text-muted">
            <span>{deck.cards.length} total</span>
            {dueCards.length > 0 && (
              <span className="text-danger fw-semibold">{dueCards.length} due today</span>
            )}
            <span>{deck.cards.filter(c => c.repetitions > 0).length} reviewed</span>
          </div>

          <div className="list-group">
            {deck.cards.map(card => (
              <div
                key={card.id}
                className="list-group-item d-flex justify-content-between align-items-center"
              >
                <div className="d-flex align-items-center gap-3">
                  <span style={{ fontSize: '1.8rem', fontWeight: 'bold', lineHeight: 1 }}>
                    {card.front ?? card.kanji}
                  </span>
                  <div>
                    <div className="text-muted small">
                      {card.back.meanings}
                    </div>
                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                      {/* Word cards show a reading; kanji cards show on/kun'yomi.
                          card.type is absent on legacy cards → treated as kanji. */}
                      {card.type === 'word' ? (
                        card.back.reading && <span>読み: {card.back.reading}</span>
                      ) : (
                        <>
                          {card.back.onyomi && <span>音: {card.back.onyomi} </span>}
                          {card.back.kunyomi && <span>訓: {card.back.kunyomi}</span>}
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2">
                  <span
                    className={`badge ${card.repetitions === 0 ? 'bg-secondary' : 'bg-success'}`}
                    style={{ fontSize: '0.7rem' }}
                  >
                    {card.repetitions === 0 ? 'New' : dueLabel(card)}
                  </span>
                  <button
                    className="btn btn-outline-danger btn-sm"
                    style={{ padding: '2px 7px', fontSize: '0.75rem' }}
                    onClick={() => onRemoveCard(deck.id, card.id)}
                    title="Remove card"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
