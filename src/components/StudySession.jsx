import { useState } from 'react';
import { calculateNextReview, getCardsForReview } from '../utils/srs';

const RATINGS = [
  { quality: 0, label: 'Again', color: '#dc3545', hint: 'Complete blackout' },
  { quality: 3, label: 'Hard',  color: '#fd7e14', hint: 'Very difficult' },
  { quality: 4, label: 'Good',  color: '#198754', hint: 'Correct with effort' },
  { quality: 5, label: 'Easy',  color: '#0d6efd', hint: 'Perfect recall' },
];

export default function StudySession({ deck, onUpdateCardSRS, onBack }) {
  const [queue, setQueue] = useState(() => {
    const due = getCardsForReview(deck.cards);
    return shuffleArray([...due]);
  });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionStats, setSessionStats] = useState({ again: 0, hard: 0, good: 0, easy: 0 });
  const [done, setDone] = useState(false);

  const total = queue.length;
  const current = queue[currentIndex];

  const handleFlip = () => setIsFlipped(true);

  const handleRate = (quality) => {
    const metrics = calculateNextReview(current, quality);
    onUpdateCardSRS(current.id, metrics);

    const ratingKey = RATINGS.find(r => r.quality === quality)?.label.toLowerCase();
    setSessionStats(prev => ({ ...prev, [ratingKey]: prev[ratingKey] + 1 }));

    if (quality === 0) {
      // Put the card back at the end of the queue for re-review this session.
      // Carry the freshly computed SRS state (`metrics`) onto the copy so the
      // second rating builds on this one instead of the stale pre-review state
      // — otherwise re-rating would silently overwrite this update.
      setQueue(prev => {
        const next = [...prev];
        next.push({ ...current, ...metrics });
        return next;
      });
    }

    const nextIndex = currentIndex + 1;
    if (nextIndex >= queue.length && quality !== 0) {
      setDone(true);
    } else {
      setCurrentIndex(nextIndex);
      setIsFlipped(false);
    }
  };

  if (done) {
    const reviewed = sessionStats.again + sessionStats.hard + sessionStats.good + sessionStats.easy;
    const correct = sessionStats.good + sessionStats.easy;
    const pct = reviewed > 0 ? Math.round((correct / reviewed) * 100) : 0;
    // "Again" cards get re-queued and rated twice, so the queue length
    // overstates how many distinct cards were studied. Count unique ids.
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

        <button className="btn btn-dark mt-3" onClick={onBack}>
          Back to Deck
        </button>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="text-center py-5">
        <p className="text-muted">No cards due for review.</p>
        <button className="btn btn-outline-dark mt-2" onClick={onBack}>Back</button>
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
        <button className="btn btn-outline-secondary btn-sm" onClick={onBack}>
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
          {/* Front */}
          <div style={{ fontSize: isWord ? '3rem' : '5rem', fontWeight: 'bold', lineHeight: 1, marginBottom: '0.5rem' }}>
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

              {/* Verb forms (word cards only). Show the dictionary form when it
                  differs from the front (e.g. する-nouns: front 勉強 → 勉強する),
                  and always the polite ます form. */}
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

      {/* Rating buttons — only shown after flip */}
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
              }}
              title={r.hint}
              onClick={() => handleRate(r.quality)}
            >
              <div>{r.label}</div>
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
