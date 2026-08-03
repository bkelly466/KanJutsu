import { useAuthenticator } from '@aws-amplify/ui-react';
import { DecksContext } from './decksContext';
import { useDecks } from '../hooks/useDecks';

/**
 * Makes the user's decks and every deck/card mutation available anywhere,
 * instead of threading them down as props.
 *
 * This calls useDecks once — exactly as App.jsx used to — so there is still a
 * single source of deck data and a single load/refetch cycle. What changes is
 * only who can reach it: DeckDetail used to take eight props and forward five
 * of them untouched to CardDetailModal, purely because it sat in between.
 *
 * Note there's no useMemo around the value. The only state this provider holds
 * is useDecks' own, so every re-render here *is* a real data change that
 * consumers need to see. Memoizing would add ceremony and prevent nothing.
 * (It would matter if unrelated state shared this provider — which is exactly
 * why navigation lives in a separate one.)
 */
export function DecksProvider({ children }) {
  // The dictionary is public; decks require login. Passing `authed` keeps
  // useDecks from querying AppSync (and from holding stale data) when signed out.
  const { user } = useAuthenticator((context) => [context.user]);
  const decks = useDecks(!!user);

  return <DecksContext.Provider value={decks}>{children}</DecksContext.Provider>;
}
