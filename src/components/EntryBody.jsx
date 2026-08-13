import { getVerbForms } from '../utils/conjugate';

/**
 * Everything an Entry says below its Headword: reading, badges, verb forms and
 * senses. Rendered by both WordDetailCard and TokenInfoModal, so the two
 * surfaces read as one product structurally rather than by agreement — copied
 * markup had already drifted and lost the verb-forms block.
 *
 * Excludes the Headword itself, which the two callers frame differently: a
 * heading beside "Add to Deck" in the card, the modal header next to the
 * Surface form in the overlay.
 *
 * Props:
 *   entry - a normalised entry from src/api/words.js
 */
export default function EntryBody({ entry }) {
  if (!entry) return null;

  // Dictionary and polite (ます) forms for verbs; null for anything else.
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
