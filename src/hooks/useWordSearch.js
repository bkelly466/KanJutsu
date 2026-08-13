import { useState } from 'react';
import { searchWords } from '../api/words';
import { useLookup } from './useLookup';

/**
 * Drives a word (vocabulary) lookup — the search plus the results, loading and
 * error state the UI renders.
 *
 * Accepts any text (English, kana, or kanji), so there's no validation here.
 * Individual kanji are explored by tapping them instead.
 *
 * Built on `useLookup` for its cancellation: search 犬, then 猫 before the first
 * lands, and 犬's results can no longer arrive last and overwrite 猫's with a
 * `resolvedFrom` describing the wrong search.
 *
 * NOT cached, unlike the Token and kanji lookups. Those are keyed by a word in
 * a fixed sentence or a character on screen; this takes free text, so the key
 * space is unbounded — and pressing Search again should re-ask, not replay.
 */
export function useWordSearch() {
  // The search being shown; `null` is the idle state, which is why the page
  // doesn't start out loading. `attempt` is what makes searching the same word
  // twice re-run — the key below is built from this whole object, and an
  // identical key would look to useLookup like nothing had changed.
  const [request, setRequest] = useState(null);

  // An empty query never becomes a request, so this is a message about the
  // input rather than a lookup. Merged back into one error on the way out.
  const [inputError, setInputError] = useState('');

  // `retry` is deliberately not passed on: the Search button already re-runs
  // the search, so a second retry control would be one button too many.
  const { data, isLoading, error } = useLookup(
    request && `${request.attempt} ${request.allowDeinflection} ${request.query}`,
    () => searchWords(request.query, { allowDeinflection: request.allowDeinflection })
  );

  /**
   * Run a search. `{ allowDeinflection: false }` looks the query up exactly as
   * typed, skipping the 飲んだ → 飲む fallback — what the "search X instead"
   * link uses.
   *
   * Returns immediately; results arrive through `results` / `isLoading` on a
   * later render.
   */
  const search = (query, { allowDeinflection = true } = {}) => {
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setInputError('Please enter a word to look up.');
      setRequest(null);
      return;
    }

    setInputError('');
    setRequest((previous) => ({
      query: trimmedQuery,
      allowDeinflection,
      attempt: (previous?.attempt ?? 0) + 1,
    }));
  };

  const results = data?.results ?? [];

  return {
    results,
    isLoading,
    // One string for the UI, whichever went wrong. "No words found" is a
    // settled answer rather than a failure, but it reads correctly in this slot.
    error:
      inputError ||
      error ||
      // `request?`, not `request.`: clearing the box sets `request` to null
      // while `data` still holds the previous search for one discarded render.
      // The `||` above short-circuits before this today, by luck not design.
      (data && results.length === 0 ? `No words found for "${request?.query}".` : ''),
    // The word actually searched, when it differs from the one typed — 飲んだ
    // looked up as 飲む. null otherwise. See src/api/words.js.
    resolvedFrom: data?.resolvedFrom ?? null,
    search,
  };
}
