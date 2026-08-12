import { getVerbForms } from '../utils/conjugate';

/**
 * Everything an Entry says below its Headword: reading, badges, verb forms and
 * senses.
 *
 * Two surfaces show an Entry — the Dictionary tab's WordDetailCard and the
 * Sentence tab's TokenInfoModal — and they must read as one product. That was
 * first attempted by copying the markup, which drifted immediately: the copy
 * lost the verb-forms block, so 行きました in the Sentence tab (exactly where a
 * learner meets a conjugated verb) showed less than the Dictionary tab did.
 * One component makes the promise structural instead of aspirational.
 *
 * Deliberately excludes the Headword itself. The two callers frame it
 * differently — the card makes it a heading beside "Add to Deck", the overlay
 * puts it in the modal header next to the Surface form it came from — and
 * forcing one layout on both is what would make this component awkward to use.
 *
 * Props:
 *   entry - a normalised entry from src/api/words.js
 */
export default function EntryBody({ entry }) {
  if (!entry) return null;

  // Verbs get an extra block showing dictionary + polite (ます) forms; null otherwise.
  const verbForms = getVerbForms(entry);

  return (
    <>
      {entry.reading && entry.reading !== entry.word && (
        <div lang="ja" className="fs-5 text-muted mb-2">
          {entry.reading}
        </div>
      )}

      <div className="d-flex flex-wrap gap-2 mb-4">
        {entry.isCommon && <span className="badge bg-success">common word</span>}
        {entry.jlpt?.map((level) => (
          <span key={level} className="badge bg-secondary">
            JLPT {level}
          </span>
        ))}
      </div>

      {/* Verb forms (verbs only): dictionary form + polite present. */}
      {verbForms && (
        <div className="mb-4 p-3 bg-light rounded">
          <div className="small text-body-secondary fw-semibold mb-2">Verb forms</div>
          <div className="d-flex flex-column gap-1">
            <div>
              <span className="text-muted me-2">Dictionary:</span>
              <strong className="fs-5" lang="ja">
                {verbForms.base.word}
              </strong>
              {verbForms.base.reading && verbForms.base.reading !== verbForms.base.word && (
                <span className="text-muted ms-1" lang="ja">
                  ({verbForms.base.reading})
                </span>
              )}
            </div>
            <div>
              <span className="text-muted me-2">Polite:</span>
              <strong className="fs-5" lang="ja">
                {verbForms.polite.word}
              </strong>
              {verbForms.polite.reading && verbForms.polite.reading !== verbForms.polite.word && (
                <span className="text-muted ms-1" lang="ja">
                  ({verbForms.polite.reading})
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Senses: Jisho groups definitions into senses, each with its own
          parts of speech (e.g. "Ichidan verb, transitive verb"). */}
      <ol className="ps-3 mb-0">
        {entry.senses.map((sense, index) => (
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
    </>
  );
}
