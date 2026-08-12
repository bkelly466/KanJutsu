import { useState } from 'react';
import { useWordSearch } from '../hooks/useWordSearch';
import WordList from './WordList';
import WordDetailCard from './WordDetailCard';
import KanjiInfoModal from './KanjiInfoModal';

// The Dictionary search is word-first: every search returns vocabulary results.
// Individual kanji are explored by tapping them, which opens a Pleco-style
// overlay (KanjiInfoModal) — keeping the user's word results in place behind it.
export default function Query() {
  const [query, setQuery] = useState('');
  const [expandedWordId, setExpandedWordId] = useState(null);

  // When set, the kanji explorer overlay is open on this character.
  const [kanjiModalChar, setKanjiModalChar] = useState(null);

  const { results, isLoading, error, resolvedFrom, search } = useWordSearch();
  const selectedWordData = results.find((w) => w.id === expandedWordId);

  const handleSubmit = (e) => {
    e.preventDefault();
    setExpandedWordId(null);
    search(query);
  };

  // "Search 飲んだ instead" — re-run the search literally, without the
  // conjugated-form fallback, so a substitution can always be undone.
  const handleExactSearch = (surfaceForm) => {
    setExpandedWordId(null);
    setQuery(surfaceForm);
    search(surfaceForm, { allowDeinflection: false });
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
          // Plain div, not `.container` — this sits inside App's own
          // `.container`, and nesting them double-applies Bootstrap's gutter
          // padding, which visibly narrows results on a phone.
          <div>
            {/* When the typed word was a conjugated form, say so rather than
                silently swapping it. The dictionary form is the one a learner
                needs to memorise, so showing it is part of the answer. */}
            {resolvedFrom && (
              <div className="text-center py-2 mb-2">
                <p className="text-muted mb-1">
                  Showing results for <strong lang="ja">{resolvedFrom.headword}</strong>
                  {' — '}
                  <span lang="ja">{resolvedFrom.surfaceForm}</span> may be a form of it.
                </p>
                {/* The escape hatch, on its own line directly under the hedge.
                    We can't guarantee every substitution is right — Japanese has
                    plenty of words that merely look like conjugations — so
                    getting back to the literal search is always one tap away. */}
                <button
                  type="button"
                  className="btn btn-link p-0"
                  onClick={() => handleExactSearch(resolvedFrom.surfaceForm)}
                >
                  Search <span lang="ja">{resolvedFrom.surfaceForm}</span> instead
                </button>
              </div>
            )}

            {/* Detail card sits above the list when a word is selected. */}
            {expandedWordId && (
              <WordDetailCard
                wordData={selectedWordData}
                onClose={() => setExpandedWordId(null)}
                onKanjiClick={handleKanjiClick}
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
        />
      )}
    </>
  );
}
