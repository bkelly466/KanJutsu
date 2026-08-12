import { useEffect, useState } from 'react';
import { analyzeSentence, warmUpAnalyzer, MAX_SENTENCE_LENGTH } from '../api/sentence';
import TokenInfoModal from './TokenInfoModal';
import KanjiInfoModal from './KanjiInfoModal';

/**
 * The Sentence tab: paste Japanese, tap the words in it.
 *
 * Two things happen here. The analyzer gives correct, visible word boundaries —
 * 行きました is one Token, not the three morphemes IPADIC actually emits, while
 * を and に stand on their own — and tapping any of them opens the Entry it
 * resolves to, with the Sentence still on screen behind the overlay.
 *
 * State is local rather than in a Context: nothing outside this tab needs to
 * know what was pasted, and a Sentence is deliberately ephemeral (ADR-0003).
 */

/**
 * Show the character counter from 80% of the cap onward. Always showing it
 * would clutter the common case — most sentences are nowhere near 300 — but a
 * limit you only discover by hitting it is a bad limit.
 */
const COUNTER_VISIBLE_FROM = Math.floor(MAX_SENTENCE_LENGTH * 0.8);

/**
 * Whether the analyzer has already been warmed this page load.
 *
 * Module scope, not component state: App.jsx mounts this component only while
 * its tab is active, so every switch away and back remounts it and would fire
 * another ping. Flipping tabs five times shouldn't cost five requests, cheap as
 * they are. A page load is the right granularity — the Lambda stays warm for
 * minutes, and a full reload is when we'd genuinely want to warm it again.
 */
let hasWarmedUp = false;

