import { useMemo, useReducer } from 'react';
import { useAuthenticator } from '@aws-amplify/ui-react';
import { NavigationContext } from './navigationContext';
import { initialNavState, navigationReducer } from '../reducers/navigation';

/**
 * Shares "where the app is pointed" with any component that needs it, rather
 * than passing it through props — `onOpenDeckPicker` used to travel four levels
 * from App to DetailedInfoCard, forwarded untouched by everything between.
 *
 * Exposes the state plus named action creators (selectDeck, backToList, …)
 * rather than a raw `dispatch`, so call sites read like the handler props they
 * replace and the action names stay internal to this folder.
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

      // `itemType` defaults to 'kanji' so the kanji detail card can call this
      // with one argument. Whether it opens the picker or redirects a
      // signed-out user to the login form is the reducer's decision — `authed`
      // travels as action data to keep that rule pure and testable.
      openDeckPicker: (item, itemType = 'kanji') =>
        dispatch({ type: 'REQUEST_ADD_TO_DECK', item, itemType, authed }),
    }),
    [nav, authed]
  );

  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}
