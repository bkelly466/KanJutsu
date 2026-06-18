import { useState } from 'react';
import MiniKanjiCard from './MiniKanjiCard';
import DetailedInfoCard from './DetailedInfoCard';

export default function Query(){
    const [error, setError] = useState('');
    const [kanjiList, setKanjiList] = useState([]); 
    const [query, setQuery] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [expandedKanji, setExpandedKanji] = useState(null);

    const selectedData = kanjiList.find(k => k.kanji === expandedKanji);

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

        //Reset state before submission
        setError('');
        setKanjiList([]);
        setIsLoading(true);
        setExpandedKanji(null);

        // Kanji data pulled from kanjiapi.dev and enriched with common words from the jisho api.
        try {
            const fetchPromises = kanjiToSearch.map(async (char) => {
                const response = await fetch(`https://kanjiapi.dev/v1/kanji/${encodeURIComponent(char)}`);
                if (!response.ok) return null;
                const kanjiData = await response.json()
                
                //Add common words from Jisho API here. 
                let commonWords = [];
                try {
                    //The Jisho API doesn't send permissive CORS headers for client side browser requests. 
                    // The same origin policy is only enforced by web browsers, not by servers. So I created
                    // I used a Vite proxy server (vite.config.js) for development and a serverless function is used when deployed on Vercel (vercel.json) 
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

            {error && 
                <div>{error}</div>
            }

            {isLoading ?

                <div><p>Kanji results loading...</p></div>

                :

                kanjiList.length > 0 &&(

                    <div className="container">
                        
                        {/* Always show ALL mini cards in a row at the top */}
                        <div 
                            className="d-flex flex-nowrap gap-3 pb-2 w-100" 
                            style={{ 
                                overflowX: 'auto', 
                                WebkitOverflowScrolling: 'touch' 
                                }}
                        >
                            {kanjiList.map((kanjiData) => 
                                    <MiniKanjiCard key={kanjiData.kanji} kanjiData={kanjiData} setExpandedKanji={setExpandedKanji} expandedKanji={expandedKanji} />
                            )}
                        </div>

                        {/* Show the detailed card below the row when one is selected. */}
                        {expandedKanji && 
                            <DetailedInfoCard selectedData={selectedData} setExpandedKanji={setExpandedKanji} />
                        }
                    </div>
                )
            }
        </>
    )
    
}