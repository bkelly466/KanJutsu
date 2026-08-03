import { useState } from 'react';
import { getCardsForReview } from '../utils/srs';
import { useBackButton } from '../hooks/useBackButton';
import { useNavigation } from '../context/navigationContext';
import CardDetailModal from './CardDetailModal';

/**
 * Truncate a single line with an ellipsis instead of wrapping.
 *
 * All three properties are required together: `nowrap` keeps the text on one
 * line, `hidden` clips what doesn't fit, and `ellipsis` draws the "…". The
 * element also needs a constrained width — here that comes from the parent's
 * `minWidth: 0`, without which a flex item refuses to shrink below its content.
 */
const ELLIPSIS = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
};

export default function DeckDetail({
  deck,
  decks,
  onRemoveCard,
  onUpdateCard,
  onUpdateCardSRS,
  onCopyCardToDeck,
}) {
  const { backToList, studySelected } = useNavigation();

  // Track the card by ID, not the object: useDecks refetches after every
  // mutation and rebuilds `decks`, so a held card object would go stale the
  // moment the user edited or reset it.
  const [selectedCardId, setSelectedCardId] = useState(null);

  // Device Back returns to the deck list instead of leaving the app.
  // Both hooks are called before the early return below so the hook order
  // stays stable across renders.
  useBackButton(!!deck, backToList);

  if (!deck) return null;

  const dueCards = getCardsForReview(deck.cards);
  const selectedCard = deck.cards.find((c) => c.id === selectedCardId);

  /**
   * The reading shown in parentheses beside the headword. Word cards have one
   * reading; kanji cards have on'yomi and kun'yomi, which we join — they stay
   * tellable apart because on'yomi is katakana and kun'yomi hiragana.
   *
   * Returns null when there's nothing worth showing, so the caller can omit
   * the parentheses entirely rather than render an empty "()".
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
      {/* flex-wrap lets the Study button drop onto its own line rather than
          crushing a long deck name on a phone. The title has a min-width so it
          is the element that forces the wrap. */}
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
                // The whole row opens the card's detail modal.
                // `list-group-item-action` gives the press feedback that touch
                // needs (the same pattern the dictionary results use).
                <button
                  key={card.id}
                  type="button"
                  className="list-group-item list-group-item-action d-flex align-items-center text-start"
                  onClick={() => setSelectedCardId(card.id)}
                >
                  {/* minWidth: 0 lets this block shrink below its content width.
                      Flex items default to min-width:auto, which would otherwise
                      push the chevron off the right edge — and it's also what
                      makes the ellipsis below possible. */}
                  <div className="flex-grow-1" style={{ minWidth: 0 }}>
                    {/* Both lines truncate with an ellipsis rather than wrapping:
                        a row is a summary, and the full text is one tap away in
                        the modal. `nowrap` also removes any chance of Japanese
                        stacking one character per line, since there is no line
                        to break onto. */}
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

                  {/* Decorative. The button has no aria-label: that would
                      REPLACE the name computed from its contents, so a screen
                      reader would announce only "Details for 水" and lose the
                      reading and meaning it currently reads out. */}
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

      {/* selectedCard is looked up from `deck.cards` on every render, so it
          always reflects the latest data after a mutation + refetch. It goes
          undefined if the card is removed, which closes the modal. */}
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          deckId={deck.id}
          decks={decks}
          onUpdateCard={onUpdateCard}
          onUpdateCardSRS={onUpdateCardSRS}
          onCopyCardToDeck={onCopyCardToDeck}
          onRemoveCard={onRemoveCard}
          onClose={() => setSelectedCardId(null)}
        />
      )}
    </div>
  );
}
