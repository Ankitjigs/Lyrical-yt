// Content script to detect media info

// Expose a global function that content-panel can call directly
window.getSongInfoFromPage = function () {
    console.log('[Content] getSongInfoFromPage called');

    let videoId = null;
    const isYouTube = window.location.hostname.includes('youtube.com');
    const isWatchUrl = isYouTube && window.location.pathname.includes('/watch');

    if (isYouTube) {
        if (isWatchUrl) {
            videoId = new URLSearchParams(window.location.search).get('v') || null;
            if (!videoId) {
                try {
                    const player = document.getElementById('movie_player');
                    if (player && !player.closest?.('ytd-inline-preview-player, #inline-preview-player')) {
                        videoId = player?.getVideoData?.()?.video_id || null;
                    }
                } catch {}
            }
        } else {
            // NOT on watch page (e.g. youtube.com home feed, search, subscriptions)
            // The ONLY legitimate music source is the active YouTube miniplayer!
            // NEVER inspect document.getElementById('movie_player') or generic players here,
            // because thumbnail hover-previews mount an inline player.
            try {
                const miniLink = document.querySelector(
                    "ytd-miniplayer a[href*='watch?v='], ytd-miniplayer [href*='watch?v=']"
                );
                if (miniLink && miniLink.href) {
                    const match = miniLink.href.match(/[?&]v=([^&]+)/);
                    if (match && match[1]) videoId = match[1];
                }
            } catch {}

            // If there's no miniplayer video, there is NO song on this page - ignore hover previews
            if (!videoId) {
                console.log('[Content] Non-watch page without active miniplayer song - ignoring hover previews');
                return null;
            }
        }
    }

    // Check if an ad is currently playing on YouTube
    let isAd = false;
    if (isYouTube) {
        const player = document.getElementById('movie_player');
        if (player) {
            const hasAdClass =
                player.classList?.contains('ad-showing') ||
                player.classList?.contains('ad-interrupting');
            const adModule = player.querySelector('.video-ads.ytp-ad-module');
            const hasAdChildren = Boolean(adModule && adModule.children.length > 0);
            const hasAdOverlay = Boolean(
                player.querySelector(
                    '.ytp-ad-player-overlay, .ytp-ad-skip-button, .ytp-ad-skip-button-modern, .ytp-ad-preview-container',
                ),
            );
            if (hasAdClass || (hasAdChildren && hasAdOverlay)) {
                isAd = true;
            }
        }
    }

    // Try MediaSession first ONLY IF it is not an ad
    const mediaSessionInfo = getMediaSessionMetadata();
    const isAdMediaSession =
        isAd ||
        mediaSessionInfo?.title?.toUpperCase() === 'UNLABELED' ||
        mediaSessionInfo?.artist?.toLowerCase().includes('emp experiment') ||
        mediaSessionInfo?.artist?.toLowerCase().includes('youtube premium');

    if (isAdMediaSession) {
        console.log('[Content] Ad detected on YouTube - skipping song fetch');
        return {
            isAd: true,
            title: "Ad in progress...",
            artist: "Advertisement",
            videoId: videoId
        };
    }

    // Guard MediaSession against thumbnail hover-previews:
    // If MediaSession artwork has a video ID that doesn't match our valid videoId,
    // or if on non-watch page and MediaSession title doesn't match miniplayer text,
    // MediaSession has been hijacked by a hover preview!
    let isMediaSessionValid = false;
    if (mediaSessionInfo && mediaSessionInfo.title) {
        isMediaSessionValid = true;
        if (videoId && mediaSessionInfo.artwork) {
            const artMatch = mediaSessionInfo.artwork.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
            if (artMatch && artMatch[1] && artMatch[1] !== videoId) {
                console.debug('[Content] MediaSession artwork videoId (' + artMatch[1] + ') does not match active videoId (' + videoId + ') - rejecting hover preview session');
                isMediaSessionValid = false;
            }
        }
        if (!isWatchUrl && isMediaSessionValid) {
            const miniTitleEl = document.querySelector("ytd-miniplayer #video-title, ytd-miniplayer .ytp-title-link, ytd-miniplayer .info-bar");
            const miniTitle = miniTitleEl?.innerText?.trim();
            if (miniTitle && !miniTitle.toLowerCase().includes(mediaSessionInfo.title.toLowerCase().slice(0, 10)) && !mediaSessionInfo.title.toLowerCase().includes(miniTitle.toLowerCase().slice(0, 10))) {
                console.debug('[Content] MediaSession title does not match miniplayer title - rejecting hover preview session');
                isMediaSessionValid = false;
            }
        }
    }

    if (isMediaSessionValid && mediaSessionInfo && mediaSessionInfo.title) {
        if (!mediaSessionInfo.artwork) {
            mediaSessionInfo.artwork = getYouTubeArtworkFromPage();
        }
        if (videoId && !mediaSessionInfo.videoId) {
            mediaSessionInfo.videoId = videoId;
        }
        console.log('[Content] Using MediaSession:', mediaSessionInfo);
        return mediaSessionInfo;
    }

    // Fallback to page scraping
    const scrapedInfo = scrapePageInfo();
    if (scrapedInfo) {
        if (!scrapedInfo.artwork) {
            scrapedInfo.artwork = getYouTubeArtworkFromPage();
        }
        if (videoId && !scrapedInfo.videoId) {
            scrapedInfo.videoId = videoId;
        }
        console.log('[Content] Using scraped info:', scrapedInfo);
        return scrapedInfo;
    }

    console.log('[Content] No song info found');
    return null;
};

