import { useDecksContext } from '../context/decksContext';
import { useNavigation } from '../context/navigationContext';

/**
 * The deck the Decks tab is currently pointed at, or undefined if none is open.
 *
 * Lives here rather than inside either context because it's derived from both:
 * the id comes from navigation, the data from decks. Composing two contexts in a
 * small custom hook keeps that join in one place instead of repeating the
 * `decks.find(...)` lookup in App, DeckDetail and StudySession.
 *
 * Looking the deck up fresh on every render also matters: useDecks refetches
 * after every mutation and rebuilds the array, so holding onto a deck object
 * would go stale the moment a card was edited.
 */
export function useSelectedDeck() {
  const { decks } = useDecksContext();
  const { selectedDeckId } = useNavigation();

  return decks.find((d) => d.id === selectedDeckId);
}
