// Settings utilities for display mode

export async function getDisplayMode() {
    try {
        const result = await chrome.storage.sync.get('displayMode');
        return result.displayMode || 'popup'; // Default to popup
    } catch (error) {
        console.error('Error getting display mode:', error);
        return 'popup';
    }
}

export async function setDisplayMode(mode) {
    try {
        await chrome.storage.sync.set({ displayMode: mode });
        console.log('Display mode set to:', mode);
    } catch (error) {
        console.error('Error setting display mode:', error);
    }
}
