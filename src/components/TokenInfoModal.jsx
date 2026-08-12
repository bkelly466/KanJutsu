import { useState, useEffect } from 'react';
import { lookUpToken, pickPrimaryEntry } from '../api/tokenLookup';
import { renderWithClickableKanji } from '../utils/clickableKanji';
import { extractKanji } from '../api/kanji';
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
 *     dictionary entry, but 山 and 田 do.
 *
 * Props:
 *   token        - the Token that was tapped: { surface, baseForm, isUnknown }
 *   onClose      - dismiss the overlay
 *   onKanjiClick - called with a single kanji character; the Sentence tab swaps
 *                  this overlay for the kanji explorer (see SentenceAnalyzer)
 */

/**
 * How many alternative entries to offer. Jisho can return twenty results for a
 * common word; past a handful the list stops being a choice and becomes a wall,
 * and the Dictionary tab is the right place for an exhaustive search.
 */
const MAX_ALTERNATIVES = 5;

export default function TokenInfoModal({ token, onClose, onKanjiClick }) {
  const lemma = token.baseForm;

  const [entries, setEntries] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  // Which of several entries the user chose to read. null = show the best
  // match. Derived at render time rather than synced into state, so nothing has
  // to keep it in step with `entries`.
  const [selectedId, setSelectedId] = useState(null);
  // Bumped by "Try again" to re-run the effect below. A failed lookup isn't
  // cached (see tokenLookup.js), so this really does retry the request.
  const [attempt, setAttempt] = useState(0);

  // Same shape as KanjiInfoModal's fetch effect: the effect only kicks off the
  // request and updates state from the promise callbacks, never synchronously
  // (ESLint react-hooks/set-state-in-effect). The "back to loading" reset lives
  // in the retry handler instead.
  useEffect(() => {
    let cancelled = false;

    lookUpToken(lemma)
      .then((found) => {
        if (!cancelled) setEntries(found);
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
  }, [lemma, attempt]);

  const handleRetry = () => {
    setIsLoading(true);
    setError('');
    setEntries([]);
    setAttempt((previous) => previous + 1);
  };

  // The entry on screen: whichever the user picked, else the best match.
  const primary = pickPrimaryEntry(entries, lemma);
  const shown = entries.find((entry) => entry.id === selectedId) ?? primary;
  const alternatives = entries
    .filter((entry) => entry.id !== shown?.id)
    .slice(0, MAX_ALTERNATIVES);

  const hasKanji = extractKanji(token.surface).length > 0;

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
              the words instead. */}
          {lemma !== token.surface && (
            <div className="text-muted">
              <span aria-hidden="true">→ </span>
              <span className="visually-hidden">Dictionary form: </span>
              <span lang="ja" className="fs-5">
                {renderWithClickableKanji(lemma, null, onKanjiClick)}
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
            {/* The Headword, only when it isn't already in the header — a kana
                lemma (こと) can resolve to a kanji entry (事). */}
            {shown.word !== lemma && (
              <div lang="ja" className="fs-4 fw-semibold">
                {renderWithClickableKanji(shown.word, null, onKanjiClick)}
              </div>
            )}

            {shown.reading && shown.reading !== shown.word && (
              <div lang="ja" className="fs-5 text-muted mb-2">
                {shown.reading}
              </div>
            )}

            <div className="d-flex flex-wrap gap-2 mb-3">
              {shown.isCommon && <span className="badge bg-success">common word</span>}
              {shown.jlpt?.map((level) => (
                <span key={level} className="badge bg-secondary">
                  JLPT {level}
                </span>
              ))}
            </div>

            {/* Senses, matching WordDetailCard's layout so the two surfaces
                read as one product. */}
            <ol className="ps-3 mb-0">
              {shown.senses.map((sense, index) => (
                <li key={index} className="mb-3">
                  {sense.partsOfSpeech.length > 0 && (
                    <div className="text-body-secondary fst-italic small mb-1">
                      {sense.partsOfSpeech.join(', ')}
                    </div>
                  )}
                  <div className="fs-5">{sense.definitions.join('; ')}</div>
                </li>
              ))}
            </ol>

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
                      onClick={() => setSelectedId(entry.id)}
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
    </Modal>
  );
}
