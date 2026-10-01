// Content script to detect media info

// Expose a global function that content-panel can call directly
window.getSongInfoFromPage = function () {
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
            const mini = document.querySelector('ytd-miniplayer');
            const isMiniActive = mini && (
                mini.hasAttribute('active') ||
                mini.offsetParent !== null ||
                window.getComputedStyle(mini).display !== 'none'
            );

            if (!isMiniActive) {
                console.log('[Content] Non-watch page without active miniplayer song - ignoring hover previews');
                return null;
            }

            // Extract the displayed title inside the miniplayer DOM
            const miniTitleEl = mini.querySelector(
                ".ytp-title-link, #video-title, .info-bar [class*='title'], .info-bar"
            );
            const miniTitle = miniTitleEl?.innerText?.trim() || "";

            // Check MediaSession first: If MediaSession title matches miniplayer title,
            // it is 100% verified to belong to the miniplayer!
            const msInfo = getMediaSessionMetadata();
            let isMediaSessionForMini = false;

            if (msInfo && msInfo.title && miniTitle) {
                const normMini = miniTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
                const normMedia = msInfo.title.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (
                    normMini.length > 0 &&
                    normMedia.length > 0 &&
                    (normMini.includes(normMedia.slice(0, 6)) || normMedia.includes(normMini.slice(0, 6)))
                ) {
                    isMediaSessionForMini = true;
                }
            }

            if (isMediaSessionForMini && msInfo) {
                // Legitimate miniplayer track confirmed! Extract real videoId from MediaSession artwork
                if (msInfo.artwork) {
                    const m = msInfo.artwork.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
                    if (m && m[1]) videoId = m[1];
                }
                if (!videoId) {
                    try {
                        const player = mini.querySelector('#movie_player') || document.getElementById('movie_player');
                        const pvid = player?.getVideoData?.()?.video_id;
                        if (pvid && pvid.length === 11) videoId = pvid;
                    } catch {}
                }
                msInfo.videoId = videoId || null;
                if (!msInfo.artwork && videoId) {
                    msInfo.artwork = getYouTubeArtworkFromPage(videoId);
                }
                console.log('[Content] Verified MediaSession for miniplayer:', msInfo);
                return msInfo;
            }

            // If MediaSession does NOT match miniplayer title, MediaSession is a hover preview hijack on the feed!
            // Fall back to extracting videoId directly from miniplayer DOM:
            try {
                const player = mini.querySelector('#movie_player') || document.getElementById('movie_player');
                if (player && !player.closest?.('ytd-inline-preview-player, #inline-preview-player, ytd-thumbnail, ytd-rich-grid-media, ytd-video-preview')) {
                    const pvid = player?.getVideoData?.()?.video_id;
                    if (pvid && pvid.length === 11) videoId = pvid;
                }
            } catch {}

            if (!videoId) {
                try {
                    const selItem = mini.querySelector(
                        "ytd-playlist-panel-video-renderer[selected] a[href*='watch?v='], [aria-selected='true'] a[href*='watch?v='], .selected a[href*='watch?v=']"
                    );
                    if (selItem && selItem.href) {
                        const match = selItem.href.match(/[?&]v=([^&]+)/);
                        if (match && match[1]) videoId = match[1];
                    }
                } catch {}
            }

            if (!videoId) {
                try {
                    const titleLink = mini.querySelector(
                        ".ytp-title-link[href*='watch?v='], a.ytp-title-link"
                    );
                    if (titleLink && titleLink.href) {
                        const match = titleLink.href.match(/[?&]v=([^&]+)/);
                        if (match && match[1]) videoId = match[1];
                    }
                } catch {}
            }

            if (!videoId) {
                try {
                    const imgs = mini.querySelectorAll("img[src*='/vi/']");
                    for (const img of Array.from(imgs)) {
                        const m = img.src.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
                        if (m && m[1]) {
                            videoId = m[1];
                            break;
                        }
                    }
                } catch {}
            }

            if (!videoId) {
                console.log('[Content] Active miniplayer without identifiable videoId - skipping');
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

    // Try MediaSession for watch page
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
    }

    if (isMediaSessionValid && mediaSessionInfo && mediaSessionInfo.title) {
        if (!mediaSessionInfo.artwork && videoId) {
            mediaSessionInfo.artwork = getYouTubeArtworkFromPage(videoId);
        }
        if (videoId && !mediaSessionInfo.videoId) {
            mediaSessionInfo.videoId = videoId;
        }
        return mediaSessionInfo;
    }

    // Fallback to page scraping
    const scrapedInfo = scrapePageInfo(videoId);
    if (scrapedInfo) {
        if (!scrapedInfo.artwork && videoId) {
            scrapedInfo.artwork = getYouTubeArtworkFromPage(videoId);
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

function getYouTubeArtworkFromPage(videoId) {
    if (!window.location.hostname.includes('youtube.com')) return null;

    // Direct video thumbnail if videoId is known (always reliable, high resolution, and never stale)
    if (videoId) {
        return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
    }

    const isWatchUrl = window.location.pathname.includes('/watch');
    if (isWatchUrl) {
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
                (window?.ytplayer?.config?.args?.player_response &&
                    JSON.parse(window.ytplayer.config.args.player_response));
            const thumbs = playerResponse?.videoDetails?.thumbnail?.thumbnails;
            if (Array.isArray(thumbs) && thumbs.length > 0) {
                return thumbs[thumbs.length - 1]?.url || thumbs[0]?.url || null;
            }
        } catch {
            // ignore parse/read failures
        }
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

        // Pick highest resolution artwork or last item in array
        let artworkUrl = null;
        if (Array.isArray(artwork) && artwork.length > 0) {
            artworkUrl = artwork[artwork.length - 1]?.src || artwork[0]?.src || null;
        }

        // If title still has " - ", try to extract artist and song
        if (title && title.includes(' - ')) {
            const parts = title.split(' - ');
            return {
                artist: parts[0].trim(),
                title: parts[1].trim(),
                album: album || "",
                artwork: artworkUrl
            };
        }

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
function scrapePageInfo(videoId) {
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
                'ytd-miniplayer .info-bar .title',
                'ytd-miniplayer .info-bar [class*="title"]',
                'ytd-miniplayer .info-bar',
                'ytd-miniplayer [class*="title"]',
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
                'ytd-miniplayer #channel-name a',
                'ytd-miniplayer #channel-name',
                'ytd-miniplayer #owner-name',
                'ytd-miniplayer .byline a',
                'ytd-miniplayer .byline',
                'ytd-miniplayer [class*="byline"]',
                'ytd-miniplayer ytd-channel-name',
                'ytd-miniplayer [class*="owner"]',
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
                    artwork: getYouTubeArtworkFromPage(videoId),
                    videoId: videoId || null
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
                artwork: getYouTubeArtworkFromPage(videoId),
                videoId: videoId || null
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
                    artwork: getYouTubeArtworkFromPage(videoId),
                    videoId: videoId || null
                };
                console.log('[Content] Parsed from document.title:', result);
                return result;
            }
            const result = {
                title: docTitle,
                artist: 'YouTube',
                artwork: getYouTubeArtworkFromPage(videoId),
                videoId: videoId || null
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
