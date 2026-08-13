import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react';
import './App.css';
import Query from './components/Query';
import SentenceAnalyzer from './components/SentenceAnalyzer';
import DeckList from './components/DeckList';
import DeckDetail from './components/DeckDetail';
import StudySession from './components/StudySession';
import AddToDeckModal from './components/AddToDeckModal';
import { useNavigation } from './context/navigationContext';
import { useDecksContext } from './context/decksContext';
import { useSelectedDeck } from './hooks/useSelectedDeck';
import { getCardsForReview } from './utils/srs';
import logo from './assets/logo.png'

function App() {
  // Which tab, which Decks view, and whether the picker is open. See
  // src/reducers/navigation.js.
  const { activeTab, decksView, deckPickerTarget, setTab } = useNavigation();

  // `user` is set when signed in, undefined when not. The dictionary works
  // either way; only the Decks tab reads this.
  const { user, signOut } = useAuthenticator((context) => [context.user]);
  const authed = !!user;

  // Load and error state only — every deck mutation is read from DecksContext
  // by the component that calls it.
  const { decks, isLoading, error, clearError } = useDecksContext();
  const selectedDeck = useSelectedDeck();

  const totalDueCount = decks.reduce(
    (sum, d) => sum + getCardsForReview(d.cards).length,
    0
  );

  // Both views read the deck on their first render, so neither may mount
  // before one is chosen, or after it's deleted.
  const renderDecksContent = () => {
    if (decksView === 'study' && selectedDeck) return <StudySession />;
    if (decksView === 'detail' && selectedDeck) return <DeckDetail />;
    return <DeckList />;
  };

  // The Decks tab gates on login: the sign-in form when logged out, the decks
  // plus a sign-out control when logged in.
  const renderDecksTab = () => {
    if (!authed) {
      return (
        <div className="text-center">
          <p className="text-muted mb-3">Log in to create and study flashcard decks.</p>
          <Authenticator />
        </div>
      );
    }
    return (
      <>
        {error && (
          <div className="alert alert-warning alert-dismissible d-flex justify-content-between align-items-center" role="alert">
            <span>{error}</span>
            <button type="button" className="btn-close" aria-label="Dismiss" onClick={clearError}></button>
          </div>
        )}
        <div className="d-flex justify-content-end align-items-center gap-2 mb-3">
          <span className="text-muted small">{user?.signInDetails?.loginId}</span>
          <button className="btn btn-sm btn-outline-secondary" onClick={signOut}>
            Sign out
          </button>
        </div>
        {isLoading && decks.length === 0 ? (
          <p className="text-muted text-center py-4">Loading your decks…</p>
        ) : (
          renderDecksContent()
        )}
      </>
    );
  };

  return (
    <>
      {/* `my-md-5` overrides `my-3` from the md breakpoint up: tight spacing on
          phones, where the brand block would otherwise fill the whole screen
          before the search box, and the roomier layout on desktop. */}
      <div className="container my-3 my-md-5 text-dark">
        <div className="brand-header text-center mb-4 mb-md-5">
          <div className="brand-badge-container mt-3 mt-md-5">
            <img src={logo} alt="Kanjutsu Logo" className="brand-logo-watermark" />
            <h1 className="brand-title">KanJutsu</h1>
          </div>
          <div className="brand-divider"></div>
        </div>

        {/* Tab navigation */}
        <ul className="nav nav-tabs mb-4">
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'dictionary' ? 'active text-dark fw-semibold' : 'text-muted'}`}
              onClick={() => setTab('dictionary')}
            >
              Dictionary
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'sentence' ? 'active text-dark fw-semibold' : 'text-muted'}`}
              onClick={() => setTab('sentence')}
            >
              Sentence
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'decks' ? 'active text-dark fw-semibold' : 'text-muted'}`}
              onClick={() => setTab('decks')}
            >
              My Decks
              {totalDueCount > 0 && (
                <span className="badge bg-danger ms-2" style={{ fontSize: '0.65rem' }}>
                  {totalDueCount}
                </span>
              )}
            </button>
          </li>
        </ul>

        {/* Only Decks gates on login, which renderDecksTab handles itself. */}
        {activeTab === 'dictionary' && <Query />}
        {activeTab === 'sentence' && <SentenceAnalyzer />}
        {activeTab === 'decks' && renderDecksTab()}

        {/* At app level so it can open from any tab, reading what it's adding
            and where it can go from the two contexts. */}
        {deckPickerTarget && <AddToDeckModal />}
      </div>
    </>
  );
}

export default App;
