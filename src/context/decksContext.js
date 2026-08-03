import { createContext, useContext } from 'react';

/**
 * The context object plus its consumer hook. Same split as navigationContext.js:
 * a file exporting both a component and a hook breaks Vite's Fast Refresh.
 */
export const DecksContext = createContext(null);

/**
 * Read the user's decks and every deck/card mutation.
 *
 * Named useDecksContext rather than useDecks so it doesn't collide with the
 * hooks/useDecks.js hook it wraps — that one still owns all the Amplify work
 * and is called exactly once, by DecksProvider.
 */
export function useDecksContext() {
  const context = useContext(DecksContext);
  if (!context) {
    throw new Error('useDecksContext must be used inside <DecksProvider>');
  }
  return context;
}
