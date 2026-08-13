import { useDecksContext } from '../context/decksContext';
import { useNavigation } from '../context/navigationContext';

/**
 * The deck the Decks tab is pointed at, or undefined when none is open.
 *
 * Outside either context because it's derived from both — the id from
 * navigation, the data from decks — which keeps the `decks.find(...)` join out
 * of App, DeckDetail and StudySession.
 *
 * Looked up fresh every render on purpose: useDecks rebuilds the array after
 * every mutation, so a held deck object goes stale the moment a card is edited.
 */
export function useSelectedDeck() {
  const { decks } = useDecksContext();
  const { selectedDeckId } = useNavigation();

  return decks.find((d) => d.id === selectedDeckId);
}
