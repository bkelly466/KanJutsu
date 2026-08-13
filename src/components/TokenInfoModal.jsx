import { resolveToken, peekResolvedToken, pickPrimaryEntry } from '../api/tokenLookup';
import { useLookup } from '../hooks/useLookup';
import { renderWithClickableKanji } from '../utils/clickableKanji';
import { extractKanji } from '../api/kanji';
import { useNavigation } from '../context/navigationContext';
import EntryBody from './EntryBody';
import Modal from './Modal';

/**
 * The payoff of the Sentence tab: tap a Token, see the Entry it resolves to.
 *
 * Three behaviours are deliberate:
 *
 *   - **The Surface form leads, the Headword follows.** 飲んだ is what the
 *     learner tapped and must recognise; 飲む is what they must memorise. When
 *     they differ, both appear with an arrow between them.
 *   - **A Token with no Entry is not a dead end.** Names and slang still open
 *     the overlay, say plainly there's no entry, and still offer their kanji to
 *     drill — 山田 has no entry, 山 and 田 do. A merged compound with no entry
 *     falls back to the word it was built from, naming both on screen rather
 *     than substituting silently.
 *   - **"Add to Deck" builds the same card the Dictionary tab builds** — same
 *     shape, dedupe key and SRS defaults, because both routes end in
 *     `openDeckPicker(entry, 'word')`. The Sentence is not carried onto it.
 *
 * Props:
 *   token          - the Token tapped:
 *                    { surface, baseForm, isUnknown, fallbackBaseForm }
 *   onClose        - dismiss the overlay
 *   onKanjiClick   - called with one kanji character; SentenceAnalyzer swaps
 *                    this overlay for the kanji explorer
 *   selectedId     - the entry chosen from "Other entries", or null for the
 *                    best match. Owned by SentenceAnalyzer because it must
 *                    survive this component unmounting — drilling a kanji swaps
 *                    the overlay out and back, and that shouldn't undo a choice.
 *   onSelectEntry  - called with an entry id when the user picks one
 */

/**
 * How many alternative entries to offer. Jisho can return twenty for a common
 * word, and past a handful the list is a wall rather than a choice — an
 * exhaustive search belongs in the Dictionary tab.
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
  // The lemma this Token was built from, for when the merged lookup finds
  // nothing (東京駅 → 東京). null on all but a derivational merge.
  const fallbackLemma = token.fallbackBaseForm;

  // The picker is rendered up in App.jsx; this asks it to open. Whether a
  // signed-out user gets it or the login form is the navigation reducer's rule.
  const { openDeckPicker } = useNavigation();

  // Peek matters here more than elsewhere: drilling a kanji and opening the
  // deck picker both unmount this overlay, so it re-mounts far more than it
  // looks. `null` from peekResolvedToken is "not known yet", mapped to
  // `undefined` because that is how useLookup spells "go and find out" — a
  // settled answer is an object whose `entries` may still be empty.
  //
  // The error renders INSIDE this modal deliberately: App's banner sits under a
  // fixed-position modal and `modal-fullscreen-sm-down` hides it outright on a
  // phone, so a failed lookup would read as a word with no entry.
  const {
    data: result,
    isLoading,
    error,
    retry,
  } = useLookup(
    // Both lemmas, because both decide what comes back. SentenceAnalyzer keys
    // this component by its Token so neither changes while mounted — but a key
    // omitting one would be a trap for whoever removes that.
    `${lemma}|${fallbackLemma ?? ''}`,
    () => resolveToken(lemma, fallbackLemma),
    () => peekResolvedToken(lemma, fallbackLemma) ?? undefined
  );

  // `shownLemma` is the word the entries are FOR — the Token's own normally,
  // the one it was built from when the fallback fired. Everything below reads
  // it rather than `lemma`, so neither the Entry on screen nor the card "Add to
  // Deck" builds can be for a word the heading didn't name.
  const entries = result?.entries ?? [];
  const shownLemma = result?.lemma ?? lemma;
  const usedFallback = result?.usedFallback ?? false;

  // Derived at render rather than synced into state, so nothing has to keep it
  // in step with `entries`.
  const primary = pickPrimaryEntry(entries, shownLemma);
  const shown = entries.find((entry) => entry.id === selectedId) ?? primary;
  const alternatives = entries
    .filter((entry) => entry.id !== shown?.id)
    .slice(0, MAX_ALTERNATIVES);

  // Both strings: IPADIC often gives a kanji lemma for a kana surface form —
  // できる arrives as 出来る, and 出 and 来 are drillable even though nothing in
  // the Sentence was written in kanji.
  const hasKanji = extractKanji(token.surface + lemma).length > 0;

  return (
    <Modal onClose={onClose} size="lg" scrollable>
      <div className="modal-header align-items-start">
        <div>
          {/* Never truncated: this is the detail view, and the kanji are tap
              targets whether or not the word itself has an entry. */}
          <div
            lang="ja"
            className="fs-2 fw-bold"
            style={{ wordBreak: 'keep-all', overflowWrap: 'anywhere' }}
          >
            {renderWithClickableKanji(token.surface, null, onKanjiClick)}
          </div>

          {/* 飲んだ → 飲む, shown only when the two differ. The arrow is
              decorative, so a screen reader gets words instead — and different
              words for the fallback, because 東京 is not the dictionary form of
              東京駅, it's the word underneath it. */}
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
            <button type="button" className="btn btn-outline-secondary" onClick={retry}>
              Try again
            </button>
          </div>
        )}

        {/* A name, slang, or a word Jisho doesn't carry. Say so plainly, then
            point at what the learner can still do. */}
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
            {/* In words, not just an arrow: the learner tapped 東京駅 and is
                looking at 東京, and leaving that implicit reads as the app
                quietly answering a different question. */}
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

            {/* The same component WordDetailCard renders, so the two surfaces
                can't drift apart. */}
            <EntryBody entry={shown} />

            {/* One lemma can be several words, so hiding homographs would be a
                lie. Tapping one swaps what's shown above with no new request. */}
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

      {/* Only once a Token resolved to an Entry: a name like 山田 has no card to
          build. Here rather than in EntryBody because the Dictionary card puts
          this button beside the headword instead.

          A footer, not the end of the body, because the Modal is `scrollable` —
          Bootstrap pins the footer, so the button stays reachable under a long
          list of senses. */}
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
