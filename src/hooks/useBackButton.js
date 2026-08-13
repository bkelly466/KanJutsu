import { useEffect, useRef } from 'react';

/**
 * Makes the device Back button close the topmost overlay instead of leaving the
 * app. Call as `useBackButton(isOpen, onClose)`.
 *
 * The app has no router — every view is React state — so the session has one
 * history entry, and Back from an open overlay exits KanJutsu entirely. So
 * while any overlay is open, one throwaway entry sits on the history stack:
 * Back pops that instead of leaving. Closing the last overlay by other means
 * (X, Escape, backdrop) removes the entry again, or the next Back would consume
 * it and appear to do nothing.
 *
 * **The state below is module-level, and shared, deliberately.** React unmounts
 * and mounts in the same commit — deck detail → study session, AddToDeck →
 * CreateDeck — so per-call entries would have each swap pop the entry the
 * incoming overlay had just pushed, closing it immediately. One shared entry
 * plus a microtask-deferred push/pop means a swap settles to "still one overlay
 * open" before history is touched. That also makes this safe under StrictMode,
 * which runs mount → cleanup → mount in development.
 */

// Close handlers for every currently-open overlay, oldest first. The last one
// is the topmost overlay — the one Back should close.
const handlers = [];

// Whether our throwaway history entry is currently on the stack.
let entryPushed = false;

// Guards against scheduling more than one sync per tick.
let syncScheduled = false;

/**
 * Reconcile the history stack with how many overlays are open. Deferred to a
 * microtask so a mount/unmount swap nets out to no change.
 */
function scheduleSync() {
  if (syncScheduled) return;
  syncScheduled = true;

  queueMicrotask(() => {
    syncScheduled = false;
    const wantEntry = handlers.length > 0;

    if (wantEntry && !entryPushed) {
      entryPushed = true;
      // A recognisable state object; the URL is left unchanged.
      window.history.pushState({ kanjutsuOverlay: true }, '');
    } else if (!wantEntry && entryPushed) {
      entryPushed = false;
      window.history.back();
    }
  });
}

/** The user pressed Back, and the browser has already removed our entry. */
function handlePopState() {
  entryPushed = false;

  const topmost = handlers[handlers.length - 1];
  if (topmost) topmost();

  // Closing it unregisters its handler and triggers another sync, which pushes
  // a fresh entry if an overlay is still open underneath — so the next Back
  // works too.
}

export function useBackButton(isActive, onBack) {
  // Callers pass an inline arrow, which is a new function every render. A ref
  // keeps the effect below depending only on `isActive`, so it doesn't tear
  // down, re-register and re-push history on every render.
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  });

  useEffect(() => {
    if (!isActive) return;

    const handler = () => onBackRef.current();
    handlers.push(handler);
    if (handlers.length === 1) {
      window.addEventListener('popstate', handlePopState);
    }
    scheduleSync();

    return () => {
      const index = handlers.indexOf(handler);
      if (index !== -1) handlers.splice(index, 1);
      if (handlers.length === 0) {
        window.removeEventListener('popstate', handlePopState);
      }
      scheduleSync();
    };
  }, [isActive]);
}
