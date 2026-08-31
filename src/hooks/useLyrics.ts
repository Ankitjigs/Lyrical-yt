import { useState, useEffect } from 'react';

// Helper function to parse synced lyrics from LRC format
function parseSyncedLyrics(lrcText) {
    if (!lrcText) return null;

    const lines = lrcText.split('\n');
    const parsed = lines.map(line => {
        // Match format: [MM:SS.xx] text
        const match = line.match(/\[(\d{2}):(\d{2}\.\d{2})\]\s*(.*)/);
        if (match) {
            const minutes = parseInt(match[1]);
            const seconds = parseFloat(match[2]);
            return {
                time: minutes * 60 + seconds,
                text: match[3]
            };
        }
        return null;
    }).filter(Boolean);

    return parsed.length > 0 ? parsed : null;
}

export default function useLyrics(songInfo) {
    const [lyrics, setLyrics] = useState('');
    const [syncedLyrics, setSyncedLyrics] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!songInfo || !songInfo.title || !songInfo.artist) {
            setLyrics('');
            setSyncedLyrics(null);
            setError(null);
            setIsLoading(false);
            return;
        }

        const fetchLyrics = async () => {
            setIsLoading(true);
            setError(null);

            try {
                // Clean up song title and artist for better search results
                const cleanTitle = songInfo.title
                    .replace(/\s*\(.*?\)\s*/g, '') // Remove parentheses content
                    .replace(/\s*\[.*?\]\s*/g, '') // Remove bracket content
                    .replace(/\s*-\s*.*?(remix|edit|version|remaster).*/gi, '') // Remove remix/version info
                    .trim();
                const cleanArtist = songInfo.artist.split(',')[0].split('&')[0].trim();

                // Create cache key from artist and title
                const cacheKey = `lyrics_${cleanArtist.toLowerCase()}_${cleanTitle.toLowerCase()}`;

                // Check cache first
                if (chrome?.storage?.local) {
                    const cached = await chrome.storage.local.get(cacheKey);
                    if (cached[cacheKey]) {
                        console.log('Lyrics loaded from cache');
                        const cachedData = cached[cacheKey];
                        setLyrics(cachedData.plain || '');
                        setSyncedLyrics(cachedData.synced || null);
                        setError(null);
                        setIsLoading(false);
                        return;
                    }
                }

                // Use lrclib API for better lyrics coverage
                const url = `https://lrclib.net/api/get?artist_name=${encodeURIComponent(cleanArtist)}&track_name=${encodeURIComponent(cleanTitle)}`;

                console.log('Fetching lyrics from lrclib:', { artist: cleanArtist, title: cleanTitle });

                const res = await fetch(url);

                if (!res.ok) {
                    if (res.status === 404) {
                        setLyrics('');
                        setError('Lyrics not found for this song.');
                    } else {
                        throw new Error(`API returned status ${res.status}`);
                    }
                    return;
                }

                const data = await res.json();

                let fetchedLyrics = '';
                let fetchedSynced = null;

                // lrclib returns plainLyrics (unsynced) and syncedLyrics (with timestamps)
                if (data.syncedLyrics) {
                    // Parse synced lyrics for karaoke-style display
                    fetchedSynced = parseSyncedLyrics(data.syncedLyrics);
                    console.log('Synced lyrics parsed:', fetchedSynced ? fetchedSynced.length + ' lines' : 'none');
                }

                if (data.plainLyrics) {
                    fetchedLyrics = data.plainLyrics;
                    console.log('Plain lyrics fetched successfully');
                } else if (data.syncedLyrics) {
                    // Fallback to synced lyrics without timestamps
                    fetchedLyrics = data.syncedLyrics.replace(/\[\d{2}:\d{2}\.\d{2}\]\s*/g, '');
                    console.log('Using synced lyrics as fallback');
                } else {
                    setLyrics('');
                    setSyncedLyrics(null);
                    setError('Lyrics not found for this song.');
                    return;
                }

                // Store in cache for future use
                if (chrome?.storage?.local && fetchedLyrics) {
                    await chrome.storage.local.set({
                        [cacheKey]: {
                            plain: fetchedLyrics,
                            synced: fetchedSynced
                        }
                    });
                    console.log('Lyrics cached successfully');
                }

                setLyrics(fetchedLyrics);
                setSyncedLyrics(fetchedSynced);
                setError(null);
            } catch (err) {
                console.error('Lyrics fetch error:', err);
                setLyrics('');
                setSyncedLyrics(null);
                setError('Error fetching lyrics. Please try again.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchLyrics();
    }, [songInfo?.title, songInfo?.artist]);

    return { lyrics, syncedLyrics, isLoading, error };
}
