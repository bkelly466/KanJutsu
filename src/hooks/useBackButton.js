import { useEffect, useRef } from 'react';

/**
 * Makes the device Back button (Android's back gesture, iOS swipe-back) close
 * the topmost overlay instead of leaving the app.
 *
 * The app has no router — every view is React state in App.jsx — so the browser
 * has only one history entry for the whole session. Pressing Back from an open
 * kanji explorer or a study session therefore exits KanJutsu entirely, which is
 * jarring on a phone.
 *
 * The fix: while any overlay is open, keep one throwaway entry on the history
 * stack. Back pops that entry instead of leaving, and we close the overlay in
 * response. When the last overlay closes normally (X button, Escape, backdrop),
 * we remove the entry again so Back doesn't silently do nothing.
 *
 * Usage:
 *   useBackButton(isOpen, onClose);
 *
 * ---------------------------------------------------------------------------
 * Why the shared module-level state below, instead of each hook call managing
 * its own history entry?
 *
 * Because React unmounts and mounts components in the same commit. Going from
 * the deck detail view into a study session unmounts DeckDetail and mounts
 * StudySession together; the AddToDeck modal likewise *replaces* itself with
 * the CreateDeck modal. If each call pushed on mount and popped on unmount,
 * those swaps would pop the entry the newly-mounted overlay had just pushed —
 * and the new overlay would close itself immediately.
 *
 * So all callers share one entry, and the push/pop is deferred to a microtask.
 * A swap settles to "still one overlay open" before history is touched, and
 * nothing happens at all. This also makes the hook safe under React's
 * StrictMode, which deliberately runs mount → cleanup → mount in development.
 */

// Close handlers for every currently-open overlay, oldest first. The last one
// is the topmost overlay — the one Back should close.
const handlers = [];

// Whether our throwaway history entry is currently on the stack.
let entryPushed = false;

// Guards against scheduling more than one sync per tick.
let syncScheduled = false;

/**
 * Reconciles the history stack with how many overlays are open. Deferred to a
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
      // An empty-ish state object we can recognise; the URL is left unchanged.
      window.history.pushState({ kanjutsuOverlay: true }, '');
    } else if (!wantEntry && entryPushed) {
      entryPushed = false;
      // The last overlay was closed by other means (X, Escape, backdrop), so
      // our entry is stale. Remove it — otherwise the user's next Back press
      // would consume it and appear to do nothing.
      window.history.back();
    }
  });
}

/**
 * Runs when the browser pops our entry — i.e. the user pressed Back.
 */
function handlePopState() {
  // The browser has already removed the entry for us.
  entryPushed = false;

  const topmost = handlers[handlers.length - 1];
  if (topmost) topmost();

  // Closing that overlay unregisters its handler and triggers another sync. If
  // an overlay is still open underneath (e.g. a modal over the deck detail
  // view), that sync pushes a fresh entry so the next Back works too.
}

export function useBackButton(isActive, onBack) {
  // Callers usually pass an inline arrow (`onClose={() => setThing(null)}`),
  // which is a new function every render. Holding it in a ref means the effect
  // below depends only on `isActive`, so it doesn't tear down and re-register
  // — and re-push history — on every render.
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
