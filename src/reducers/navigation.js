/**
 * Where the app is pointed: which tab, which view inside the Decks tab, which
 * deck, and whether the "Add to Deck" picker is open.
 *
 * One idea rather than four independent values — opening a deck sets a view AND
 * an id, going back clears both — so a reducer names each transition once and
 * makes it atomic. As separate useState calls, nothing stopped the pair
 * drifting out of step.
 */

export const initialNavState = {
  // 'sentence' is the Sentence analyzer tab. Like 'dictionary' it's public —
  // only 'decks' gates on login.
  activeTab: 'dictionary', // 'dictionary' | 'sentence' | 'decks'
  decksView: 'list', // 'list' | 'detail' | 'study'
  selectedDeckId: null,
  // What the picker is adding: { item, type } or null. `type` is 'kanji' | 'word'.
  deckPickerTarget: null,
};

export function navigationReducer(state, action) {
  switch (action.type) {
    // The SAME object, not an equal one: useState bails out on an equal value,
    // useReducer only on an identical object. Without this, tapping the tab
    // you're already on re-renders the whole app.
    case 'SET_TAB':
      return state.activeTab === action.tab
        ? state
        : { ...state, activeTab: action.tab };

    // Open a deck from the list.
    case 'SELECT_DECK':
      return { ...state, decksView: 'detail', selectedDeckId: action.deckId };

    // Start studying the deck already open in the detail view.
    case 'STUDY_SELECTED':
      return { ...state, decksView: 'study' };

    // Jump straight into a session from the list's "Study (n)" button,
    // skipping the detail view — so this sets the id as well.
    case 'STUDY_DECK':
      return { ...state, decksView: 'study', selectedDeckId: action.deckId };

    case 'BACK_TO_LIST':
      return { ...state, decksView: 'list', selectedDeckId: null };

    case 'BACK_TO_DETAIL':
      return { ...state, decksView: 'detail' };

    // "The user asked to add this to a deck", not "open the picker": there are
    // two valid answers, and a signed-out user goes to the Decks tab, where the
    // login form is. `authed` arrives as action data to keep this pure.
    //
    // `itemType`, not `type` — the action's own discriminator is `type`, and a
    // card's type is also `type`, so one would silently shadow the other.
    case 'REQUEST_ADD_TO_DECK':
      if (!action.authed) return { ...state, activeTab: 'decks' };
      return {
        ...state,
        deckPickerTarget: { item: action.item, type: action.itemType },
      };

    case 'CLOSE_DECK_PICKER':
      return { ...state, deckPickerTarget: null };

    default:
      return state;
  }
}
