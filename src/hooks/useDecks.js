import { useCallback, useEffect, useState } from 'react';
import * as api from '../api/decks';
import { SYNC_FAILED } from '../utils/writeFailure';

/**
 * Cloud-backed decks: React state around src/api/decks.js.
 *
 * Everything that talks to AppSync — and the AWSJSON rule that goes with it —
 * lives in that module, which is a plain module so it can be tested. What's
 * left here is the part that genuinely needs React: state, the load effect, the
 * signed-out reset, and turning a thrown error into something a component can
 * render.
 *
 * Reads happen through `list()` and re-run after every mutation. That keeps the
 * UI reliably in sync — a new deck shows without a refresh — and is simpler and
 * more predictable than live subscriptions.
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
      // Clear on success. Without this one transient blip pins the banner for
      // the rest of the session, even after ten successful refetches.
      setError(null);
    } catch (e) {
      console.error('Failed to load decks:', e);
      // The one failure with no call site to report it — nobody pressed a
      // button — so it goes to the app-level banner in App.jsx. Writes do NOT
      // set this: they report through their own result, so a single failure is
      // never announced twice in two different sentences.
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
   * Run one write.
   *
   * Every mutation is the same three steps — call the module, re-fetch so the
   * UI reflects the change, translate a failure into something renderable — so
   * they're written once here rather than eight times below and eight more
   * times across the components. A caller learns this one result shape and gets
   * all eight writes.
   *
   * Always resolves, never rejects: several callers fire a write without
   * awaiting it, and a rejected promise there would be an unhandled rejection.
   *
   * @returns {{ok: boolean, error: string|null, code: string|null, data: any}}
   */
  const run = async (label, write) => {
    try {
      const data = (await write()) ?? null;
      // If the write lands but this refetch doesn't, the result still reports
      // success — because the write DID succeed — and loadData puts its own
      // failure in the banner. Those aren't contradictory: "added" and "we
      // couldn't re-read your decks" are both true, and the banner is exactly
      // where a failed read belongs.
      await loadData();
      return { ok: true, error: null, code: null, data };
    } catch (e) {
      console.error(`${label} failed:`, e);
      // `code` is set by api/decks.js. The `??`s cover a genuinely unexpected
      // throw (a bug in our own code, not a failed request), which is still a
      // sync failure as far as the user is concerned — and keep this function's
      // "never rejects" promise from depending on what a caller threw.
      return {
        ok: false,
        error: e?.message ?? 'Something went wrong. Please try again.',
        code: e?.code ?? SYNC_FAILED,
        data: null,
      };
    }
  };

  /**
   * A Deck's own Cards, which three of the writes need for their dedupe and
   * cascade rules. The module takes them as an argument rather than fetching
   * them, so this is where they're supplied from state.
   */
  const cardsOf = (deckId) => decks.find((deck) => deck.id === deckId)?.cards ?? [];

  return {
    // Gated during RENDER, not in the effect above, and that distinction is the
    // whole point: an effect runs after the browser paints, so gating there
    // would show one frame of the previous user's decks on sign-out — including
    // the due-count badge in App.jsx, which sits outside the auth gate. It also
    // covers a `list()` still in flight when the session ends, which would
    // otherwise land in state after the effect had already cleared it.
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
