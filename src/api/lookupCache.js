/**
 * A cache for "look this string up over the network" — the shape every lookup
 * in this app needs.
 *
 * It caches the **promise**, so two taps landing before the first request
 * resolves collapse into one request rather than racing. But a promise cache is
 * not a synchronous one: a `.then` on an already-resolved promise still can't
 * run before the render that asked for it, so a component reading only the
 * promise cache flashes its loading state on every re-open.
 *
 * Hence `peek`, backed by a second map of settled values that IS readable
 * during render.
 *
 * Callers hold the cache at module scope so it survives components unmounting.
 * Dictionary entries don't change during a session, so nothing needs
 * invalidating, and the maps are bounded by how many words a person can tap.
 */

/**
 * Build a cache around `loader`, an async function of one string key.
 *
 * Returns `{ load, peek, clear }`:
 *
 *   - `load(key)`  the cached promise, starting the request if needed.
 *   - `peek(key)`  what `load` already settled on, or `undefined`. **Safe
 *                  during render** — it never starts a request.
 *   - `clear()`    empty both maps. For tests; nothing in the app needs it.
 *
 * A rejected lookup is NOT cached, so a network blip can't make a key
 * permanently un-lookupable and leave a "Try again" button doing nothing. A
 * successful one is cached even when empty — "looked up, and there's nothing"
 * is a real answer that has to stay cheap.
 *
 * `options.isCacheable(value)` narrows that: return false and the value still
 * resolves to everyone waiting, but isn't remembered, so the next `load` asks
 * again. For answers good enough to show and not to keep — an entry whose
 * optional half failed to load would otherwise turn one bad moment into a
 * permanent one. Called only on success; a value it rejects is never `peek`able.
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
          // Drop the promise too, so the next caller starts a fresh request
          // instead of re-resolving this one forever.
          pending.delete(key);
          return value;
        }
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
