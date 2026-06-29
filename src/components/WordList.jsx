// Presentational Component
//
// Renders word-lookup results as a vertical list of clickable rows. Clicking a
// row selects that word (the parent then shows its WordDetailCard).
//
// Note: rows render the word as PLAIN text — not clickable-kanji buttons —
// because the row itself is clickable, and nesting a <button> inside another
// clickable element is invalid HTML. Per-kanji navigation lives in the detail
// card instead.

export default function WordList({ words, expandedWordId, setExpandedWordId }) {
  return (
    <div className="list-group">
      {words.map((wordData, i) => {
        const isSelected = expandedWordId === wordData.id;
        const firstMeaning = wordData.meanings.slice(0, 3).join(', ');

        return (
          <button
            key={`${wordData.id}-${i}`}
            type="button"
            className={`list-group-item list-group-item-action d-flex justify-content-between align-items-start ${
              isSelected ? 'active' : ''
            }`}
            onClick={() => setExpandedWordId(isSelected ? null : wordData.id)}
          >
            <div className="text-start">
              <div className="fs-5 fw-semibold">
                {wordData.word}
                {wordData.reading && wordData.reading !== wordData.word && (
                  <span className={`ms-2 small ${isSelected ? '' : 'text-muted'}`}>
                    ({wordData.reading})
                  </span>
                )}
              </div>
              {firstMeaning && (
                <div className={`small ${isSelected ? '' : 'text-muted'}`}>
                  {firstMeaning}
                </div>
              )}
            </div>

            <div className="d-flex flex-column align-items-end gap-1 ms-2">
              {wordData.isCommon && (
                <span className="badge bg-success">common</span>
              )}
              {wordData.jlpt.map((level) => (
                <span key={level} className="badge bg-secondary">
                  {level}
                </span>
              ))}
            </div>
          </button>
        );
      })}
    </div>
  );
}
