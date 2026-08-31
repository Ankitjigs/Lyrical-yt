# Lyrical-YouTube Lyrics Extension

**Lyrical** is a Chrome extension that brings synchronized lyrics directly to your favorite streaming platforms. Enjoy a seamless singing experience on **YouTube** and **Spotify** with a beautiful, floating lyrics panel.

![Lyrical Banner](public/icon128.png)

## Features

- **🎵 Synced Lyrics**: Automatically fetches and displays synchronized lyrics for the currently playing song using LRCLIB.
- **🌐 Translations**: Instant translations for over 100 languages using Google Translate.
- **🔤 Romanization**: Sing along to K-pop, J-pop, and more with automatic Romanization (Latin script).
- **🎨 Beautiful UI**: a sleek, dark-themed floating panel that blends perfectly with modern players.
- **⏱️ Manual Sync**: Tools to adjust lyric timing if they are slightly off.

## Installation (Developer Mode)

1.  **Clone the repository**:

    ```bash
    git clone https://github.com/yourusername/lyrical.git
    cd lyrical
    ```

2.  **Install dependencies**:

    ```bash
    npm install
    ```

3.  **Build the extension**:

    ```bash
    npm run build
    ```

    This will create a `dist` folder containing the production-ready extension.

4.  **Load into Chrome**:
    - Open Chrome and navigate to `chrome://extensions/`.
    - Toggle **Developer mode** in the top right corner.
    - Click **Load unpacked**.
    - Select the `dist` folder from your project directory.

## Development

To run the project in development mode (hot-reload for UI components, though extension reloading usually requires a rebuild):

```bash
npm run dev
```

## Permissions

- **activeTab**: to inject the lyrics panel into the current tab.
- **storage**: to save user preferences (theme, language, position).
- **host_permissions**: required for fetching lyrics from `lrclib.net` and translations from `translate.googleapis.com`.

## Tech Stack

- **Frontend**: Vanilla JavaScript / React (Migration in progress)
- **Build Tool**: Vite
- **Styling**: CSS / Tailwind

## License
