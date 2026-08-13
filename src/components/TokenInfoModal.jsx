import { useState, useEffect } from 'react';
import { resolveToken, peekResolvedToken, pickPrimaryEntry } from '../api/tokenLookup';
import { renderWithClickableKanji } from '../utils/clickableKanji';
import { extractKanji } from '../api/kanji';
import { useNavigation } from '../context/navigationContext';
import EntryBody from './EntryBody';
import Modal from './Modal';

/**
 * The payoff of the Sentence tab: tap a Token, see the Entry it resolves to.
 *
 * Built on the shared Modal so the Sentence stays visible (and unscrolled)
 * behind it and the device Back button closes the overlay rather than leaving
 * the app — no back-button code of its own. See src/components/Modal.jsx.
 *
 * Two things here are deliberate rather than incidental:
 *
 *   - **The Surface form leads, the Headword follows.** 飲んだ is what the
 *     learner tapped and needs to recognise in the sentence; 飲む is what they
 *     need to memorise. Showing only one of them loses half the lesson, so when
 *     they differ both appear, with the arrow between them.
 *
 *   - **A Token with no Entry is not a dead end.** Names, slang and anything
 *     IPADIC didn't recognise still open the overlay, still say plainly that
 *     there's no entry, and still offer their kanji for drilling — 山田 has no
 *     dictionary entry, but 山 and 田 do. And a merged compound the dictionary
 *     doesn't carry falls back to the word it was built from: tap 東京駅, get
 *     東京, with both words named on screen so the relationship is visible
 *     rather than a silent substitution (issue #30).
 *
 *   - **"Add to Deck" closes the loop.** A Token that resolved to an Entry can
 *     go straight into a Deck, which is the whole point of the Sentence tab
 *     existing alongside the flashcards. It builds the *same* word card the
 *     Dictionary tab builds — same shape, same dedupe key, same SRS defaults —
 *     because both routes end in openDeckPicker(entry, 'word'). The Sentence it
 *     came from is deliberately NOT carried onto the card (see issue #22).
 *
 * Props:
 *   token          - the Token that was tapped: { surface, baseForm, isUnknown }
 *   onClose        - dismiss the overlay
 *   onKanjiClick   - called with a single kanji character; the Sentence tab
 *                    swaps this overlay for the kanji explorer (SentenceAnalyzer)
 *   selectedId     - id of the entry the user chose from "Other entries", or
 *                    null for the best match. Owned by SentenceAnalyzer because
 *                    it has to survive this component unmounting: drilling a
 *                    kanji swaps the overlay out and back, and a choice the user
 *                    made shouldn't be quietly undone by that.
 *   onSelectEntry  - called with an entry id when the user picks one
 */

/**
 * How many alternative entries to offer. Jisho can return twenty results for a
 * common word; past a handful the list stops being a choice and becomes a wall,
 * and the Dictionary tab is the right place for an exhaustive search.
 */
const MAX_ALTERNATIVES = 5;

