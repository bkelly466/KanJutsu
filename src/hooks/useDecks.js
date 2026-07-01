import { useEffect, useMemo, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import { createCard, createWordCard } from '../utils/card';

/**
 * Cloud-backed decks, replacing the old localStorage version.
 *
 * Data lives in the Amplify `Deck` and `Card` models (owner-scoped, so each
 * signed-in user only sees their own). We use `observeQuery()` subscriptions so
 * the local `decks` state stays in sync automatically after every create/update/
 * delete — including changes from another device — without manual refetching.
 *
 * @param {boolean} enabled  Only subscribe/query when the user is signed in.
 *                           When false (logged out) we expose an empty list.
 */
export function useDecks(enabled) {
  // One data client for the hook's lifetime. Created here (not at module top)
  // so it runs after Amplify.configure() in main.jsx.
  const client = useMemo(() => generateClient(), []);

  const [rawDecks, setRawDecks] = useState([]);
  const [rawCards, setRawCards] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!enabled) {
      // Clear any previous user's data on sign-out. This is an intentional
      // reset tied to the auth session changing; the synchronous-setState lint
      // rule is overly strict about this legitimate case.
      /* eslint-disable react-hooks/set-state-in-effect */
      setRawDecks([]);
      setRawCards([]);
      setIsLoading(true); // so the next sign-in shows a loading state, not "empty"
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    // observeQuery() emits the current list immediately, then again on every
    // change. Its callbacks run asynchronously, so setState here is fine.
    const deckSub = client.models.Deck.observeQuery().subscribe({
      next: ({ items }) => {
        setRawDecks(items);
        setIsLoading(false);
      },
      error: (err) => {
        console.error('Deck sync error:', err);
        setIsLoading(false);
      },
    });
    const cardSub = client.models.Card.observeQuery().subscribe({
      next: ({ items }) => setRawCards(items),
      error: (err) => console.error('Card sync error:', err),
    });

    return () => {
      deckSub.unsubscribe();
      cardSub.unsubscribe();
    };
  }, [enabled, client]);

  // Join cards onto their decks and map DB records to the shape the UI expects.
  // Gated on `enabled` so a logged-out state never shows stale data.
  const decks = useMemo(
    () =>
      enabled
        ? rawDecks.map((d) => ({
            id: d.id,
            name: d.name,
            description: d.description || '',
            category: parseJson(d.category) || { type: 'custom', value: '' },
            createdAt: d.createdAt,
            cards: rawCards.filter((c) => c.deckId === d.id).map(toUiCard),
          }))
        : [],
    [enabled, rawDecks, rawCards]
  );

  // --- mutations (all async; observeQuery refreshes state for us) -----------

  const createDeck = async ({ name, description, category }) => {
    const { data, errors } = await client.models.Deck.create({
      name,
      description: description || '',
      // a.json() (AWSJSON) fields must be sent as a JSON *string*.
      category: JSON.stringify(category || { type: 'custom', value: '' }),
    });
    if (errors) {
      console.error(errors);
      throw new Error('Failed to create deck');
    }
    return data.id;
  };

  const updateDeck = async (deckId, updates) => {
    const payload = { id: deckId, ...updates };
    // Stringify the category JSON field if this update touches it.
    if (payload.category != null && typeof payload.category !== 'string') {
      payload.category = JSON.stringify(payload.category);
    }
    await client.models.Deck.update(payload);
  };

  const deleteDeck = async (deckId) => {
    // No automatic cascade — delete the deck's cards first, then the deck.
    const cards = rawCards.filter((c) => c.deckId === deckId);
    await Promise.all(cards.map((c) => client.models.Card.delete({ id: c.id })));
    await client.models.Deck.delete({ id: deckId });
  };

  const addCardToDeck = async (deckId, item, type = 'kanji') => {
    const built = type === 'word' ? createWordCard(item) : createCard(item);
    // Dedupe within this deck on the stable card key.
    const exists = rawCards.some(
      (c) => c.deckId === deckId && c.cardKey === built.key
    );
    if (exists) return;
    await client.models.Card.create(toModelInput(deckId, built));
  };

  const removeCardFromDeck = async (deckId, cardId) => {
    await client.models.Card.delete({ id: cardId });
  };

  const updateCardSRS = async (deckId, cardId, srsMetrics) => {
    await client.models.Card.update({ id: cardId, ...srsMetrics });
  };

  return {
    decks,
    isLoading,
    createDeck,
    updateDeck,
    deleteDeck,
    addCardToDeck,
    removeCardFromDeck,
    updateCardSRS,
  };
}

// --- mapping helpers --------------------------------------------------------

/**
 * Parse an a.json() (AWSJSON) value read back from the API. AppSync returns it
 * as a JSON string, but we defensively handle an already-parsed object too.
 */
function parseJson(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value;
}

/** Map a built card (from createCard/createWordCard) to a Card model record. */
function toModelInput(deckId, card) {
  return {
    deckId,
    type: card.type,
    cardKey: card.key,
    front: card.front,
    back: JSON.stringify(card.back ?? {}), // a.json() (AWSJSON) must be a string
    kanji: card.kanji ?? null,
    word: card.word ?? null,
    reading: card.reading ?? null,
    // Card.jlpt is a string in the schema; kanji cards carry a number (e.g. 5).
    jlpt: card.jlpt != null ? String(card.jlpt) : null,
    grade: card.grade ?? null,
    repetitions: card.repetitions,
    easeFactor: card.easeFactor,
    interval: card.interval,
    nextReviewDate: card.nextReviewDate,
    addedAt: card.addedAt,
  };
}

/** Map a Card model record back to the shape the components/SRS expect. */
function toUiCard(record) {
  return {
    id: record.id,
    type: record.type,
    key: record.cardKey,
    front: record.front,
    back: parseJson(record.back) || {},
    kanji: record.kanji,
    word: record.word,
    reading: record.reading,
    jlpt: record.jlpt,
    grade: record.grade,
    repetitions: record.repetitions ?? 0,
    easeFactor: record.easeFactor ?? 2.5,
    interval: record.interval ?? 0,
    nextReviewDate: record.nextReviewDate,
    addedAt: record.addedAt,
  };
}
