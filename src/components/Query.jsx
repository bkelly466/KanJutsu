import { useState } from 'react';
import { useWordSearch } from '../hooks/useWordSearch';
import WordList from './WordList';
import WordDetailCard from './WordDetailCard';
import KanjiInfoModal from './KanjiInfoModal';

// The Dictionary search is word-first: every search returns vocabulary results.
// Individual kanji are explored by tapping them, which opens a Pleco-style
// overlay (KanjiInfoModal) — keeping the user's word results in place behind it.
export default function Query({ onOpenDeckPicker }) {
  const [query, setQuery] = useState('');
  const [expandedWordId, setExpandedWordId] = useState(null);

  // When set, the kanji explorer overlay is open on this character.
  const [kanjiModalChar, setKanjiModalChar] = useState(null);

  const { results, isLoading, error, search } = useWordSearch();
  const selectedWordData = results.find((w) => w.id === expandedWordId);

  const handleSubmit = (e) => {
    e.preventDefault();
    setExpandedWordId(null);
    search(query);
  };

  // Tapping a kanji — in a word's headword or inside the overlay's common-words
  // list — opens the explorer for that character.
  const handleKanjiClick = (char) => setKanjiModalChar(char);

  return (
    <>
      <div className="d-flex flex-column align-items-center text-center mb-4">
        <form onSubmit={handleSubmit} className="w-100 d-flex gap-2">
          <input
            id="kanjiInput"
            className="form-control form-control-lg fs-6"
            type="text"
            placeholder="Search a word (English, kana, or kanji)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            id="searchButton"
            type="submit"
            className="btn btn-dark px-4"
            disabled={isLoading}
          >
            Search
          </button>
        </form>
      </div>

      {/* Errors and "no results" share one muted, centered style — matching
          the loading/empty states used elsewhere in the app. */}
      {error && <p className="text-muted text-center py-3">{error}</p>}

      {isLoading ? (
        <p className="text-muted text-center py-3">Word results loading…</p>
      ) : (
        results.length > 0 && (
          <div className="container">
            {/* Detail card sits above the list when a word is selected. */}
            {expandedWordId && (
              <WordDetailCard
                wordData={selectedWordData}
                onClose={() => setExpandedWordId(null)}
                onKanjiClick={handleKanjiClick}
                onOpenDeckPicker={onOpenDeckPicker}
              />
            )}

            <WordList
              words={results}
              expandedWordId={expandedWordId}
              setExpandedWordId={setExpandedWordId}
            />
          </div>
        )
      )}

      {/* Pleco-style kanji explorer, layered on top of the word results. */}
      {kanjiModalChar && (
        <KanjiInfoModal
          initialKanji={kanjiModalChar}
          onClose={() => setKanjiModalChar(null)}
          onOpenDeckPicker={onOpenDeckPicker}
        />
      )}
    </>
  );
}
