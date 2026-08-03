import { useMemo, useReducer } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { NavigationContext } from './navigationContext';
import { initialNavState, navigationReducer } from '../reducers/navigation';

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
      // this with a single argument. Whether this opens the picker or redirects
      // a signed-out user to the login form is decided by the reducer — `authed`
      // is passed as plain action data, so that rule stays pure and testable.
      openDeckPicker: (item, itemType = 'kanji') =>
        dispatch({ type: 'REQUEST_ADD_TO_DECK', item, itemType, authed }),
    }),
    [nav, authed]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
