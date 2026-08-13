/**
 * A cache for "look this string up over the network" — the shape every lookup
 * in this app turns out to need.
 *
 * It caches the **promise**, not the result. Two things fall out of that:
 *
 *   - Two taps that land before the first request resolves collapse into a
 *     single request, instead of racing.
 *   - A repeat lookup is free, but it is *not synchronous*: a `.then` on an
 *     already-resolved promise still can't run before the render that asked for
 *     it. So a component reading only the promise cache renders its loading
 *     state once regardless — a visible flash on every re-open.
 *
 * That second point is why there is a `peek`. A separate map holds the values
 * lookups have already **settled** on, readable during render, so a component
 * can mount straight into its final state instead of blinking through
 * "Loading…". `tokenLookup.js` hand-rolled both maps first (issue #22); this
 * module is that code lifted out so the kanji explorer gets it too (issue #37).
 *
 * Everything lives at module scope in the caller, so it survives components
 * unmounting. Dictionary entries don't change during a session, so there is
 * nothing to invalidate, and the maps are bounded by how many distinct words a
 * person can tap by hand.
 */

/**
 * Build a cache around `loader`, an async function of one string key.
 *
 * Returns `{ load, peek, clear }`:
 *
 *   - `load(key)`  the cached promise, starting the request if needed.
 *   - `peek(key)`  what `load` already settled on, or `undefined` if it never
 *                  has. **Safe to call during render** — it never starts a
 *                  request.
 *   - `clear()`    empty both maps. For tests; nothing in the app needs it.
 *
 * A rejected lookup is deliberately NOT cached — otherwise a single network
 * blip would make that key permanently un-lookupable for the rest of the
 * session, and a "Try again" button would do nothing. A *successful* lookup is
 * cached by default, including one that came back empty: "looked up, and
 * there's nothing" is a real answer plenty of words genuinely have, and it has
 * to stay cheap.
 *
 * `options.isCacheable(value)` narrows that default. Some answers are good
 * enough to show but not to keep — an entry whose optional half failed to load
 * is complete enough to render, and remembering it would turn one bad moment
 * into a permanent one. Return false and the value is still resolved to
 * everyone waiting on it; it just isn't remembered, so the next `load` asks
 * again. Called only on success, and a value it rejects is never `peek`able.
 */
export function createLookupCache(loader, { isCacheable = () => true } = {}) {
  /** key → in-flight-or-settled Promise. */
  const pending = new Map();
  /** key → the value that key's lookup settled on, for the keys where one has. */
  const settled = new Map();

  function load(key) {
    const cached = pending.get(key);
    if (cached) return cached;

    const promise = Promise.resolve()
      // Inside the promise chain so a loader that throws synchronously rejects
      // like any other failure, rather than blowing up the caller's render.
      .then(() => loader(key))
      .then((value) => {
        if (!isCacheable(value)) {
          // Good enough to return, not good enough to keep. Dropping the
          // promise too, so the next caller starts a fresh request rather than
          // re-resolving this one forever.
          pending.delete(key);
          return value;
        }
        // Record it synchronously-readable for peek() below.
        settled.set(key, value);
        return value;
      })
      .catch((error) => {
        pending.delete(key);
        throw error;
      });

    pending.set(key, promise);
    return promise;
  }

  function peek(key) {
    return settled.get(key);
  }

  function clear() {
    pending.clear();
    settled.clear();
  }

  return { load, peek, clear };
}
