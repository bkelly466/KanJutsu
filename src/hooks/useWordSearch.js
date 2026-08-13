import { useState } from 'react';
import { searchWords } from '../api/words';
import { useLookup } from './useLookup';

/**
 * Drives a word (vocabulary) lookup: runs the search and exposes results plus
 * loading/error state for the UI to render.
 *
 * The search is word-first and accepts any text (English, kana, or kanji), so
 * there's no kanji-only validation here. Individual kanji are explored by
 * tapping them, which opens the kanji info overlay.
 *
 * Built on `useLookup`, which is what gives this the cancellation it lacked:
 * search 犬, then 猫 before the first request lands, and 犬's results can no
 * longer arrive last and overwrite 猫's (with `resolvedFrom` describing the
 * wrong search). See src/hooks/useLookup.js.
 *
 * Deliberately NOT cached, unlike the Token and kanji lookups. Those are keyed
 * by a word from a fixed sentence or a character on screen; this takes free
 * text, so the key space is unbounded — and pressing Search again on the same
 * word should re-ask, not replay.
 */
export function useWordSearch() {
  // The search being shown. `null` before the first one — that's the idle
  // state, and it's why the page doesn't start out loading.
  //
  // `attempt` is what makes searching the same word twice re-run: the key below
  // is built from this whole object, and an identical key would otherwise look
  // to useLookup like nothing had changed.
  const [request, setRequest] = useState(null);

  // A query with nothing in it never becomes a request, so this is a message
  // about the input rather than about a lookup. Kept separate from useLookup's
  // error and merged back in on the way out.
  const [inputError, setInputError] = useState('');

  // `retry` is deliberately not passed on: the Search button is already on
  // screen and pressing it again re-runs the search (that's what `attempt` is
  // for), so a second retry control would be one button too many.
  const { data, isLoading, error } = useLookup(
    request && `${request.attempt} ${request.allowDeinflection} ${request.query}`,
    () => searchWords(request.query, { allowDeinflection: request.allowDeinflection })
  );

  /**
   * Run a search. Pass `{ allowDeinflection: false }` to look the query up
   * exactly as typed, skipping the 飲んだ → 飲む fallback — that's what the
   * "search X instead" link in the results banner uses.
   *
   * Returns immediately; there is nothing to await. The results arrive through
   * `results` / `isLoading` on a later render.
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
    // settled answer rather than a failure, but it has always been shown in
    // this same slot and reads correctly there.
    error:
      inputError ||
      error ||
      // `request?`, not `request.`: clearing the box sets `request` to null
      // while `data` still holds the previous search for one discarded render.
      // The `||` above short-circuits before this today, which is luck rather
      // than design.
      (data && results.length === 0 ? `No words found for "${request?.query}".` : ''),
    // Set when the search that produced `results` used a different word than
    // the one typed — e.g. the user searched 飲んだ and we looked up 飲む. null
    // otherwise. See src/api/words.js.
    resolvedFrom: data?.resolvedFrom ?? null,
    search,
  };
}
