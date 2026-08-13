import { useCallback, useEffect, useState } from 'react';
import * as api from '../api/decks';
import { SYNC_FAILED } from '../utils/writeFailure';

/**
 * Cloud-backed decks: React state around src/api/decks.js, which owns every
 * AppSync call and the AWSJSON rule. What's left here is what genuinely needs
 * React — state, the load effect, the signed-out reset, and turning a thrown
 * error into something renderable.
 *
 * Reads go through `list()` and re-run after every mutation: simpler and more
 * predictable than live subscriptions, and a new deck shows without a refresh.
 *
 * @param {boolean} enabled  Only load/mutate when the user is signed in.
 */
export function useDecks(enabled) {
  const [decks, setDecks] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const clearError = useCallback(() => setError(null), []);

  const loadData = useCallback(async () => {
    try {
      setDecks(await api.listDecks());
      // Without this, one transient blip pins the banner for the rest of the
      // session, through any number of successful refetches.
      setError(null);
    } catch (e) {
      console.error('Failed to load decks:', e);
      // The one failure with no call site to report it — nobody pressed a
      // button — so it goes to App.jsx's banner. Writes do NOT set this; they
      // report through their own result, so nothing is announced twice.
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) {
      // Reset on sign-out — intentional reset tied to the auth session change.
      /* eslint-disable react-hooks/set-state-in-effect */
      setDecks([]);
      setIsLoading(true);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }
    loadData();
  }, [enabled, loadData]);

  /**
   * Run one write: call the module, re-fetch so the UI reflects the change,
   * translate a failure into something renderable. One result shape for all
   * eight writes, so a caller learns it once.
   *
   * Always resolves, never rejects — several callers fire a write without
   * awaiting it, where a rejection would be an unhandled promise rejection.
   *
   * @returns {{ok: boolean, error: string|null, code: string|null, data: any}}
   */
  const run = async (label, write) => {
    try {
      const data = (await write()) ?? null;
      // A write that lands while this refetch fails still reports success,
      // because it did succeed; loadData puts its own failure in the banner.
      // "Added" and "couldn't re-read your decks" are both true.
      await loadData();
      return { ok: true, error: null, code: null, data };
    } catch (e) {
      console.error(`${label} failed:`, e);
      // `code` comes from api/decks.js. The `??`s cover a genuinely unexpected
      // throw — a bug here rather than a failed request — which is still a sync
      // failure to the user, and keep the "never rejects" promise from
      // depending on what was thrown.
      return {
        ok: false,
        error: e?.message ?? 'Something went wrong. Please try again.',
        code: e?.code ?? SYNC_FAILED,
        data: null,
      };
    }
  };

  /**
   * A Deck's own Cards, for the three writes whose dedupe and cascade rules
   * need them. api/decks.js takes them as an argument rather than fetching, so
   * this is where they come from state.
   */
  const cardsOf = (deckId) => decks.find((deck) => deck.id === deckId)?.cards ?? [];

  return {
    // Gated during RENDER, not in the effect above. An effect runs after paint,
    // so gating there shows one frame of the previous user's decks on sign-out,
    // including App.jsx's due-count badge, which sits outside the auth gate.
    // It also covers a `list()` still in flight when the session ends.
    decks: enabled ? decks : [],
    isLoading,
    error,
    clearError,

    // Eight writes, one result shape. `data` carries the new Deck's id for
    // createDeck and is null for the rest.
    createDeck: (deckData) => run('createDeck', () => api.createDeck(deckData)),
    updateDeck: (deckId, updates) => run('updateDeck', () => api.updateDeck(deckId, updates)),
    deleteDeck: (deckId) => run('deleteDeck', () => api.deleteDeck(deckId, cardsOf(deckId))),
    addCardToDeck: (deckId, item, type) =>
      run('addCardToDeck', () => api.addCardToDeck(deckId, item, type, cardsOf(deckId))),
    copyCardToDeck: (targetDeckId, card) =>
      run('copyCardToDeck', () => api.copyCardToDeck(targetDeckId, card, cardsOf(targetDeckId))),
    removeCardFromDeck: (cardId) =>
      run('removeCardFromDeck', () => api.removeCardFromDeck(cardId)),
    updateCard: (cardId, updates) => run('updateCard', () => api.updateCard(cardId, updates)),
    updateCardSRS: (cardId, metrics) => run('updateCardSRS', () => api.updateCardSRS(cardId, metrics)),
  };
}
