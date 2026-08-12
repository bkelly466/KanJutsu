import { describe, it, expect } from 'vitest';
import { initialNavState, navigationReducer } from './navigation';

describe('navigationReducer', () => {
  it('starts on the dictionary tab with nothing selected', () => {
    expect(initialNavState).toEqual({
      activeTab: 'dictionary',
      decksView: 'list',
      selectedDeckId: null,
      deckPickerTarget: null,
    });
  });

  it('returns the identical state object for an unknown action', () => {
    expect(navigationReducer(initialNavState, { type: 'NOPE' })).toBe(initialNavState);
  });

  describe('tabs', () => {
    it('switches tabs without disturbing the Decks view underneath', () => {
      const open = navigationReducer(initialNavState, { type: 'SELECT_DECK', deckId: 'd1' });
      const next = navigationReducer(open, { type: 'SET_TAB', tab: 'dictionary' });

      // Leaving the tab must not close the deck — coming back should land where
      // the user left off.
      expect(next.activeTab).toBe('dictionary');
      expect(next.decksView).toBe('detail');
      expect(next.selectedDeckId).toBe('d1');
    });

    it('switches to the Sentence tab, leaving the Decks view alone', () => {
      // The third tab is public like the Dictionary, and shares the same
      // transition — SET_TAB carries the value, so the reducer needs no new case.
      const open = navigationReducer(initialNavState, { type: 'SELECT_DECK', deckId: 'd1' });
      const next = navigationReducer(open, { type: 'SET_TAB', tab: 'sentence' });

      expect(next.activeTab).toBe('sentence');
      expect(next.decksView).toBe('detail');
      expect(next.selectedDeckId).toBe('d1');
    });

    it('returns the identical state when the tab is already active', () => {
      // useReducer only skips a re-render when the reducer returns the SAME
      // object, so without this tapping the active tab re-renders the whole app.
      const next = navigationReducer(initialNavState, {
        type: 'SET_TAB',
        tab: 'dictionary',
      });

      expect(next).toBe(initialNavState);
    });
  });

  describe('deck navigation', () => {
    it('SELECT_DECK sets the view and the id together', () => {
      const next = navigationReducer(initialNavState, { type: 'SELECT_DECK', deckId: 'd1' });

      expect(next.decksView).toBe('detail');
      expect(next.selectedDeckId).toBe('d1');
    });

    it('STUDY_DECK jumps straight to studying, setting the id as well', () => {
      // The list's "Study (n)" button skips the detail view entirely, so this
      // action has to carry the id — STUDY_SELECTED cannot.
      const next = navigationReducer(initialNavState, { type: 'STUDY_DECK', deckId: 'd2' });

      expect(next.decksView).toBe('study');
      expect(next.selectedDeckId).toBe('d2');
    });

    it('STUDY_SELECTED studies the deck already open, leaving the id alone', () => {
      const open = navigationReducer(initialNavState, { type: 'SELECT_DECK', deckId: 'd1' });
      const next = navigationReducer(open, { type: 'STUDY_SELECTED' });

      expect(next.decksView).toBe('study');
      expect(next.selectedDeckId).toBe('d1');
    });

    it('BACK_TO_LIST clears the view and the id together', () => {
      const studying = navigationReducer(initialNavState, { type: 'STUDY_DECK', deckId: 'd1' });
      const next = navigationReducer(studying, { type: 'BACK_TO_LIST' });

      // Both, not just the view: a stale selectedDeckId would leave the detail
      // view rendering the old deck the next time it opened.
      expect(next.decksView).toBe('list');
      expect(next.selectedDeckId).toBeNull();
    });

    it('BACK_TO_DETAIL returns from a session to the deck it was studying', () => {
      const studying = navigationReducer(initialNavState, { type: 'STUDY_DECK', deckId: 'd1' });
      const next = navigationReducer(studying, { type: 'BACK_TO_DETAIL' });

      expect(next.decksView).toBe('detail');
      expect(next.selectedDeckId).toBe('d1');
    });
  });

  describe('deck picker', () => {
    const requestAdd = (item, itemType, authed) => ({
      type: 'REQUEST_ADD_TO_DECK',
      item,
      itemType,
      authed,
    });

    it('stores the target in the { item, type } shape AddToDeckModal reads', () => {
      const item = { id: 'w1', slug: '食べる' };
      const next = navigationReducer(initialNavState, requestAdd(item, 'word', true));

      // The action's own discriminator is `type`, so the card type arrives as
      // `itemType` and is renamed on the way in. Getting this wrong would store
      // 'REQUEST_ADD_TO_DECK' as the card type.
      expect(next.deckPickerTarget).toEqual({ item, type: 'word' });
    });

    it('stays on the Dictionary tab — the picker opens over the results', () => {
      const next = navigationReducer(initialNavState, requestAdd({ id: 'k1' }, 'kanji', true));

      expect(next.activeTab).toBe('dictionary');
    });

    it('stays on the Sentence tab too — the picker opens over the breakdown', () => {
      // The Sentence tab's Token overlay adds words the same way (issue #22).
      // Yanking the user to another tab mid-sentence would throw away the text
      // they pasted, since App.jsx unmounts the tab that isn't active.
      const onSentence = { ...initialNavState, activeTab: 'sentence' };
      const next = navigationReducer(onSentence, requestAdd({ word: '行く' }, 'word', true));

      expect(next.activeTab).toBe('sentence');
      expect(next.deckPickerTarget).toEqual({ item: { word: '行く' }, type: 'word' });
    });

    it('sends a signed-out user to the Decks tab instead of opening the picker', () => {
      // Adding a card requires login, and the Decks tab is where the login form
      // lives. This is the one piece of policy the redirect exists for.
      const next = navigationReducer(initialNavState, requestAdd({ id: 'k1' }, 'kanji', false));

      expect(next.activeTab).toBe('decks');
      expect(next.deckPickerTarget).toBeNull();
    });

    it('redirects a signed-out user from the Sentence tab as well', () => {
      // Same rule, reached from the Token overlay. Worth asserting separately:
      // the redirect is the acceptance criterion #22 is judged on, and it holds
      // because the rule keys off `authed`, never off which tab asked.
      const onSentence = { ...initialNavState, activeTab: 'sentence' };
      const next = navigationReducer(onSentence, requestAdd({ word: '行く' }, 'word', false));

      expect(next.activeTab).toBe('decks');
      expect(next.deckPickerTarget).toBeNull();
    });

    it('CLOSE_DECK_PICKER clears the target without changing the view', () => {
      const open = navigationReducer(
        { ...initialNavState, decksView: 'detail', selectedDeckId: 'd1' },
        requestAdd({ id: 'k1' }, 'kanji', true)
      );
      const next = navigationReducer(open, { type: 'CLOSE_DECK_PICKER' });

      expect(next.deckPickerTarget).toBeNull();
      expect(next.decksView).toBe('detail');
      expect(next.selectedDeckId).toBe('d1');
    });
  });
});
