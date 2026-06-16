import { useState } from 'react'
import './Query.css'

export default function Query(){
    const [error, setError] = useState('');
    /* const [wordList, setWordList] = useState([]) */
    const [kanjiList, setKanjiList] = useState([]); 
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [expandedKanji, setExpandedKanji] = useState(null)

    //Prepare kanji for searching by extracting appropriate values from query string
    const extractKanji = text => {
        const kanjiRegex = /[\u4e00-\u9faf\u3400-\u4dbf]/g;
        return text.match(kanjiRegex) || [];
    };

    const kanjiSearch = async (e) => {
        e.preventDefault();
        const kanjiToSearch = [...new Set(extractKanji(query))]

        //Return if no valid kanji entered
        if (kanjiToSearch.length === 0){
            setError('Please enter at least one kanji Character.');
            setKanjiList([])
            return;
        }
        
        /* if (!query.trim()){
            setWordList([]);
            setKanjiList([]);
            setError("Please enter a sentence or phrase.");
            return
        } */

        //Reset state before submission
        setError('');
        setKanjiList([]);
        //setWordList([])
        setIsLoading(true);
        setExpandedKanji(null);

        /* try {
            const jishoResponse = await fetch(`/api/jishoapi?keyword=${encodeURIComponent(query)}`)
            if (!jishoResponse.ok) return null;
            const jishoData = await jishoResponse.json();
            
            const words = jishoData.data || [];
            if (words.length === 0){
                throw new Error('No dictionary definitions found')
            }
            console.log(words);
            setWordList(words)
        } catch (err) {
            setError(err.message || 'Something went wrong');
        } finally {
            setIsLoading(false)
        } */


        try {
            const fetchPromises = kanjiToSearch.map(async (char) => {
                const response = await fetch(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(char)}`);
                if (!response.ok) return null;
                const kanjiData = await response.json()
                
                //Add common words from Jisho API here.
                let commonWords = [];
                try {
                    const jishoResponse = await fetch(`/api/jishoapi?keyword=${encodeURIComponent(char)}`)
                    if (!jishoResponse.ok) return null;
                    const jishoData = await jishoResponse.json();
                    
                    commonWords = (jishoData.data || []).slice(0, 10);
                } catch (jishoErr) {
                    setError(jishoErr.message || `Error fetching common words for ${char}:`);
                } 
                return {
                    ...kanjiData,
                    commonWords
                }
            })
            const results = await Promise.all(fetchPromises);

            const filteredResults = results.filter(e => e !== null)

            console.log(filteredResults)

            setKanjiList(filteredResults);
        }

        catch (err) {
            setError(err.message || 'Something went wrong')
        } 
        finally {
            setIsLoading(false)
        } 
    }

    
    
    return (
        <>
            <div className="d-flex flex-column align-items-center text-center mb-4">
                <form onSubmit={kanjiSearch} className="w-100 d-flex gap-2">
                    <input
                        id="kanjiInput"
                        className="form-control form-control-lg fs-6"
                        type="text"
                        placeholder='Type kanji here...' 
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <button
                        id="searchButton"
                        type="submit"
                        className="btn btn-dark px-4"
                        disabled={isLoading}
                    >
                            Search
                    </button>
                </form>
            </div>

            {error && <div>{error}</div>}

            {isLoading ?
                <div><p>Kanji results loading...</p></div>

                :

                kanjiList.length > 0 &&(

                    <div className="container">
                        
                        {/* Always show ALL mini cards in a row at the top */}
                        <div className="d-flex flex-wrap gap-3 mb-4">
                            {kanjiList.map((kanjiData) => {
                                const isSelected = expandedKanji === kanjiData.kanji;
                                return (
                                    <div 
                                        key={kanjiData.kanji} 
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
                            })}
                        </div>

                        {/* Show the detailed card below the row when one is selected. Because of constraints of JSX the arrow function is followed by () to invoke it as IIFE. */}
                        {expandedKanji && (() => {
                            // Find the data object for the currently clicked kanji
                            const selectedData = kanjiList.find(k => k.kanji === expandedKanji);
                            if (!selectedData) return null;

                            return (
                                <div className="card shadow-sm border-light mb-3 w-100">
                                    
                                    <div className="card-header bg-white border-0 text-end pb-0 pt-3">
                                        <button 
                                            type="button" 
                                            className="btn-close" 
                                            aria-label="Close" 
                                            onClick={() => setExpandedKanji(null)}
                                        ></button>
                                    </div>

                                    <div className="card-body p-4 pt-0">
                                        
                                        <div>
                                            <h2 className="display-1 fw-bold text-dark mb-3">{selectedData.kanji}</h2>
                                        </div>
                                        
                                        <div className="mb-4">
                                            
                                            <div className="d-flex flex-wrap gap-4 mb-2">
                                                {selectedData.kun_readings && 
                                                    <div className="fs-5">
                                                        <strong className="text-body-secondary">Kun'yomi:</strong> 
                                                        <span> {selectedData.kun_readings.join("、 ")}</span>
                                                    </div>
                                                }
                                                {selectedData.on_readings && 
                                                    <div className="fs-5">
                                                        <strong className="text-body-secondary">On'yomi:</strong> 
                                                        <span> {selectedData.on_readings.join("、 ")}</span>
                                                    </div>
                                                }
                                            </div>
                                            
                                            {selectedData.meanings && 
                                                <div className="fs-5">
                                                    <strong className="text-body-secondary">Meanings:</strong> {selectedData.meanings.join(', ')}
                                                </div>
                                            }

                                        </div>

                                        <div className="d-flex flex-wrap gap-4 mb-4 text-muted small">
                                            {selectedData.jlpt && <div><strong>JLPT:</strong> N{selectedData.jlpt}</div>}
                                            {selectedData.grade && <div><strong>Grade Level:</strong> {selectedData.grade}</div>}
                                            {selectedData.freq_mainichi_shinbun && <div><strong>Frequency Rank: </strong> {selectedData.freq_mainichi_shinbun}</div>}
                                        </div>

                                        {selectedData.notes && selectedData.notes.length > 0 && (
                                            <div className="mb-3"><strong>Notes:</strong> {selectedData.notes}</div>
                                        )}

                                        {selectedData.commonWords && selectedData.commonWords.length > 0 && (
                                            
                                            <div>
                                                
                                                <h5 className="fw-bold border-bottom pb-2 mb-3 text-secondary">
                                                    Common Words
                                                </h5>
                                                
                                                <div className="ps-2">
                                                    {selectedData.commonWords.map((wordObj, wIdx) => {
                                                        const mainJP = wordObj.japanese[0];
                                                        const definitions = wordObj.senses[0]?.english_definitions.join(', ') || '';
                                                        return (

                                                            <div key={wIdx} className="mb-2">
                                                                <strong className="text-info-emphasis fs-5">{mainJP.word || mainJP.reading}</strong>
                                                                {mainJP.word && <span className="text-muted ms-1">({mainJP.reading})</span>}
                                                                <span className="text-muted ms-2">— {definitions}</span>
                                                            </div>
                                                        )
                                                    })}
                                                </div>
                                            
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                )
            }
        </>
    )
    
}