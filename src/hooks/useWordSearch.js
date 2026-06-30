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

  const search = async (query) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setError('Please enter a word to look up.');
      setResults([]);
      return;
    }

    setError('');
    setResults([]);
    setIsLoading(true);

    try {
      const words = await searchWords(trimmedQuery);
      setResults(words);
      if (words.length === 0) {
        setError(`No words found for "${trimmedQuery}".`);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  };

  return { results, isLoading, error, search };
}
