import { useState } from 'react';
import { searchWords } from '../api/words';

/**
 * Drives a word (vocabulary) lookup: runs the search and exposes results plus
 * loading/error state for the UI to render.
 *
 * This mirrors useKanjiSearch on purpose so the two search modes feel the same
 * to the components that use them. The main difference: a word search accepts
 * any text (English, kana, or kanji), so there's no kanji-only validation here.
 */
export function useWordSearch() {
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const search = async (query) => {
    if (!query.trim()) {
      setError('Please enter a word to look up.');
      setResults([]);
      return;
    }

    setError('');
    setResults([]);
    setIsLoading(true);

    try {
      const words = await searchWords(query);
      setResults(words);
      if (words.length === 0) {
        setError(`No words found for "${query.trim()}".`);
      }
    } catch (err) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  };

  return { results, isLoading, error, search };
}
