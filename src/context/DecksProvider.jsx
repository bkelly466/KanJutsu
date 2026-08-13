import { useAuthenticator } from '@aws-amplify/ui-react';
import { DecksContext } from './decksContext';
import { useDecks } from '../hooks/useDecks';

/**
 * Makes the user's decks and every deck/card mutation available anywhere rather
 * than threading them through props.
 *
 * Calls useDecks exactly once, so there is still a single source of deck data
 * and a single load/refetch cycle.
 *
 * No useMemo around the value, deliberately: the only state here is useDecks'
 * own, so every re-render IS a real data change consumers need. Memoizing would
 * prevent nothing. It would matter if unrelated state shared this provider —
 * which is why navigation lives in its own.
 */
export function DecksProvider({ children }) {
  // The dictionary is public; decks require login. `authed` keeps useDecks from
  // querying AppSync, or holding stale data, while signed out.
  const { user } = useAuthenticator((context) => [context.user]);
  const decks = useDecks(!!user);

  return <DecksContext.Provider value={decks}>{children}</DecksContext.Provider>;
}
