// Word-lookup results as clickable rows; the parent shows the selected word's
// WordDetailCard.
//
// Rows render the word as PLAIN text, not clickable-kanji buttons: the row is
// itself a button, and nesting one inside another is invalid HTML. Per-kanji
// navigation lives in the detail card instead.

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
              {/* wordBreak: keep-all forbids breaking *inside* a run of CJK
                  characters, so a word never stacks vertically when the row is
                  tight. Breaks are still allowed elsewhere, so the parenthesised
                  reading can drop to the next line — which is what we want. */}
              <div
                className="fs-5 fw-semibold"
                style={{ wordBreak: 'keep-all', overflowWrap: 'anywhere' }}
              >
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
