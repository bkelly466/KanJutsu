import { useState } from 'react';
import './App.css';
import Query from './component/Query';
import DeckList from './component/DeckList';
import DeckDetail from './component/DeckDetail';
import StudySession from './component/StudySession';
import AddToDeckModal from './component/AddToDeckModal';
import { useDecks } from './Hooks/useDecks';
import logo from './assets/logo.png';

// View states for the "My Decks" tab
// 'list' | 'detail' | 'study'
function App() {
  const [activeTab, setActiveTab] = useState('dictionary');
  const [decksView, setDecksView] = useState('list');
  const [selectedDeckId, setSelectedDeckId] = useState(null);
  const [deckPickerKanji, setDeckPickerKanji] = useState(null);

  const {
    decks,
    createDeck,
    updateDeck,
    deleteDeck,
    addCardToDeck,
    removeCardFromDeck,
    updateCardSRS,
  } = useDecks();

  const selectedDeck = decks.find(d => d.id === selectedDeckId);

  const handleSelectDeck = (deckId) => {
    setSelectedDeckId(deckId);
    setDecksView('detail');
  };

  const handleStudy = () => setDecksView('study');

  const handleBackToList = () => {
    setDecksView('list');
    setSelectedDeckId(null);
  };

  const handleBackToDetail = () => setDecksView('detail');

  const handleOpenDeckPicker = (kanjiData) => {
    setDeckPickerKanji(kanjiData);
  };

  const handleAddToDeck = (deckId, kanjiData) => {
    addCardToDeck(deckId, kanjiData);
  };

  const renderDecksContent = () => {
    if (decksView === 'study' && selectedDeck) {
      return (
        <StudySession
          deck={selectedDeck}
          onUpdateCardSRS={updateCardSRS}
          onBack={handleBackToDetail}
        />
      );
    }
    if (decksView === 'detail' && selectedDeck) {
      return (
        <DeckDetail
          deck={selectedDeck}
          onBack={handleBackToList}
          onStudy={handleStudy}
          onRemoveCard={removeCardFromDeck}
        />
      );
    }
    return (
      <DeckList
        decks={decks}
        onCreateDeck={createDeck}
        onUpdateDeck={updateDeck}
        onDeleteDeck={deleteDeck}
        onSelectDeck={handleSelectDeck}
      />
    );
  };

  return (
    <>
      <div className="container my-5 text-dark">
        <div className="brand-header text-center mb-5">
          <div className="brand-badge-container">
            <img src={logo} alt="KanJutsu Logo" className="brand-logo-watermark" />
            <h1 className="brand-title">KanJutsu</h1>
          </div>
          <div className="brand-divider"></div>
        </div>

        {/* Tab navigation */}
        <ul className="nav nav-tabs mb-4">
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'dictionary' ? 'active text-dark fw-semibold' : 'text-muted'}`}
              onClick={() => setActiveTab('dictionary')}
            >
              Dictionary
            </button>
          </li>
          <li className="nav-item">
            <button
              className={`nav-link ${activeTab === 'decks' ? 'active text-dark fw-semibold' : 'text-muted'}`}
              onClick={() => setActiveTab('decks')}
            >
              My Decks
              {decks.reduce((acc, d) => {
                const due = d.cards.filter(c => new Date(c.nextReviewDate) <= new Date()).length;
                return acc + due;
              }, 0) > 0 && (
                <span className="badge bg-danger ms-2" style={{ fontSize: '0.65rem' }}>
                  {decks.reduce((acc, d) => {
                    return acc + d.cards.filter(c => new Date(c.nextReviewDate) <= new Date()).length;
                  }, 0)}
                </span>
              )}
            </button>
          </li>
        </ul>

        {activeTab === 'dictionary' ? (
          <Query onOpenDeckPicker={handleOpenDeckPicker} />
        ) : (
          renderDecksContent()
        )}

        {deckPickerKanji && (
          <AddToDeckModal
            decks={decks}
            kanjiData={deckPickerKanji}
            onAdd={handleAddToDeck}
            onCreateDeck={createDeck}
            onClose={() => setDeckPickerKanji(null)}
          />
        )}
      </div>
    </>
  );
}

export default App;
