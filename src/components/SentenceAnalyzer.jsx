import { useEffect, useState } from 'react';
import { analyzeSentence, warmUpAnalyzer, MAX_SENTENCE_LENGTH } from '../api/sentence';
import { useNavigation } from '../context/navigationContext';
import TokenInfoModal from './TokenInfoModal';
import KanjiInfoModal from './KanjiInfoModal';

/**
 * The Sentence tab: paste Japanese, tap the words in it. The analyzer gives
 * visible word boundaries — 行きました as one Token, を and に standing alone —
 * and tapping one opens its Entry over the still-visible Sentence.
 *
 * State is local rather than in a Context: nothing outside this tab needs what
 * was pasted, and a Sentence is deliberately ephemeral (ADR-0003).
 */

/**
 * Show the character counter from 80% of the cap on. Always showing it clutters
 * the common case; a limit you only discover by hitting it is a bad limit.
 */
const COUNTER_VISIBLE_FROM = Math.floor(MAX_SENTENCE_LENGTH * 0.8);

/**
 * Whether the analyzer has been warmed this page load. Module scope, not
 * component state: App.jsx mounts this component only while its tab is active,
 * so every switch away and back would otherwise fire another ping. The Lambda
 * stays warm for minutes, which makes a page load the right granularity.
 */
let hasWarmedUp = false;

