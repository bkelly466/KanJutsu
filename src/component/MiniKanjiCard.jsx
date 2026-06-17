// Presentational Component

export default function MiniKanjiCard({ kanjiData, setExpandedKanji, expandedKanji }) {

    const isSelected = expandedKanji === kanjiData.kanji;
    return (
        <div  
            className={`card shadow-sm text-center clickable-card ${isSelected ? 'border-secondary border-2' : 'border-light'}`} 
            style={{ width: '120px', cursor: 'pointer' }}
            onClick={() => setExpandedKanji(kanjiData.kanji)}
        >
            <div className="card-body d-flex flex-column justify-content-center align-items-center p-3">
                <h2 className="display-3 fw-bold text-dark m-0">{kanjiData.kanji}</h2>
                <span className="text-muted small mt-2">
                    {isSelected ? 'Viewing' : 'View Info'}
                </span>
            </div>
        </div>
    );
}