function getYouTubeArtworkFromPage() {
    if (!window.location.hostname.includes('youtube.com')) return null;

    const ogImage = document.querySelector('meta[property="og:image"]')?.content;
    if (ogImage) return ogImage;

    const twitterImage = document.querySelector('meta[name="twitter:image"]')?.content;
    if (twitterImage) return twitterImage;

    const thumbImg =
        document.querySelector('#thumbnail img')?.src ||
        document.querySelector('ytd-watch-metadata #owner img')?.src ||
        null;
    if (thumbImg) return thumbImg;

    try {
        const playerResponse =
            window?.ytInitialPlayerResponse ||
            window?.ytplayer?.config?.args?.player_response &&
                JSON.parse(window.ytplayer.config.args.player_response);
        const thumbs = playerResponse?.videoDetails?.thumbnail?.thumbnails;
        if (Array.isArray(thumbs) && thumbs.length > 0) {
            return thumbs[thumbs.length - 1]?.url || thumbs[0]?.url || null;
        }
    } catch {
        // ignore parse/read failures
    }

    return null;
}

function getMediaSessionMetadata() {
    if ("mediaSession" in navigator && navigator.mediaSession.metadata) {
        const metadata = navigator.mediaSession.metadata;
        let { title, artist, album, artwork } = metadata;

        // Clean the title to remove video metadata
        if (title) {
            title = title
                .replace(/\(.*?(official|music|lyric|audio|video).*?\)/gi, '')
                .replace(/\[.*?(official|music|lyric|audio|video).*?\]/gi, '')
                .replace(/\|.*$/g, '')
                .trim();
        }

        // If title still has " - ", try to extract artist and song
        if (title && title.includes(' - ')) {
            const parts = title.split(' - ');
            return {
                artist: parts[0].trim(),
                title: parts[1].trim(),
                album: album || "",
                artwork: artwork && artwork.length > 0 ? artwork[0].src : null
            };
        }

        const artworkUrl = artwork && artwork.length > 0 ? artwork[0].src : null;

        console.log("MediaSession detected:", { title, artist, album, artworkUrl });

        return {
            title: title || "",
            artist: artist || "",
            album: album || "",
            artwork: artworkUrl
        };
    }
    return null;
}