export default function SentenceAnalyzer() {
  const [text, setText] = useState('');
  // null is "nothing analyzed yet", a different screen from "analyzed and found
  // nothing" — hence null rather than an empty array.
  const [tokens, setTokens] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // The Token whose Entry is on screen, or null when no overlay is open.
  const [selectedToken, setSelectedToken] = useState(null);
  // A kanji being explored from inside that overlay, or null.
  const [drilledKanji, setDrilledKanji] = useState(null);
  // The entry picked from "Other entries", or null for the best match. Here
  // rather than in the overlay because drilling a kanji unmounts and re-mounts
  // it, which would silently throw the choice away.
  const [selectedEntryId, setSelectedEntryId] = useState(null);

  // Read, never written: this tab has to know when the picker is open so the
  // two never mount together. See the render block at the bottom.
  const { deckPickerTarget } = useNavigation();

  // Any entry chosen for the previous Token is meaningless for this one.
  const handleTokenClick = (token) => {
    setSelectedEntryId(null);
    setSelectedToken(token);
  };

  // Warm the Lambda as the tab opens — a cold start is ~1.2 s against 2-3 ms
  // warm, spent here while the user is still pasting. This component mounts
  // only when its tab is active, so mount IS the tab opening. Nothing is
  // awaited or stored, and warmUpAnalyzer never rejects.
  //
  // StrictMode runs this twice in development: two pings on the first open and
  // none after is the guard working, not a bug.
  useEffect(() => {
    if (hasWarmedUp) return;
    hasWarmedUp = true;
    warmUpAnalyzer();
  }, []);

  const trimmedLength = text.trim().length;
  const isOverLimit = trimmedLength > MAX_SENTENCE_LENGTH;
  const showCounter = trimmedLength >= COUNTER_VISIBLE_FROM;

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError('');
    // A new Sentence retires whatever was being looked up in the old one.
    setSelectedToken(null);
    setSelectedEntryId(null);
    setDrilledKanji(null);
    // Dropped before the request: on failure, the OLD sentence's breakdown
    // sitting under the new text reads as a wrong answer rather than an error.
    setTokens(null);
    setIsLoading(true);

    try {
      const { tokens: found } = await analyzeSentence(text);
      setTokens(found);
    } catch (err) {
      // `text` is deliberately untouched — a network blip must not cost the
      // user what they pasted. Also carries the over-long and not-Japanese
      // guard messages.
      setError(err.message || 'Something went wrong.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <form onSubmit={handleSubmit} className="mb-4">
        <label htmlFor="sentenceInput" className="form-label text-muted small">
          Paste Japanese text to see how it breaks into words.
        </label>
        <textarea
          id="sentenceInput"
          className="form-control fs-6"
          rows="3"
          lang="ja"
          placeholder="昨日、友達と映画を見に行きました。"
          value={text}
          onChange={(e) => setText(e.target.value)}
          // Without this, someone who can't see the red text tabs to a disabled
          // Analyze button with no explanation.
          aria-describedby="sentenceCounter"
        />

        <div className="d-flex justify-content-between align-items-center mt-2">
          {/* The empty span keeps the button hard right with no counter shown. */}
          {showCounter ? (
            <span
              id="sentenceCounter"
              // Politely, so typing isn't interrupted.
              aria-live="polite"
              className={`small ${isOverLimit ? 'text-danger fw-semibold' : 'text-muted'}`}
            >
              {trimmedLength} / {MAX_SENTENCE_LENGTH}
              {/* What's wrong and by how much, rather than just going red. */}
              {isOverLimit &&
                ` — too long by ${trimmedLength - MAX_SENTENCE_LENGTH}. Shorten it to analyze.`}
            </span>
          ) : (
            <span />
          )}

          <button
            type="submit"
            className="btn btn-dark px-4"
            // Blank input has nothing to analyze and over-limit input would be
            // refused; disabling beats explaining after the fact.
            disabled={isLoading || trimmedLength === 0 || isOverLimit}
          >
            Analyze
          </button>
        </div>
      </form>

      {/* Muted and centred, matching the Dictionary tab's states; role="alert"
          matches App.jsx and CardDetailModal.jsx, so failures are announced. */}
      {error && (
        <p className="text-muted text-center py-3" role="alert">
          {error}
        </p>
      )}

      {isLoading && <p className="text-muted text-center py-3">Analyzing sentence…</p>}

      {!isLoading && tokens?.length === 0 && (
        <p className="text-muted text-center py-3">Nothing to analyze in that text.</p>
      )}

      {!isLoading && tokens?.length > 0 && (
        // Plain div, not `.container`: this sits inside App's own, and nesting
        // double-applies Bootstrap's gutter padding, narrowing it on a phone.
        <div>
          {/* Counts punctuation too, so the number matches what's on screen. */}
          <p className="text-muted small text-center mb-3">
            Broken into {tokens.length} pieces. Tap any word to look it up.
          </p>

          {/* `keep-all` stops a Token splitting mid-word, matching the overflow
              policy for headwords and study card fronts. */}
          <div
            className="d-flex flex-wrap gap-2 justify-content-center align-items-start"
            style={{ wordBreak: 'keep-all', overflowWrap: 'anywhere' }}
          >
            {tokens.map((token, i) =>
              // Punctuation is plain text, no box and no button role: a screen
              // reader shouldn't announce a full stop as a tap target.
              token.isInteractive ? (
                // Index is safe here: the list is replaced wholesale on every
                // analysis and never reordered, inserted into, or filtered.
                <button
                  key={i}
                  type="button"
                  className="btn btn-light border rounded px-2 py-1 d-flex flex-column justify-content-center"
                  // Bootstrap's padding leaves a single-kana Token around 34px
                  // square, under the 44px touch-target floor. Both axes matter:
                  // the narrowest Tokens are the particles, which stand alone
                  // precisely BECAUSE they're what a beginner taps.
                  //
                  // Inline rather than App.css's .touch-target, which sets the
                  // same floor but also centres content in a row — that would
                  // put 行きました and → 行く side by side.
                  style={{ minHeight: '44px', minWidth: '44px' }}
                  onClick={() => handleTokenClick(token)}
                  // The visible text is the Surface form, so the dictionary
                  // form has to be spoken to be reachable at all.
                  aria-label={
                    token.baseForm === token.surface
                      ? `Look up ${token.surface}`
                      : `Look up ${token.surface}, dictionary form ${token.baseForm}`
                  }
                >
                  <span lang="ja" className="fs-5">
                    {token.surface}
                  </span>

                  {/* Only when it differs. Hidden from screen readers, which
                      get the aria-label above instead. */}
                  {token.baseForm !== token.surface && (
                    <span lang="ja" className="text-muted small" aria-hidden="true">
                      → {token.baseForm}
                    </span>
                  )}
                </button>
              ) : (
                <div key={i} lang="ja" className="fs-5 px-1 py-1 text-muted">
                  {token.surface}
                </div>
              ),
            )}
          </div>
        </div>
      )}

      {/* Both overlays REPLACE the Token overlay rather than stacking: two
          Modals mounted together both close on a single Escape. `selectedToken`
          is hidden rather than cleared, so closing either lands back on the
          Entry the user was reading. The unmount and mount land in one commit,
          which useBackButton's deferred sync nets out to no history change.

          The deck picker is rendered by App.jsx, so all this tab can do is step
          out of its way while `deckPickerTarget` is set.

          NOT covered: KanjiInfoModal's detail card has an "Add to Deck" of its
          own, so a kanji drilled from here can still mount two Modals. Guarding
          it here would rewind the kanji→kanji drill, whose stack lives in
          KanjiInfoModal's own state. Issue #34. */}
      {drilledKanji ? (
        <KanjiInfoModal initialKanji={drilledKanji} onClose={() => setDrilledKanji(null)} />
      ) : (
        selectedToken &&
        !deckPickerTarget && (
          <TokenInfoModal
            // Keyed by its subject, so opening a different Token remounts and
            // the overlay can never show a new word's heading above the
            // previous word's definition mid-lookup. The fallback lemma is part
            // of that subject — it's the second thing the overlay may look up.
            key={`${selectedToken.surface}:${selectedToken.baseForm}:${selectedToken.fallbackBaseForm ?? ''}`}
            token={selectedToken}
            onClose={() => setSelectedToken(null)}
            onKanjiClick={setDrilledKanji}
            selectedId={selectedEntryId}
            onSelectEntry={setSelectedEntryId}
          />
        )
      )}
    </>
  );
}
