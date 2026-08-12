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
  // Which tab, which Decks view, and whether the Add-to-Deck picker is open —
  // all from NavigationContext (see context/navigationReducer.js).
  const { activeTab, decksView, deckPickerTarget, setTab } = useNavigation();

  // Current auth state. `user` is set when signed in, undefined when not.
  // The dictionary works regardless; only the Decks tab uses this.
  const { user, signOut } = useAuthenticator((context) => [context.user]);
  const authed = !!user;

  // App only needs the load/error state now — every deck mutation is read from
  // DecksContext by the component that actually calls it.
  const { decks, isLoading, error, clearError } = useDecksContext();
  const selectedDeck = useSelectedDeck();

  const totalDueCount = decks.reduce(
    (sum, d) => sum + getCardsForReview(d.cards).length,
    0
  );

  // The `selectedDeck` guards stay: both views read the deck on their first
  // render, so neither may mount before one is chosen (or after it's deleted).
  const renderDecksContent = () => {
    if (decksView === 'study' && selectedDeck) return <StudySession />;
    if (decksView === 'detail' && selectedDeck) return <DeckDetail />;
    return <DeckList />;
  };

  // The Decks tab gates on login: logged-out users see the sign-in form;
  // logged-in users see their decks plus a sign-out control.
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
      {/* Bootstrap's responsive spacing utilities: `my-3` applies at every width,
          `my-md-5` overrides it from the md breakpoint (768px) up. So phones get
          tight spacing and desktop keeps the original roomier layout. Without
          this the brand block fills a whole phone screen before the search box. */}
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

        {/* Two of the three tabs are public; only Decks gates on login, which
            renderDecksTab handles for itself. */}
        {activeTab === 'dictionary' && <Query />}
        {activeTab === 'sentence' && <SentenceAnalyzer />}
        {activeTab === 'decks' && renderDecksTab()}

        {/* Rendered at app level so it can open from either tab; it reads what
            it's adding, and every deck it can add to, from the two contexts. */}
        {deckPickerTarget && <AddToDeckModal />}
      </div>
    </>
  );
}

export default App;
