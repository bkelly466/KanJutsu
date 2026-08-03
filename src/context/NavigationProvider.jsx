import { useMemo, useReducer } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { NavigationContext } from './navigationContext';
import { initialNavState, navigationReducer } from './navigationReducer';

/**
 * Shares "where the app is pointed" with any component that needs it, without
 * passing it down through props.
 *
 * A Context is a value the provider puts in one place and any descendant reads
 * directly. It exists here to kill a four-level prop chain: `onOpenDeckPicker`
 * used to travel App -> Query -> KanjiInfoModal -> DetailedInfoCard, and the two
 * components in the middle never called it — they only forwarded it.
 *
 * What's exposed is the state plus *named action creators* (selectDeck,
 * backToList, ...) rather than a raw `dispatch`. Call sites then read exactly
 * like the handler props they replace, and the action names stay an internal
 * detail of this folder.
 */
export function NavigationProvider({ children }) {
  const [nav, dispatch] = useReducer(navigationReducer, initialNavState);

  // Safe to read here: this provider is mounted inside Authenticator.Provider.
  const { user } = useAuthenticator((context) => [context.user]);
  const authed = !!user;

  const value = useMemo(
    () => ({
      ...nav,
      setTab: (tab) => dispatch({ type: 'SET_TAB', tab }),
      selectDeck: (deckId) => dispatch({ type: 'SELECT_DECK', deckId }),
      studySelected: () => dispatch({ type: 'STUDY_SELECTED' }),
      studyDeck: (deckId) => dispatch({ type: 'STUDY_DECK', deckId }),
      backToList: () => dispatch({ type: 'BACK_TO_LIST' }),
      backToDetail: () => dispatch({ type: 'BACK_TO_DETAIL' }),
      closeDeckPicker: () => dispatch({ type: 'CLOSE_DECK_PICKER' }),

      // `itemType` defaults to 'kanji' so the kanji detail card can keep calling
      // this with a single argument. Adding cards requires login, so a signed-out
      // user is sent to the Decks tab instead, which is where the login form is.
      //
      // The auth check lives here rather than in the reducer deliberately: it is
      // navigation policy, and keeping it out of the reducer leaves that a pure
      // function with no dependency on auth.
      openDeckPicker: (item, itemType = 'kanji') =>
        authed
          ? dispatch({ type: 'OPEN_DECK_PICKER', item, itemType })
          : dispatch({ type: 'SET_TAB', tab: 'decks' }),
    }),
    [nav, authed]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
