import { useState, useRef, useEffect } from 'react';

/**
 * One async lookup lifecycle — loading, error, cancellation, retry, and a peek
 * at the cache — shared by the Token overlay, the kanji explorer and the
 * Dictionary search.
 *
 *   const { data, isLoading, error, retry } = useLookup(
 *     char,                        // the subject; null means nothing to look up
 *     () => fetchKanjiEntry(char), // how to load it
 *     () => peekKanjiEntry(char),  // optional: what the cache already knows
 *   );
 *
 * `data` is whatever `load` resolved with, uninterpreted. Whether an empty
 * result reads as an error belongs to the component — "no dictionary entry for
 * 山田" and "no words found for xyzzy" are different sentences.
 *
 * @param key   What's being looked up. Changing it starts a fresh lookup and
 *              discards the old one's result; `null` is idle.
 *
 *              Two rules, both load-bearing. **It must be a primitive**,
 *              because it's compared with `!==` during render and an object
 *              rebuilt each render would loop forever. **It must name every
 *              input `load` reads** — `load` lives in a ref and the lookup
 *              re-runs on the key alone, so anything the key doesn't mention is
 *              silently ignored when it changes, and no lint rule catches it.
 * @param load  Takes no arguments, returns a Promise of the data. May close
 *              over the current render's values, subject to the key rule.
 * @param peek  Optional. What's already known for `key`, or `undefined`. Must
 *              be safe during render — this is what lets a cached lookup mount
 *              in its final state instead of flashing a spinner.
 */
export function useLookup(key, load, peek) {
  // Whatever the cache can answer right now, else loading; idle with no key.
  // `undefined` from peek means "not known"; anything else — including null or
  // an empty array — is a real answer the lookup already settled on.
  function initialState(forKey) {
    if (forKey === null || forKey === undefined) {
      return { data: null, isLoading: false, error: '' };
    }
    const known = peek?.();
    if (known === undefined) return { data: null, isLoading: true, error: '' };
    return { data: known, isLoading: false, error: '' };
  }

  // Lazy initialiser form, so the cache is read once rather than on every
  // render to build a value React discards.
  const [state, setState] = useState(() => initialState(key));

  // Bumped by retry() to re-run the effect below on an unchanged key.
  const [attempt, setAttempt] = useState(0);

  // The key-change reset happens during render, not in an effect. An effect
  // runs after paint, so the user would see one frame of the previous kanji's
  // data under the new heading — and setting state in an effect body is banned
  // (react-hooks/set-state-in-effect) for that reason. It also re-reads the
  // cache on every key change rather than only on mount, which is what makes
  // drilling 食 → 米 and pressing Back instant.
  //
  // The condition is what keeps this from being an infinite loop: it can only
  // fire on the render where the key actually changed.
  const [renderedKey, setRenderedKey] = useState(key);
  if (key !== renderedKey) {
    setRenderedKey(key);
    setState(initialState(key));
  }

  // `load` is a fresh closure every render, so listing it as a dependency would
  // re-request constantly; a ref holds the latest instead. Declared BEFORE the
  // fetch effect deliberately — effects run in declaration order, so the ref is
  // current by the time the fetch effect reads it.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    if (key === null || key === undefined) return;

    let cancelled = false;

    // Runs even when peek already answered. Every caller supplying a peek is
    // cache-backed, so this is a free promise rather than a second request, and
    // skipping it would leave the cache and the hook disagreeing about who
    // decides when a request happens.
    Promise.resolve()
      // Inside the chain, so a `load` that throws synchronously becomes an
      // error state rather than an exception escaping the effect.
      .then(() => loadRef.current())
      .then((value) => {
        if (cancelled) return;
        setState((previous) =>
          // Returning the previous object skips the re-render — the common case
          // being a cache hit confirming what peek already put on screen.
          // Identity, not equality: true for the kanji explorer, whose cache
          // hands back the same object twice, and not for the Token overlay,
          // which builds a fresh one and takes a harmless extra render.
          !previous.isLoading && !previous.error && previous.data === value
            ? previous
            : { data: value, isLoading: false, error: '' }
        );
      })
      .catch((err) => {
        if (cancelled) return;
        setState({ data: null, isLoading: false, error: err.message || 'Something went wrong.' });
      });

    // Without this, an older request that lands last overwrites a newer one's
    // results.
    return () => {
      cancelled = true;
    };
  }, [key, attempt]);

  /**
   * Run the lookup again after a failure. A real retry rather than a re-read of
   * the same error only because no cache here keeps failures — see
   * api/lookupCache.js.
   */
  const retry = () => {
    // Going to `isLoading` while idle would strand the caller on a spinner: the
    // effect returns early, so nothing would ever clear it.
    if (key === null || key === undefined) return;

    setState({ data: null, isLoading: true, error: '' });
    setAttempt((previous) => previous + 1);
  };

  return { data: state.data, isLoading: state.isLoading, error: state.error, retry };
}
