import { useState } from 'react';
import { searchWords } from '../api/words';

/**
 * Drives a word (vocabulary) lookup: runs the search and exposes results plus
 * loading/error state for the UI to render.
 *
 * The search is word-first and accepts any text (English, kana, or kanji), so
 * there's no kanji-only validation here. Individual kanji are explored by
 * tapping them, which opens the kanji info overlay.
 */
export function useWordSearch() {
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // Set when the search that produced `results` used a different word than the
  // one typed — e.g. the user searched 飲んだ and we looked up 飲む. null
  // otherwise. See src/api/words.js.
  const [resolvedFrom, setResolvedFrom] = useState(null);

  /**
   * Run a search. Pass `{ allowDeinflection: false }` to look the query up
   * exactly as typed, skipping the 飲んだ → 飲む fallback — that's what the
   * "search X instead" link in the results banner uses.
   */
  const search = async (query, { allowDeinflection = true } = {}) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setError('Please enter a word to look up.');
      setResults([]);
      setResolvedFrom(null);
      return;
    }

    setError('');
    setResults([]);
    setResolvedFrom(null);
    setIsLoading(true);

    try {
      const { results: words, resolvedFrom: resolved } = await searchWords(trimmedQuery, {
        allowDeinflection,
      });
      setResults(words);
      setResolvedFrom(resolved);
      if (words.length === 0) {
        setError(`No words found for "${trimmedQuery}".`);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  };

  return { results, isLoading, error, resolvedFrom, search };
}
