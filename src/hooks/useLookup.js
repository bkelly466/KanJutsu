import { useState, useRef, useEffect } from 'react';

/**
 * One async lookup lifecycle, shared by every surface that has one.
 *
 * The Token overlay, the kanji explorer and the Dictionary search were each
 * hand-rolling the same five things — a cancel flag, a loading flag, an error
 * string, a retry, and a peek at the cache — and the copies had already drifted:
 * only the Token overlay had the last two, so the kanji explorer offered no way
 * to recover from a failed fetch and blinked through "Loading 食…" every time
 * you pressed Back (issue #37).
 *
 * Usage:
 *
 *   const { data, isLoading, error, retry } = useLookup(
 *     char,                        // the subject; null means "nothing to look up yet"
 *     () => fetchKanjiEntry(char), // how to load it
 *     () => peekKanjiEntry(char),  // optional: what the cache already knows
 *   );
 *
 * `data` is whatever `load` resolved with, uninterpreted. This hook has no
 * opinion about whether an empty result is an error — "no dictionary entry for
 * 山田" and "no words found for xyzzy" read differently and belong to the
 * component, not here.
 *
 * @param key   Identifies what's being looked up. Changing it starts a fresh
 *              lookup and throws away the old one's result; `null` means idle
 *              (no request, not loading).
 * @param load  Called with no arguments; returns a Promise of the data. May
 *              close over anything from the current render.
 * @param peek  Optional. Returns what's already known for `key` without making
 *              a request, or `undefined` if nothing is. Must be safe to call
 *              during render. This is what lets a cached lookup mount straight
 *              into its final state instead of flashing a spinner.
 */
export function useLookup(key, load, peek) {
  // What a lookup for `key` starts as: whatever the cache can tell us right
  // now, else loading. Idle when there's no key.
  //
  // `undefined` from peek means "not known"; any other value — including null
  // or an empty array — is a real answer the lookup already settled on.
  function initialState(forKey) {
    if (forKey === null || forKey === undefined) {
      return { data: null, isLoading: false, error: '' };
    }
    const known = peek?.();
    if (known === undefined) return { data: null, isLoading: true, error: '' };
    return { data: known, isLoading: false, error: '' };
  }

  // The lazy initialiser form: the function runs only on the first render.
  // Passing initialState(key) directly would re-read the cache on every render
  // to build a value React throws away.
  const [state, setState] = useState(() => initialState(key));

  // Bumped by retry() to re-run the effect below on an unchanged key.
  const [attempt, setAttempt] = useState(0);

  // Resetting to loading when the key changes happens HERE, during render,
  // rather than in an effect. Two reasons:
  //
  //   1. Setting state in an effect body is banned (ESLint
  //      react-hooks/set-state-in-effect) because an effect runs after paint —
  //      the user would see one frame of the *previous* kanji's data under the
  //      new heading. React's documented fix is exactly this: compare the key
  //      to the one the last render used, and set state right here. React
  //      re-runs the render immediately, before anything reaches the screen.
  //
  //   2. It re-reads the cache on every key change, not just on mount. That's
  //      what makes drilling 食 → 米 and pressing Back instant.
  //
  // The condition matters: an unguarded setState during render is an infinite
  // loop. This one can only fire on the render where the key actually changed.
  const [renderedKey, setRenderedKey] = useState(key);
  if (key !== renderedKey) {
    setRenderedKey(key);
    setState(initialState(key));
  }

  // `load` is a fresh closure on every render, so it can't go in the effect's
  // dependency list — the effect would re-run (and re-request) constantly.
  // Instead we keep the latest one in a ref. This effect is declared *before*
  // the fetch effect on purpose: effects run in declaration order, so the ref
  // is always up to date by the time the fetch effect reads it.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    // Idle: nothing to look up.
    if (key === null || key === undefined) return;

    let cancelled = false;

    // Note this fires even when the peek above already answered. Every caller
    // that supplies a peek is backed by a cache, so that's a free promise
    // rather than a second request — and the alternative (skipping the load
    // when we already have data) would mean the cache and the hook disagreeing
    // about who decides when a request happens.
    Promise.resolve()
      // Inside the chain so a `load` that throws synchronously becomes an error
      // state rather than an exception escaping the effect.
      .then(() => loadRef.current())
      .then((value) => {
        if (cancelled) return;
        setState((previous) =>
          // Returning the previous state object tells React nothing changed, so
          // it skips the re-render. Worth it because the common case here is a
          // cache hit confirming what peek already put on screen.
          !previous.isLoading && !previous.error && previous.data === value
            ? previous
            : { data: value, isLoading: false, error: '' }
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ data: null, isLoading: false, error: err.message || 'Something went wrong.' });
      });

    // The subject changed, or the component went away, before this resolved.
    // Without this the older request can land last and overwrite the newer
    // one's results.
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  /**
   * Run the lookup again after a failure. Only useful when the cache doesn't
   * keep failures (none of ours do — see api/lookupCache.js), which is what
   * makes this a real retry rather than a re-read of the same error.
   */
  const retry = () => {
    setState({ data: null, isLoading: true, error: '' });
    setAttempt((previous) => previous + 1);
  };

  return { data: state.data, isLoading: state.isLoading, error: state.error, retry };
}
