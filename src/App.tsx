import { useState, useEffect } from 'react';
import Header from './components/Header';
import AlbumArt from './components/AlbumArt';
import SongInfo from './components/SongInfo';
import LyricsView from './components/LyricsView';
import useSongDetection from './hooks/useSongDetection';
import useLyrics from './hooks/useLyrics';
import useTheme from './hooks/useTheme';

function App() {
    const { theme, toggleTheme } = useTheme();
    const { songInfo, isDetecting } = useSongDetection();
    const { lyrics, syncedLyrics, isLoading, error } = useLyrics(songInfo);

    return (
        <div className="flex justify-center items-center min-h-screen bg-gray-100 dark:bg-gray-900 transition-colors duration-300 p-4">
            <div className="w-full max-w-sm h-[700px] bg-background-light dark:bg-background-dark shadow-2xl rounded-[2rem] overflow-hidden flex flex-col relative border border-gray-200 dark:border-gray-800 transition-colors duration-300">

                <Header theme={theme} onToggleTheme={toggleTheme} />

                <main className="flex-1 flex flex-col items-center px-6 pt-2 pb-6 overflow-hidden">

                    <AlbumArt src={songInfo?.artwork || 'default_art.png'} />

                    <SongInfo
                        title={songInfo?.title || 'Waiting for music...'}
                        artist={songInfo?.artist || 'Play Spotify or YouTube'}
                    />

                    <LyricsView
                        lyrics={lyrics}
                        syncedLyrics={syncedLyrics}
                        songInfo={songInfo}
                        isLoading={isLoading}
                        error={error}
                    />

                </main>
            </div>
        </div>
    );
}

export default App;
