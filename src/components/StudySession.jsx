import { useReducer, useState } from 'react';
import { calculateNextReview, getCardsForReview } from '../utils/srs';
import { initStudySession, studySessionReducer } from '../reducers/studySession';
import { useBackButton } from '../hooks/useBackButton';
import { useNavigation } from '../context/navigationContext';
import { useDecksContext } from '../context/decksContext';
import { useSelectedDeck } from '../hooks/useSelectedDeck';
import { writeFailureMessage } from '../utils/writeFailure';

const RATINGS = [
  { quality: 0, label: 'Again', color: '#dc3545', hint: 'Complete blackout' },
  { quality: 3, label: 'Hard',  color: '#fd7e14', hint: 'Very difficult' },
  { quality: 4, label: 'Good',  color: '#198754', hint: 'Correct with effort' },
  { quality: 5, label: 'Easy',  color: '#0d6efd', hint: 'Perfect recall' },
];

export default function StudySession() {
  // Leaving a session returns to that deck's detail view.
  const { backToDetail } = useNavigation();
  const { updateCardSRS } = useDecksContext();
  const deck = useSelectedDeck();

  // Only the THIRD argument is lazy. The second is an ordinary expression that
  // JavaScript evaluates on every render even though React discards it after
  // the first — building the queue there would re-shuffle on every flip and
  // rating. Hence `deck` in, and the work inside the initializer.
  const [state, dispatch] = useReducer(
    studySessionReducer,
    deck,
    (d) => initStudySession(shuffleArray([...getCardsForReview(d.cards)]))
  );
  const { queue, currentIndex, isFlipped, sessionStats, done } = state;

  // What to say if an SRS write has failed this session, '' if none has.
  // Outside the reducer, which is pure — this is a network outcome.
  const [saveError, setSaveError] = useState('');

  // Device Back exits the session rather than the app.
  useBackButton(true, backToDetail);

  const total = queue.length;
  const current = queue[currentIndex];

  const handleFlip = () => dispatch({ type: 'FLIP' });

  const handleRate = async (quality) => {
    // The reducer is pure, so the SM-2 math happens here and arrives as
    // already-computed `metrics`.
    const metrics = calculateNextReview(current, quality);

    // Advance FIRST, then write: the next card appears the instant the rating
    // is tapped. A round trip between every card is the one place in the app
    // where latency would really be felt.
    const ratingKey = RATINGS.find(r => r.quality === quality)?.label.toLowerCase();
    dispatch({ type: 'RATE', quality, ratingKey, metrics });

    // The session continues safely on a failed write — only the cloud copy is
    // lost, so the card comes up again next time — but the learner is told,
    // because "I reviewed these" and "these were saved" must mean the same
    // thing. An expired session fails EVERY remaining review, which is why the
    // message has to name that cause rather than staying generic.
    const result = await updateCardSRS(current.id, metrics);
    if (!result.ok) {
      setSaveError(
        writeFailureMessage(
          result,
          'Some reviews couldn’t be saved. They’ll come up again next time.',
        ),
      );
    }
  };

  // Stays for the rest of the session once any review fails to save. Not a
  // retry: ordering, conflicts and ending mid-retry make that its own design,
  // and guessing at it would be worse than reporting honestly.
  const saveFailedNotice = saveError && (
    <p className="text-warning small text-center mb-0" role="alert">
      {saveError}
    </p>
  );

  if (done) {
    const reviewed = sessionStats.again + sessionStats.hard + sessionStats.good + sessionStats.easy;
    const correct = sessionStats.good + sessionStats.easy;
    const pct = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0;
    // "Again" cards are re-queued and rated twice, so queue length overstates
    // how many distinct cards were studied.
    const uniqueCards = new Set(queue.map((c) => c.id)).size;

    return (
      <div className="text-center py-4">
        <div style={{ fontSize: '3rem' }}>🎉</div>
        <h4 className="fw-bold mt-2">Session Complete!</h4>
        <p className="text-muted">{deck.name}</p>

        <div className="row g-3 justify-content-center my-3" style={{ maxWidth: 400, margin: '0 auto' }}>
          <div className="col-6">
            <div className="card text-center p-3 border-0 bg-light">
              <div className="fw-bold fs-3">{uniqueCards}</div>
              <div className="text-muted small">Cards reviewed</div>
            </div>
          </div>
          <div className="col-6">
            <div className="card text-center p-3 border-0 bg-light">
              <div className="fw-bold fs-3">{pct}%</div>
              <div className="text-muted small">Correct</div>
            </div>
          </div>
          {RATINGS.map(r => (
            <div key={r.label} className="col-6 col-sm-3">
              <div className="card text-center p-2 border-0 bg-light">
                <div className="fw-bold fs-5" style={{ color: r.color }}>
                  {sessionStats[r.label.toLowerCase()]}
                </div>
                <div className="text-muted small">{r.label}</div>
              </div>
            </div>
          ))}
        </div>

        {saveFailedNotice}

        <button className="btn btn-dark mt-3" onClick={backToDetail}>
          Back to Deck
        </button>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="text-center py-5">
        <p className="text-muted">No cards due for review.</p>
        <button className="btn btn-outline-dark mt-2" onClick={backToDetail}>Back</button>
      </div>
    );
  }

  const progress = total > 0 ? Math.min(100, (currentIndex / total) * 100) : 0;
  // Word cards reveal a reading; kanji cards reveal on'yomi/kun'yomi. Legacy
  // cards (saved before word support) have no `type`, so they render as kanji.
  const isWord = current.type === 'word';

  return (
    <div>
      {/* Header */}
      <div className="d-flex align-items-center gap-3 mb-3">
        <button className="btn btn-outline-secondary btn-sm" onClick={backToDetail}>
          ← Exit
        </button>
        <div className="flex-grow-1">
          <div className="progress" style={{ height: 6 }}>
            <div
              className="progress-bar bg-dark"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <span className="text-muted small">{currentIndex}/{total}</span>
      </div>

      {saveFailedNotice && <div className="mb-3">{saveFailedNotice}</div>}

      {/* Card */}
      <div
        className="card shadow text-center mx-auto"
        style={{
          maxWidth: 480,
          minHeight: 320,
          cursor: isFlipped ? 'default' : 'pointer',
          userSelect: 'none',
        }}
        onClick={!isFlipped ? handleFlip : undefined}
      >
        <div className="card-body d-flex flex-column justify-content-center align-items-center p-4">
          {/* A word can be several characters, so it scales with the viewport;
              a single kanji is one glyph and stays large. */}
          <div
            style={{
              fontSize: isWord ? 'clamp(2rem, 9vw, 3rem)' : 'clamp(3.5rem, 16vw, 5rem)',
              fontWeight: 'bold',
              lineHeight: 1.1,
              marginBottom: '0.5rem',
              // keep-all stops a word stacking one character per line;
              // overflowWrap is the safety net for a compound that can't fit at
              // all. Never truncated — reading the front is the whole point.
              wordBreak: 'keep-all',
              overflowWrap: 'anywhere',
            }}
          >
            {current.front}
          </div>

          {!isFlipped && (
            <p className="text-muted mt-3 mb-0">Tap to reveal</p>
          )}

          {/* Back */}
          {isFlipped && (
            <div className="mt-3 w-100">
              <hr />
              <div className="fs-5 fw-semibold mb-2">{current.back.meanings}</div>
              <div className="text-muted small d-flex flex-wrap gap-3 justify-content-center">
                {isWord ? (
                  current.back.reading && (
                    <span>読み: <strong>{current.back.reading}</strong></span>
                  )
                ) : (
                  <>
                    {current.back.onyomi && (
                      <span>音読み: <strong>{current.back.onyomi}</strong></span>
                    )}
                    {current.back.kunyomi && (
                      <span>訓読み: <strong>{current.back.kunyomi}</strong></span>
                    )}
                  </>
                )}
              </div>

              {/* The dictionary form only when it differs from the front —
                  a する-noun has front 勉強 and dictionary form 勉強する. */}
              {isWord && current.back.verbForms && (
                <div className="text-muted small mt-3">
                  {current.back.verbForms.base.word !== current.front && (
                    <div>Dictionary: <strong>{current.back.verbForms.base.word}</strong></div>
                  )}
                  <div>
                    Polite: <strong>{current.back.verbForms.polite.word}</strong>
                    {current.back.verbForms.polite.reading &&
                      current.back.verbForms.polite.reading !== current.back.verbForms.polite.word && (
                        <span> ({current.back.verbForms.polite.reading})</span>
                      )}
                  </div>
                </div>
              )}

              {(current.jlpt || current.grade) && (
                <div className="text-muted mt-2" style={{ fontSize: '0.75rem' }}>
                  {/* Word JLPT is already like "N5"; kanji JLPT is a number. */}
                  {current.jlpt && (
                    <span className="me-2">JLPT {isWord ? current.jlpt : `N${current.jlpt}`}</span>
                  )}
                  {current.grade && <span>Grade {current.grade}</span>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {isFlipped && (
        <div className="d-flex gap-2 justify-content-center mt-4" style={{ maxWidth: 480, margin: '1rem auto 0' }}>
          {RATINGS.map(r => (
            <button
              key={r.label}
              className="btn flex-grow-1 fw-semibold"
              style={{
                backgroundColor: r.color,
                color: '#fff',
                border: 'none',
                padding: '10px 4px',
                // The four most-tapped buttons in the app; 48px clears the 44px
                // touch-target floor with room to spare.
                minHeight: 48,
              }}
              // No `title` tooltip — it only appears on hover, which touch
              // devices never fire. The hint below replaces it.
              onClick={() => handleRate(r.quality)}
            >
              <div>{r.label}</div>
              {/* Very small, so the button stays compact at 4-across. */}
              <div
                className="fw-normal lh-sm"
                style={{ fontSize: '0.65rem', opacity: 0.85 }}
              >
                {r.hint}
              </div>
            </button>
          ))}
        </div>
      )}

      {!isFlipped && (
        <div className="text-center mt-4">
          <button className="btn btn-dark px-5" onClick={handleFlip}>
            Show Answer
          </button>
        </div>
      )}
    </div>
  );
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
