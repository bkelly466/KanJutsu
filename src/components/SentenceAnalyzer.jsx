import { useState } from 'react';
import { analyzeSentence } from '../api/sentence';

/**
 * The Sentence tab: paste Japanese, see how it breaks apart.
 *
 * This is the tracer bullet (issue #25) — the thinnest complete path through
 * every layer, proving the wire works. The morphemes are shown as plain,
 * non-interactive text on purpose:
 *
 *   - merging them into whole tappable words is #20 (src/utils/chunk.js)
 *   - tapping one to see its dictionary entry is #21
 *
 * So 行きました currently appears as three separate pieces — 行き, まし, た.
 * That is the analyzer telling the truth about what IPADIC emits, not a bug.
 *
 * State is local rather than in a Context: nothing outside this tab needs to
 * know what was pasted, and a Sentence is deliberately ephemeral (ADR-0003).
 */
export default function SentenceAnalyzer() {
  const [text, setText] = useState('');
  // null means "nothing analyzed yet", which is a different screen from
  // "analyzed and found nothing" — hence null rather than an empty array.
  const [morphemes, setMorphemes] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError('');
    // Drop the previous results before the new request. Leaving them up would
    // show the breakdown of the OLD sentence underneath the new one if this
    // analysis fails, which reads as a wrong answer rather than a failure.
    setMorphemes(null);
    setIsLoading(true);

    try {
      const { morphemes: found } = await analyzeSentence(text);
      setMorphemes(found);
    } catch (err) {
      // Note what we do NOT do here: touch `text`. A network blip must not cost
      // the user the sentence they pasted.
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
          className="form-control fs-6 mb-2"
          rows="3"
          lang="ja"
          placeholder="昨日、友達と映画を見に行きました。"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="d-flex justify-content-end">
          <button
            type="submit"
            className="btn btn-dark px-4"
            // Blank input has nothing to analyze, so the button would only ever
            // produce an empty result — disable it rather than explain that.
            disabled={isLoading || text.trim() === ''}
          >
            Analyze
          </button>
        </div>
      </form>

      {/* Errors and empty states share the muted, centered style the Dictionary
          tab uses, so the two tabs read as one product. */}
      {error && <p className="text-muted text-center py-3">{error}</p>}

      {isLoading && <p className="text-muted text-center py-3">Analyzing sentence…</p>}

      {!isLoading && morphemes?.length === 0 && (
        <p className="text-muted text-center py-3">
          Nothing to analyze in that text.
        </p>
      )}

      {!isLoading && morphemes?.length > 0 && (
        // Plain div, not `.container` — this already sits inside App's own
        // `.container`, and nesting them double-applies Bootstrap's gutter
        // padding, which visibly narrows the content on a phone.
        <div>
          {/* "pieces", not "morphemes" — this is in front of a beginner
              learner, not a linguist. The code keeps the precise name. */}
          <p className="text-muted small text-center mb-3">
            {morphemes.length} {morphemes.length === 1 ? 'piece' : 'pieces'} — the
            analyzer&apos;s raw output. Whole words and tapping come next.
          </p>

          {/* Wraps onto as many lines as it needs; `keep-all` stops a single
              piece being split mid-word, matching the overflow policy used for
              headwords and study card fronts elsewhere in the app. */}
          <div
            className="d-flex flex-wrap gap-2 justify-content-center"
            style={{ wordBreak: 'keep-all', overflowWrap: 'anywhere' }}
          >
            {morphemes.map((m, i) => (
              // Index is a safe key here: the list is replaced wholesale on every
              // analysis and never reordered, inserted into, or filtered.
              <div key={i} className="border rounded px-2 py-1 text-center bg-light">
                <div lang="ja" className="fs-5">{m.surface}</div>

                {/* Only worth showing when it differs — 行き → 行く is the
                    interesting case; a noun repeating itself is noise. */}
                {m.baseForm !== m.surface && (
                  <div lang="ja" className="text-muted small">→ {m.baseForm}</div>
                )}

                <div className="text-muted" style={{ fontSize: '0.7rem' }}>
                  {m.isUnknown ? 'unknown' : m.pos || '—'}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
