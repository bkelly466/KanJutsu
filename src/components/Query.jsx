import { useState } from 'react';
import { useKanjiSearch } from '../hooks/useKanjiSearch';
import { useWordSearch } from '../hooks/useWordSearch';
import MiniKanjiCard from './MiniKanjiCard';
import DetailedInfoCard from './DetailedInfoCard';
import WordList from './WordList';
import WordDetailCard from './WordDetailCard';

// The two search modes. 'kanji' is the original single-character lookup;
// 'words' searches the Jisho vocabulary dictionary (English, kana, or kanji).
const MODES = {
  KANJI: 'kanji',
  WORDS: 'words',
};

export default function Query({ onOpenDeckPicker }) {
  const [mode, setMode] = useState(MODES.KANJI);
  const [query, setQuery] = useState('');

  // Each mode tracks its own "expanded" selection independently.
  const [expandedKanji, setExpandedKanji] = useState(null);
  const [expandedWordId, setExpandedWordId] = useState(null);

  // Two parallel hooks. We keep both alive so switching modes doesn't throw
  // away results you already fetched in the other mode.
  const kanji = useKanjiSearch();
  const words = useWordSearch();

  // Whichever hook is active drives the shared loading/error UI.
  const active = mode === MODES.KANJI ? kanji : words;

  const selectedKanjiData = kanji.results.find((k) => k.kanji === expandedKanji);
  const selectedWordData = words.results.find((w) => w.id === expandedWordId);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === MODES.KANJI) {
      setExpandedKanji(null);
      kanji.search(query);
    } else {
      setExpandedWordId(null);
      words.search(query);
    }
  };

  // Switch search mode. We clear the open detail card so we never show a stale
  // selection from the other mode, but we keep the typed query so the user can
  // re-run the same text in the new mode.
  const handleModeChange = (nextMode) => {
    if (nextMode === mode) return;
    setMode(nextMode);
    setExpandedKanji(null);
    setExpandedWordId(null);
  };

  /**
   * Called when the user clicks a kanji character inside any detail card
   * (kanji common-words list OR a word entry). It jumps to Kanji mode and runs
   * a fresh single-kanji lookup — the same path the search box uses.
   *
   * This is "lifting state up": the presentational cards signal intent via a
   * callback, and this component (which owns search + mode state) decides what
   * to do with it.
   */
  const handleKanjiClick = (char) => {
    setMode(MODES.KANJI);
    setQuery(char);
    setExpandedKanji(null);
    setExpandedWordId(null);
    kanji.search(char);
  };

  return (
    <>
      <div className="d-flex flex-column align-items-center text-center mb-4">
        {/* Mode toggle */}
        <div className="btn-group mb-3" role="group" aria-label="Search mode">
          <button
            type="button"
            className={`btn ${mode === MODES.KANJI ? 'btn-dark' : 'btn-outline-dark'}`}
            aria-pressed={mode === MODES.KANJI}
            onClick={() => handleModeChange(MODES.KANJI)}
          >
            Kanji
          </button>
          <button
            type="button"
            className={`btn ${mode === MODES.WORDS ? 'btn-dark' : 'btn-outline-dark'}`}
            aria-pressed={mode === MODES.WORDS}
            onClick={() => handleModeChange(MODES.WORDS)}
          >
            Words
          </button>
        </div>

        <form onSubmit={handleSubmit} className="w-100 d-flex gap-2">
          <input
            id="kanjiInput"
            className="form-control form-control-lg fs-6"
            type="text"
            placeholder={
              mode === MODES.KANJI
                ? 'Type kanji here...'
                : 'Search a word (English, kana, or kanji)...'
            }
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            id="searchButton"
            type="submit"
            className="btn btn-dark px-4"
            disabled={active.isLoading}
          >
            Search
          </button>
        </form>
      </div>

      {active.error && <div>{active.error}</div>}

      {active.isLoading ? (
        <div>
          <p>{mode === MODES.KANJI ? 'Kanji' : 'Word'} results loading...</p>
        </div>
      ) : mode === MODES.KANJI ? (
        kanji.results.length > 0 && (
          <div className="container">
            {/* Always show ALL mini cards in a scrollable row at the top */}
            <div
              className="d-flex flex-nowrap gap-3 pb-2 w-100"
              style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}
            >
              {kanji.results.map((kanjiData) => (
                <MiniKanjiCard
                  key={kanjiData.kanji}
                  kanjiData={kanjiData}
                  setExpandedKanji={setExpandedKanji}
                  expandedKanji={expandedKanji}
                />
              ))}
            </div>

            {/* Show the detailed card below the row when one is selected. */}
            {expandedKanji && (
              <DetailedInfoCard
                selectedData={selectedKanjiData}
                setExpandedKanji={setExpandedKanji}
                onOpenDeckPicker={onOpenDeckPicker}
                onKanjiClick={handleKanjiClick}
              />
            )}
          </div>
        )
      ) : (
        words.results.length > 0 && (
          <div className="container">
            {/* Detail card sits above the list when a word is selected. */}
            {expandedWordId && (
              <WordDetailCard
                wordData={selectedWordData}
                onClose={() => setExpandedWordId(null)}
                onKanjiClick={handleKanjiClick}
              />
            )}

            <WordList
              words={words.results}
              expandedWordId={expandedWordId}
              setExpandedWordId={setExpandedWordId}
            />
          </div>
        )
      )}
    </>
  );
}
