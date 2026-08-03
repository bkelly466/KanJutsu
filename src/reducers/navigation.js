/**
 * Where the app is currently pointed: which tab, which view inside the Decks
 * tab, which deck, and whether the "Add to Deck" picker is open.
 *
 * These four values are one idea, not four independent ones — opening a deck
 * sets a view *and* an id, going back clears both. Written as separate useState
 * calls (as they were in App.jsx) nothing stops the pair drifting out of step.
 * A reducer names each transition once and makes it atomic.
 *
 * Pure and side-effect free, so it unit-tests with no DOM and no React.
 */

export const initialNavState = {
  activeTab: 'dictionary', // 'dictionary' | 'decks'
  decksView: 'list', // 'list' | 'detail' | 'study'
  selectedDeckId: null,
  // What the picker is adding: { item, type } or null. `type` is 'kanji' | 'word'.
  deckPickerTarget: null,
};

export function navigationReducer(state, action) {
  switch (action.type) {
    // Returning the SAME object when nothing changes matters here in a way it
    // doesn't for useState. useState bails out when you set an equal value;
    // useReducer only bails out when the reducer returns the identical object.
    // Without this, tapping the tab you're already on re-renders the whole app.
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

    // "The user asked to add this item to a deck" — not "open the picker",
    // because there are two valid answers. Adding a card requires login, so a
    // signed-out user is sent to the Decks tab, which is where the login form
    // lives. `authed` arrives as action data, which keeps this function pure
    // while still letting the rule be tested.
    //
    // Note `itemType`, not `type`: a card's type is 'kanji' | 'word', and this
    // object's own `type` is already taken by the action name. Naming both
    // `type` would silently shadow one with the other.
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