// Fallback: scrape page content
function scrapePageInfo() {
    console.log('[Content] scrapePageInfo called for:', window.location.hostname);

    // YouTube video page
    if (window.location.hostname.includes('youtube.com')) {
        console.log('[Content] Detecting YouTube song...');

        const isWatchUrl = window.location.pathname.includes('/watch');

        // Try multiple selectors for video title
        const titleSelectors = isWatchUrl
            ? [
                'h1.ytd-watch-metadata yt-formatted-string',
                'h1.title.ytd-video-primary-info-renderer yt-formatted-string',
                'ytd-watch-metadata h1',
                '#title h1 yt-formatted-string',
                'h1.title yt-formatted-string',
              ]
            : [
                'ytd-miniplayer .ytp-title-link',
                'ytd-miniplayer #video-title',
                'ytd-miniplayer .info-bar',
              ];

        let videoTitle = null;
        for (const selector of titleSelectors) {
            videoTitle = document.querySelector(selector);
            if (videoTitle && videoTitle.innerText) {
                console.log('[Content] Found title with selector:', selector, ':', videoTitle.innerText);
                break;
            }
        }

        const channelSelectors = isWatchUrl
            ? [
                '#channel-name a',
                'ytd-channel-name a',
                '#owner #channel-name a',
                'ytd-video-owner-renderer a',
              ]
            : [
                'ytd-miniplayer #channel-name',
                'ytd-miniplayer #owner-name',
              ];

        let channelName = null;
        for (const selector of channelSelectors) {
            channelName = document.querySelector(selector);
            if (channelName && channelName.innerText) {
                console.log('[Content] Found channel with selector:', selector, ':', channelName.innerText);
                break;
            }
        }

        if (videoTitle && videoTitle.innerText) {
            const fullTitle = videoTitle.innerText.trim();
            console.log('[Content] YouTube video title found:', fullTitle);

            // Clean up the title by removing common metadata
            const cleanTitle = (str) => {
                return str
                    .replace(/\(.*?(official|music|lyric|audio|video).*?\)/gi, '') // Remove (Official Video), (Lyric Video), etc.
                    .replace(/\[.*?(official|music|lyric|audio|video).*?\]/gi, '') // Remove [Official Video], etc.
                    .replace(/\|.*$/g, '') // Remove everything after |
                    .trim();
            };

            // Try to parse "Artist - Song Title" format
            if (fullTitle.includes(' - ')) {
                const parts = fullTitle.split(' - ');
                const result = {
                    artist: cleanTitle(parts[0]),
                    title: cleanTitle(parts[1]),
                    artwork: getYouTubeArtworkFromPage()
                };
                console.log('[Content] Parsed song info:', result);
                return result;
            }
            // Fallback: use channel as artist
            const cleanTitleFallback = fullTitle
                .replace(/\(.*?(official|music|lyric|audio|video).*?\)/gi, '')
                .replace(/\[.*?(official|music|lyric|audio|video).*?\]/gi, '')
                .replace(/\|.*$/g, '')
                .trim();

            const result = {
                title: cleanTitleFallback,
                artist: channelName ? channelName.innerText.trim() : 'Unknown Artist',
                artwork: getYouTubeArtworkFromPage()
            };
            console.log('[Content] Using channel as artist:', result);
            return result;
        }

        // Fallback to document.title
        console.log('[Content] Video title not found in DOM, trying document.title:', document.title);
        const docTitle = document.title.replace(' - YouTube', '').trim();
        if (docTitle && docTitle !== 'YouTube') {
            if (docTitle.includes(' - ')) {
                const parts = docTitle.split(' - ');
                const result = {
                    title: parts[0].trim(),
                    artist: parts[1] ? parts[1].trim() : 'YouTube',
                    artwork: getYouTubeArtworkFromPage()
                };
                console.log('[Content] Parsed from document.title:', result);
                return result;
            }
            const result = {
                title: docTitle,
                artist: 'YouTube',
                artwork: getYouTubeArtworkFromPage()
            };
            console.log('[Content] Using full document.title:', result);
            return result;
        }

        console.log('[Content] No song info found on YouTube');
        return null;
    }

    // Spotify
    if (window.location.hostname.includes('spotify.com')) {
        const titleEl = document.querySelector('[data-testid="context-item-info-title"]');
        const artistEl = document.querySelector('[data-testid="context-item-info-artists"]');
        if (titleEl && artistEl) {
            return { title: titleEl.innerText, artist: artistEl.innerText };
        }
    }

    // YouTube Music
    if (window.location.hostname.includes('music.youtube.com')) {
        const titleEl = document.querySelector('.title.ytmusic-player-bar');
        const artistEl = document.querySelector('.byline.ytmusic-player-bar');
        if (titleEl && artistEl) {
            return { title: titleEl.innerText, artist: artistEl.innerText };
        }
    }

    return null;
}

console.log('[Content] content.js loaded and getSongInfoFromPage is ready');