export default function SentenceAnalyzer() {
  const [text, setText] = useState('');
  // null means "nothing analyzed yet", which is a different screen from
  // "analyzed and found nothing" — hence null rather than an empty array.
  const [tokens, setTokens] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  // The Token whose Entry is on screen, or null when no overlay is open.
  const [selectedToken, setSelectedToken] = useState(null);
  // A kanji being explored from inside that overlay, or null.
  const [drilledKanji, setDrilledKanji] = useState(null);
  // Which entry the user picked from "Other entries" (a lemma can be several
  // words), or null for the best match. It lives here rather than inside the
  // overlay because drilling a kanji unmounts the overlay and mounts it again
  // — state kept in there would silently throw the choice away.
  const [selectedEntryId, setSelectedEntryId] = useState(null);

  // Open the overlay on a Token. Any entry chosen for the previous Token is
  // meaningless for this one, so it resets here.
  const handleTokenClick = (token) => {
    setSelectedEntryId(null);
    setSelectedToken(token);
  };

  // Warm the Lambda up the moment the tab opens. It carries a 12.5 MB
  // dictionary, so a cold start costs ~1.2 s against 2-3 ms warm — firing this
  // now spends that time while the user is still pasting and reading.
  //
  // This component only mounts when the tab is active (see App.jsx), so mount
  // IS the tab opening. Nothing is awaited and nothing is stored: a failed
  // warm-up is silent by design, because it's an optimisation the user never
  // asked for. warmUpAnalyzer never rejects, so there's no floating rejection.
  //
  // Under StrictMode (main.jsx) this effect runs twice in development, so
  // expect two pings locally on the first open and none after — that's the
  // guard working, not a bug.
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
    // Drop the previous results before the new request. Leaving them up would
    // show the breakdown of the OLD sentence underneath the new one if this
    // analysis fails, which reads as a wrong answer rather than a failure.
    setTokens(null);
    setIsLoading(true);

    try {
      const { tokens: found } = await analyzeSentence(text);
      setTokens(found);
    } catch (err) {
      // Note what we do NOT do here: touch `text`. A network blip must not cost
      // the user the sentence they pasted. This also carries the guard messages
      // for over-long text and text with no Japanese in it.
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
          // Ties the counter to the field so a screen reader announces the limit
          // when the textarea is focused. Without it, someone who can't see the
          // red text tabs to a disabled Analyze button with no explanation.
          aria-describedby="sentenceCounter"
        />

        <div className="d-flex justify-content-between align-items-center mt-2">
          {/* Counter on the left, button on the right. The empty span keeps the
              button hard right when there's no counter to show. */}
          {showCounter ? (
            <span
              id="sentenceCounter"
              // Announce changes as they're typed, but politely — this must not
              // interrupt what the user is doing.
              aria-live="polite"
              className={`small ${isOverLimit ? 'text-danger fw-semibold' : 'text-muted'}`}
            >
              {trimmedLength} / {MAX_SENTENCE_LENGTH}
              {/* Say what's wrong and by how much, rather than just going red.
                  Text over the limit is refused, never silently shortened. */}
              {isOverLimit &&
                ` — too long by ${trimmedLength - MAX_SENTENCE_LENGTH}. Shorten it to analyze.`}
            </span>
          ) : (
            <span />
          )}

          <button
            type="submit"
            className="btn btn-dark px-4"
            // Blank input has nothing to analyze; over-limit input would only be
            // refused. Disabling beats explaining after the fact in both cases.
            disabled={isLoading || trimmedLength === 0 || isOverLimit}
          >
            Analyze
          </button>
        </div>
      </form>

      {/* Errors, hints and empty states share the muted, centered style the
          Dictionary tab uses, so the two tabs read as one product. */}
      {/* role="alert" matches the convention already used in App.jsx and
          CardDetailModal.jsx, so a failure is announced rather than only seen. */}
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
        // Plain div, not `.container` — this already sits inside App's own
        // `.container`, and nesting them double-applies Bootstrap's gutter
        // padding, which visibly narrows the content on a phone.
        <div>
          {/* Counts every Token, including punctuation, so the number matches
              what's actually on screen — a user can count them. */}
          <p className="text-muted small text-center mb-3">
            Broken into {tokens.length} pieces. Tap any word to look it up.
          </p>

          {/* Wraps onto as many lines as it needs; `keep-all` stops a single
              Token being split mid-word, matching the overflow policy used for
              headwords and study card fronts elsewhere in the app. */}
          <div
            className="d-flex flex-wrap gap-2 justify-content-center align-items-start"
            style={{ wordBreak: 'keep-all', overflowWrap: 'anywhere' }}
          >
            {tokens.map((token, i) =>
              // Punctuation renders as plain text with no box and no button
              // role: a learner shouldn't read a full stop as something to
              // interact with, and a screen reader shouldn't announce one as a
              // tap target.
              token.isInteractive ? (
                // Index is a safe key here: the list is replaced wholesale on
                // every analysis and never reordered, inserted into, or filtered.
                <button
                  key={i}
                  type="button"
                  className="btn btn-light border rounded px-2 py-1 d-flex flex-column justify-content-center"
                  // Bootstrap's padding alone leaves a single-kana Token around
                  // 34px square; 44px is the minimum comfortable touch target
                  // in both Apple's and Android's guidelines. Both axes matter:
                  // the narrowest Tokens are the particles (は, を, に), which
                  // stand alone precisely BECAUSE they're what a beginner taps.
                  //
                  // Written inline rather than with App.css's .touch-target,
                  // which sets the same floor but also centres its content in a
                  // row — that would put 行きました and → 行く side by side.
                  style={{ minHeight: '44px', minWidth: '44px' }}
                  onClick={() => handleTokenClick(token)}
                  // The visible text is the Surface form, so the dictionary form
                  // has to be spoken for a screen reader to reach it at all.
                  aria-label={
                    token.baseForm === token.surface
                      ? `Look up ${token.surface}`
                      : `Look up ${token.surface}, dictionary form ${token.baseForm}`
                  }
                >
                  <span lang="ja" className="fs-5">
                    {token.surface}
                  </span>

                  {/* The dictionary form, shown only when it differs — 行きました
                      → 行く is the part worth learning; a noun repeating itself
                      is noise. Hidden from screen readers because aria-label
                      above already says it, and better. */}
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

      {/* The kanji explorer REPLACES the Token overlay rather than stacking on
          top of it — the same swap AddToDeckModal does with CreateDeckModal.
          Two Modals mounted at once would both close on a single Escape, and
          useBackButton is built to have one overlay per level. `selectedToken`
          is left untouched, so closing the explorer lands back on the Entry. */}
      {drilledKanji ? (
        <KanjiInfoModal initialKanji={drilledKanji} onClose={() => setDrilledKanji(null)} />
      ) : (
        selectedToken && (
          <TokenInfoModal
            // Keying by the Token forces a remount when a different one is
            // opened, so the overlay can never render a new word's heading
            // above the previous word's definition while the lookup is in
            // flight. Cheaper and safer than resetting four state slices by
            // hand — a component whose state is ABOUT a subject should be
            // keyed by that subject.
            key={`${selectedToken.surface}:${selectedToken.baseForm}`}
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