export default function TokenInfoModal({
  token,
  onClose,
  onKanjiClick,
  selectedId,
  onSelectEntry,
}) {
  const lemma = token.baseForm;
  // The lemma this Token was built from, for the one case where the merged
  // lookup finds nothing (東京駅 → 東京). null on almost every Token; chunk.js
  // sets it only where a derivational suffix was absorbed.
  const fallbackLemma = token.fallbackBaseForm;

  // Same source as WordDetailCard's "Add to Deck": the picker is rendered up in
  // App.jsx, and this is how you ask it to open. A signed-out user is sent to
  // the Decks tab (where the login form lives) instead — that rule lives in the
  // navigation reducer, not here.
  const { openDeckPicker } = useNavigation();

  // Start from whatever the cache already knows, so a lemma looked up earlier
  // renders its Entry immediately instead of blinking through "Looking up…".
  //
  // This overlay is unmounted and re-mounted far more than it looks: drilling a
  // kanji swaps it out, and so does opening the deck picker. The promise cache
  // in tokenLookup.js makes those re-opens free but not *synchronous* — a
  // `.then` can't run before the render that asked for it — so without this the
  // flash happens on every single one.
  //
  // `null` from peekResolvedToken means "not known yet" — either the lookup
  // hasn't run, or it came back empty and the fallback hasn't run. A settled
  // answer is an object, and its `entries` may still be empty: "looked up, and
  // this word has no entry" is a real answer, not a loading state.
  //
  // Both arguments are FUNCTIONS: useState's lazy initialiser form runs only on
  // the first render. Passing the values directly would re-read the cache on
  // every render for a result React throws away.
  const [result, setResult] = useState(() => peekResolvedToken(lemma, fallbackLemma));
  const [isLoading, setIsLoading] = useState(
    () => peekResolvedToken(lemma, fallbackLemma) === null,
  );
  const [error, setError] = useState('');
  // Bumped by "Try again" to re-run the effect below. A failed lookup isn't
  // cached (see tokenLookup.js), so this really does retry the request.
  const [attempt, setAttempt] = useState(0);

  // Same shape as KanjiInfoModal's fetch effect: the effect only kicks off the
  // request and updates state from the promise callbacks, never synchronously
  // (ESLint react-hooks/set-state-in-effect). The "back to loading" reset lives
  // in the retry handler instead.
  useEffect(() => {
    let cancelled = false;

    resolveToken(lemma, fallbackLemma)
      .then((found) => {
        if (!cancelled) setResult(found);
      })
      .catch((err) => {
        // The error renders INSIDE this modal on purpose. The app-level banner
        // sits in App's `.container`, underneath a fixed-position modal, and
        // `modal-fullscreen-sm-down` hides it outright on a phone — a failed
        // lookup would look like a word with no entry.
        if (!cancelled) setError(err.message || 'Could not look that word up.');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    // The user may close the overlay before the lookup resolves.
    return () => {
      cancelled = true;
    };
  }, [lemma, fallbackLemma, attempt]);

  const handleRetry = () => {
    setIsLoading(true);
    setError('');
    setResult(null);
    setAttempt((previous) => previous + 1);
  };

  // What the lookup settled on. `shownLemma` is the word the entries are
  // actually FOR — the Token's own lemma normally, the lemma it was built from
  // when the fallback fired — and everything below reads from it rather than
  // from `lemma`, so the heading, the entry and the "Add to Deck" card can't
  // describe different words.
  const entries = result?.entries ?? [];
  const shownLemma = result?.lemma ?? lemma;
  const usedFallback = result?.usedFallback ?? false;

  // The entry on screen: whichever the user picked, else the best match.
  // Derived at render time rather than synced into state, so nothing has to
  // keep it in step with `entries`.
  const primary = pickPrimaryEntry(entries, shownLemma);
  const shown = entries.find((entry) => entry.id === selectedId) ?? primary;
  const alternatives = entries
    .filter((entry) => entry.id !== shown?.id)
    .slice(0, MAX_ALTERNATIVES);

  // Both strings, because IPADIC often gives a kanji lemma for a kana surface
  // form — できる arrives with baseForm 出来る, and 出 and 来 are drillable even
  // though nothing in the Sentence was written in kanji.
  const hasKanji = extractKanji(token.surface + lemma).length > 0;

  return (
    <Modal onClose={onClose} size="lg" scrollable>
      <div className="modal-header align-items-start">
        <div>
          {/* The Surface form, exactly as it appeared in the Sentence. Never
              truncated — this is the detail view, and its kanji are tap targets
              whether or not the word itself has an entry. */}
          <div
            lang="ja"
            className="fs-2 fw-bold"
            style={{ wordBreak: 'keep-all', overflowWrap: 'anywhere' }}
          >
            {renderWithClickableKanji(token.surface, null, onKanjiClick)}
          </div>

          {/* 飲んだ → 飲む. Shown only when the two differ; a noun repeating
              itself is noise. The arrow is decorative, so a screen reader gets
              the words instead — and a different phrase when this is the
              fallback, because 東京 is not the dictionary form of 東京駅, it's
              the word underneath it. */}
          {shownLemma !== token.surface && (
            <div className="text-muted">
              <span aria-hidden="true">→ </span>
              <span className="visually-hidden">
                {usedFallback ? 'Showing the entry for: ' : 'Dictionary form: '}
              </span>
              <span lang="ja" className="fs-5">
                {renderWithClickableKanji(shownLemma, null, onKanjiClick)}
              </span>
            </div>
          )}
        </div>

        <button type="button" className="btn-close" aria-label="Close" onClick={onClose}></button>
      </div>

      <div className="modal-body pt-0">
        {isLoading && (
          <p className="text-muted text-center py-4">
            Looking up <span lang="ja">{lemma}</span>…
          </p>
        )}

        {!isLoading && error && (
          <div className="text-center py-4">
            <p className="text-danger" role="alert">
              {error}
            </p>
            <button type="button" className="btn btn-outline-secondary" onClick={handleRetry}>
              Try again
            </button>
          </div>
        )}

        {/* No entry — a name, slang, or a word Jisho simply doesn't carry. Say
            so plainly, then point at what the learner CAN still do. */}
        {!isLoading && !error && !shown && (
          <div className="text-muted text-center py-4">
            <p className="mb-1">
              No dictionary entry for <span lang="ja">{lemma}</span>.
            </p>
            <p className="small mb-0">
              {token.isUnknown
                ? 'The analyzer didn’t recognise this one — it may be a name, slang, or a typo.'
                : 'Jisho has no vocabulary entry for this word.'}
              {hasKanji && ' Its kanji above are still tappable.'}
            </p>
          </div>
        )}

        {!isLoading && !error && shown && (
          <>
            {/* Say it in words, not just with an arrow. The learner tapped
                東京駅 and is looking at 東京 — leaving that implicit would read
                as the app having quietly answered a different question. */}
            {usedFallback && (
              <p className="small text-body-secondary mb-3">
                No dictionary entry for <span lang="ja">{lemma}</span> — showing{' '}
                <span lang="ja">{shownLemma}</span>, the word it’s built from.
              </p>
            )}

            {/* The Headword, only when it isn't already in the header — a kana
                lemma (こと) can resolve to a kanji entry (事). */}
            {shown.word !== shownLemma && (
              <div lang="ja" className="fs-4 fw-semibold">
                {renderWithClickableKanji(shown.word, null, onKanjiClick)}
              </div>
            )}

            {/* Reading, badges, verb forms and senses — the same component the
                Dictionary tab's WordDetailCard renders, so the two surfaces
                can't drift apart. The verb-forms block is the reason that
                matters here: this is exactly where a learner meets 行きました. */}
            <EntryBody entry={shown} />

            {/* Homographs are common enough that hiding them would be a lie:
                one lemma can be several words. Tapping one swaps what's shown
                above — no new request, the results are already here. */}
            {alternatives.length > 0 && (
              <div className="mt-4 pt-3 border-top">
                <div className="small text-body-secondary fw-semibold mb-2">Other entries</div>
                <div className="d-flex flex-wrap gap-2">
                  {alternatives.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="btn btn-sm btn-outline-secondary"
                      onClick={() => onSelectEntry(entry.id)}
                    >
                      <span lang="ja">{entry.word}</span>
                      {entry.reading && entry.reading !== entry.word && (
                        <span lang="ja" className="text-muted ms-1">
                          {entry.reading}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Only once a Token has actually resolved to an Entry — there is nothing
          to add while the lookup is in flight, and a name like 山田 has no card
          to build. Adding it here rather than to EntryBody is deliberate: that
          component excludes anything the two surfaces frame differently, and
          the Dictionary card puts this button beside the headword.

          A footer rather than the end of the body because the Modal is
          `scrollable` — Bootstrap pins the footer and scrolls only the body, so
          the button stays reachable under a long list of senses instead of
          being buried beneath it. */}
      {!isLoading && !error && shown && (
        <div className="modal-footer border-0 justify-content-end">
          <button
            type="button"
            className="btn btn-dark touch-target"
            // `shown`, not `primary`: if the user picked a homograph from
            // "Other entries", that's the word they mean to study.
            onClick={() => openDeckPicker(shown, 'word')}
          >
            Add to Deck
          </button>
        </div>
      )}
    </Modal>
  );
}
