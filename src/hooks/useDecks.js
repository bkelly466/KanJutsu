import { useCallback, useEffect, useMemo, useState } from 'react';
import { generateClient } from 'aws-amplify/data';
import { createCard, createWordCard } from '../utils/card';

/**
 * Cloud-backed decks, replacing the old localStorage version.
 *
 * Data lives in the Amplify `Deck` and `Card` models (owner-scoped, so each
 * signed-in user only sees their own). We load with `list()` and re-fetch after
 * every mutation. That keeps the UI reliably in sync — a newly created deck
 * shows immediately with no page refresh — and is simpler/more predictable than
 * relying on live subscriptions.
 *
 * Every mutation catches errors and surfaces a friendly `error` message rather
 * than failing silently. `a.json()` fields (Deck.category, Card.back) are
 * JSON-stringified on write and parsed on read, as AWSJSON requires.
 *
 * @param {boolean} enabled  Only load/mutate when the user is signed in.
 */
export function useDecks(enabled) {
  const client = useMemo(() => generateClient(), []);

  const [rawDecks, setRawDecks] = useState([]);
  const [rawCards, setRawCards] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const clearError = useCallback(() => setError(null), []);

  // Fetch decks + cards fresh. Called on load and after every mutation.
  const loadData = useCallback(async () => {
    try {
      const [decksRes, cardsRes] = await Promise.all([
        client.models.Deck.list(),
        client.models.Card.list(),
      ]);
      setRawDecks(decksRes.data || []);
      setRawCards(cardsRes.data || []);
    } catch (e) {
      console.error('Failed to load decks:', e);
      setError(friendlyError(e));
    } finally {
      setIsLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!enabled) {
      // Reset on sign-out — intentional reset tied to the auth session change.
      /* eslint-disable react-hooks/set-state-in-effect */
      setRawDecks([]);
      setRawCards([]);
      setIsLoading(true);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    loadData();
  }, [enabled, loadData]);

  // Join cards onto their decks and map DB records to the shape the UI expects.
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

  // --- mutations: each catches errors, surfaces a message, then refetches ----

  const createDeck = async ({ name, description, category }) => {
    try {
      const { data, errors } = await client.models.Deck.create({
        name,
        description: description || '',
        category: JSON.stringify(category || { type: 'custom', value: '' }),
      });
      if (errors) throw new Error(errors.map((e) => e.message).join('; '));
      await loadData();
      return data.id;
    } catch (e) {
      console.error('createDeck failed:', e);
      setError(friendlyError(e));
      return null;
    }
  };

  const updateDeck = async (deckId, updates) => {
    try {
      const payload = { id: deckId, ...updates };
      if (payload.category != null && typeof payload.category !== 'string') {
        payload.category = JSON.stringify(payload.category);
      }
      const { errors } = await client.models.Deck.update(payload);
      if (errors) throw new Error(errors.map((e) => e.message).join('; '));
      await loadData();
    } catch (e) {
      console.error('updateDeck failed:', e);
      setError(friendlyError(e));
    }
  };

  const deleteDeck = async (deckId) => {
    try {
      // No automatic cascade — delete the deck's cards first, then the deck.
      // Like create/update, delete() reports failures via `errors` rather than
      // throwing, so we must check each response or a failure looks like success.
      const cards = rawCards.filter((c) => c.deckId === deckId);
      const cardResults = await Promise.all(
        cards.map((c) => client.models.Card.delete({ id: c.id }))
      );
      const failedCard = cardResults.find((r) => r.errors);
      if (failedCard) throw new Error(failedCard.errors.map((e) => e.message).join('; '));

      // Only delete the deck once every card is confirmed gone — otherwise a
      // failed card delete would leave the deck removed but orphaned cards
      // behind, which then become invisible, un-deletable garbage.
      const deckResult = await client.models.Deck.delete({ id: deckId });
      if (deckResult.errors) throw new Error(deckResult.errors.map((e) => e.message).join('; '));
      await loadData();
    } catch (e) {
      console.error('deleteDeck failed:', e);
      setError(friendlyError(e));
    }
  };

  // Returns true when the card ends up in the deck (created, or already there)
  // and false when the write failed — so UI like the "✓ Added" state in
  // AddToDeckModal only shows on success.
  const addCardToDeck = async (deckId, item, type = 'kanji') => {
    try {
      const built = type === 'word' ? createWordCard(item) : createCard(item);
      // Dedupe within this deck on the stable card key.
      const exists = rawCards.some((c) => c.deckId === deckId && c.cardKey === built.key);
      if (exists) return true;
      const { errors } = await client.models.Card.create(toModelInput(deckId, built));
      if (errors) throw new Error(errors.map((e) => e.message).join('; '));
      await loadData();
      return true;
    } catch (e) {
      console.error('addCardToDeck failed:', e);
      setError(friendlyError(e));
      return false;
    }
  };

  const removeCardFromDeck = async (deckId, cardId) => {
    try {
      const { errors } = await client.models.Card.delete({ id: cardId });
      if (errors) throw new Error(errors.map((e) => e.message).join('; '));
      await loadData();
    } catch (e) {
      console.error('removeCardFromDeck failed:', e);
      setError(friendlyError(e));
    }
  };

  const updateCardSRS = async (deckId, cardId, srsMetrics) => {
    try {
      const { errors } = await client.models.Card.update({ id: cardId, ...srsMetrics });
      if (errors) throw new Error(errors.map((e) => e.message).join('; '));
      await loadData();
    } catch (e) {
      console.error('updateCardSRS failed:', e);
      setError(friendlyError(e));
    }
  };

  return {
    decks,
    isLoading,
    error,
    clearError,
    createDeck,
    updateDeck,
    deleteDeck,
    addCardToDeck,
    removeCardFromDeck,
    updateCardSRS,
  };
}

// --- helpers ----------------------------------------------------------------

/** Turn an error into a short, user-facing message. */
function friendlyError(e) {
  const msg = String((e && e.message) || e || '').toLowerCase();
  if (
    msg.includes('nosigneduser') ||
    msg.includes('no current user') ||
    msg.includes('unauthorized') ||
    msg.includes('not authorized')
  ) {
    return 'Your session expired. Please sign out and sign in again.';
  }
  return 'Something went wrong syncing with the cloud. Please try again.';
}

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
