import { useState, useEffect } from 'react';
import { getDisplayMode, setDisplayMode } from '../utils/settings';

export default function Header({ theme, onToggleTheme }) {
    const [displayMode, setDisplayModeState] = useState('popup');

    useEffect(() => {
        getDisplayMode().then(setDisplayModeState);
    }, []);

    const toggleDisplayMode = async () => {
        const newMode = displayMode === 'popup' ? 'in-page' : 'popup';
        await setDisplayMode(newMode);
        setDisplayModeState(newMode);

        // Reload to apply changes
        window.location.reload();
    };

    return (
        <header className="flex items-center justify-between px-6 py-5 z-10">
            <div className="flex items-center gap-2">
                <svg className="text-primary text-2xl" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor">
                    <path d="M0 0h24v24H0V0z" fill="none" />
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                </svg>
                <h1 className="text-xl font-bold text-text-primary-light dark:text-text-primary-dark tracking-tight">Lyrical</h1>
            </div>

            <div className="flex gap-2">
                {/* Display Mode Toggle */}
                <button
                    onClick={toggleDisplayMode}
                    className="text-xs px-3 py-1 rounded-full bg-surface-light dark:bg-surface-dark text-text-secondary-light dark:text-text-secondary-dark hover:text-text-primary-light dark:hover:text-text-primary-dark transition-colors"
                    title={`Switch to ${displayMode === 'popup' ? 'in-page' : 'popup'} mode`}
                >
                    {displayMode === 'popup' ? '📱 Popup' : '🖥️ In-Page'}
                </button>

                {/* Theme Toggle */}
                <button
                    onClick={onToggleTheme}
                    className="text-text-secondary-light dark:text-text-secondary-dark hover:text-text-primary-light dark:hover:text-text-primary-dark transition-colors rounded-full p-2 hover:bg-surface-light dark:hover:bg-surface-dark focus:outline-none"
                    aria-label="Toggle Theme"
                >
                    {theme === 'dark' ? (
                        <svg className="text-xl" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor">
                            <path d="M0 0h24v24H0V0z" fill="none" />
                            <path d="M9 2c-1.05 0-2.05.16-3 .46 4.06 1.27 7 5.06 7 9.54 0 4.48-2.94 8.27-7 9.54.95.3 1.95.46 3 .46 5.52 0 10-4.48 10-10S14.52 2 9 2z" />
                        </svg>
                    ) : (
                        <svg className="text-xl" xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 0 24 24" width="24px" fill="currentColor">
                            <path d="M0 0h24v24H0V0z" fill="none" />
                            <path d="M20 8.69V4h-4.69L12 .69 8.69 4H4v4.69L.69 12 4 15.31V20h4.69L12 23.31 15.31 20H20v-4.69L23.31 12 20 8.69zM12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm0-10c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4z" />
                        </svg>
                    )}
                </button>
            </div>
        </header>
    );
}
