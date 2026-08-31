import { useState, useEffect } from 'react';

export default function useSongDetection() {
    const [songInfo, setSongInfo] = useState(null);
    const [isDetecting, setIsDetecting] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchSongInfo = () => {
            // Check if chrome.tabs API is available
            if (!chrome?.tabs) {
                console.error('Chrome tabs API not available');
                setError('Chrome API not available');
                setIsDetecting(false);
                return;
            }

            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (chrome.runtime.lastError) {
                    console.error('Query error:', chrome.runtime.lastError);
                    setError(chrome.runtime.lastError.message);
                    return;
                }

                if (tabs.length === 0) {
                    console.log('No active tabs found');
                    return;
                }

                const activeTab = tabs[0];
                console.log('Active tab:', activeTab.url);

                if (activeTab.url?.startsWith('chrome://') || activeTab.url?.startsWith('edge://')) {
                    setSongInfo(null);
                    setIsDetecting(false);
                    return;
                }

                chrome.tabs.sendMessage(
                    activeTab.id,
                    { action: 'get_song_info' },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            // Silently handle connection errors (content script not loaded yet)
                            // This is normal for non-music pages
                            setSongInfo(null);
                            setIsDetecting(false);
                            return;
                        }

                        console.log('Received response:', response);

                        if (response && response.title) {
                            setSongInfo(response);
                            setError(null);
                            setIsDetecting(false);
                        } else {
                            setSongInfo(null);
                            setIsDetecting(false);
                        }
                    }
                );
            });
        };

        // Initial fetch
        fetchSongInfo();

        // Poll every 500ms for better sync
        const interval = setInterval(fetchSongInfo, 500);

        return () => clearInterval(interval);
    }, []);

    return { songInfo, isDetecting, error };
}
