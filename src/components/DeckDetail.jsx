import { useState } from 'react';
import { getCardsForReview } from '../utils/srs';
import { useBackButton } from '../hooks/useBackButton';
import { useNavigation } from '../context/navigationContext';
import { useSelectedDeck } from '../hooks/useSelectedDeck';
import CardDetailModal from './CardDetailModal';

/**
 * Truncate a single line with an ellipsis instead of wrapping. All three
 * properties are required together, and the element also needs a constrained
 * width — here the parent's `minWidth: 0`, without which a flex item refuses
 * to shrink below its content.
 */
const ELLIPSIS = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

export default function DeckDetail() {
  const { backToList, studySelected } = useNavigation();
  const deck = useSelectedDeck();

  // By id, not the object: useDecks rebuilds `decks` after every mutation, so a
  // held card would go stale the moment it was edited or reset.
  const [selectedCardId, setSelectedCardId] = useState(null);

  // Device Back returns to the deck list, not out of the app. Called before the
  // early return below, so hook order stays stable across renders.
  useBackButton(!!deck, backToList);

  if (!deck) return null;

  const dueCards = getCardsForReview(deck.cards);
  const selectedCard = deck.cards.find((c) => c.id === selectedCardId);

  /**
   * The reading shown in parentheses beside the headword, or null when there is
   * nothing worth showing — so the caller omits the parentheses rather than
   * rendering an empty "()".
   *
   * A kanji card's on'yomi and kun'yomi are joined; they stay tellable apart
   * because on'yomi is katakana and kun'yomi hiragana.
   */
  const readingFor = (card) => {
    if (card.type === 'word') {
      // Kana-only words (e.g. ある) have a reading identical to the headword;
      // repeating it adds nothing.
      const reading = card.back.reading;
      return reading && reading !== card.front ? reading : null;
    }
    return [card.back.onyomi, card.back.kunyomi].filter(Boolean).join('、') || null;
  };

  return (
    <div>
      {/* flex-wrap drops the Study button onto its own line rather than
          crushing a long deck name. The title's min-width forces that wrap. */}
      <div className="d-flex flex-wrap align-items-center gap-2 gap-md-3 mb-4">
        <button className="btn btn-outline-secondary btn-sm touch-target" onClick={backToList}>
          ← Back
        </button>
        <div className="flex-grow-1" style={{ minWidth: '10rem' }}>
          <h4 className="fw-bold mb-0">{deck.name}</h4>
          {deck.description && (
            <p className="text-muted small mb-0">{deck.description}</p>
          )}
        </div>
        <button
          className="btn btn-dark flex-grow-1 flex-sm-grow-0"
          onClick={studySelected}
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
            {deck.cards.map(card => {
              const reading = readingFor(card);
              return (
                // `list-group-item-action` gives the press feedback touch
                // needs, matching the dictionary results.
                <button
                  key={card.id}
                  type="button"
                  className="list-group-item list-group-item-action d-flex align-items-center text-start"
                  onClick={() => setSelectedCardId(card.id)}
                >
                  {/* Flex items default to min-width:auto, which would push the
                      chevron off the right edge. This is also what makes the
                      ellipsis below possible. */}
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    {/* A row is a summary and the full text is one tap away, so
                        both lines truncate. `nowrap` also rules out Japanese
                        stacking one character per line — there is no second
                        line to break onto. */}
                    <div style={ELLIPSIS}>
                      <span
                        style={{ fontSize: '1.8rem', fontWeight: 'bold', lineHeight: 1.2 }}
                      >
                        {card.front ?? card.kanji}
                      </span>
                      {reading && <span className="text-muted ms-2">({reading})</span>}
                    </div>
                    <div className="text-muted small" style={ELLIPSIS}>
                      {card.back.meanings}
                    </div>
                  </div>

                  {/* Decorative. The button deliberately has no aria-label:
                      that would REPLACE the name computed from its contents,
                      losing the reading and meaning a screen reader reads out. */}
                  <span
                    className="text-muted ms-3"
                    style={{ fontSize: '2rem', lineHeight: 1, flexShrink: 0 }}
                    aria-hidden="true"
                  >
                    ›
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Looked up from `deck.cards` every render, so it reflects the latest
          refetch — and goes undefined when the card is removed, closing the
          modal. */}
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          deckId={deck.id}
          onClose={() => setSelectedCardId(null)}
        />
      )}
    </div>
  );
}
