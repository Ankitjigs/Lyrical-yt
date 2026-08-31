/**
 * Cubey (Better Lyrics / Musixmatch) Provider
 * Handles authentication via Turnstile iframe and fetching lyrics from the aggregator API.
 */

class CubeyProvider {
  constructor() {
    this.API_BASE = "https://lyrics.api.dacubeking.com/";
    this.iframe = null;
    this.pendingResolve = null;
    this.pendingReject = null;
  }

  log(...args) {
    console.log("[Lyrical:Cubey]", ...args);
  }

  /**
   * Get a valid JWT token. Checks storage first.
   */
  async getToken(forceRefresh = false) {
    if (!forceRefresh) {
      const stored = await chrome.storage.local.get("cubey_jwt");
      if (stored.cubey_jwt && !this.isTokenExpired(stored.cubey_jwt)) {
        return stored.cubey_jwt;
      }
    }

    this.log("Token missing or expired. Starting Turnstile challenge...");
    const turnstileToken = await this.performTurnstileChallenge();
    return await this.verifyTurnstile(turnstileToken);
  }

  isTokenExpired(token) {
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      // Buffer of 60 seconds
      return Date.now() / 1000 > payload.exp - 60;
    } catch (e) {
      return true;
    }
  }

  /**
   * Inject hidden iframe to get Turnstile token
   */
  performTurnstileChallenge() {
    return new Promise((resolve, reject) => {
      // Cleanup existing
      this.cleanupIframe();

      this.pendingResolve = resolve;
      this.pendingReject = reject;

      this.iframe = document.createElement("iframe");
      this.iframe.src = this.API_BASE + "challenge";

      // Styling to hide but keep active
      Object.assign(this.iframe.style, {
        position: "fixed",
        width: "0px",
        height: "0px",
        border: "none",
        zIndex: "-1",
        visibility: "hidden",
      });

      // Bind listener
      window.addEventListener("message", this.handleMessage.bind(this));

      document.body.appendChild(this.iframe);

      // Timeout safety (30s)
      setTimeout(() => {
        if (this.iframe) {
          this.cleanupIframe();
          reject(new Error("Turnstile timeout"));
        }
      }, 30000);
    });
  }

  handleMessage(event) {
    if (!this.iframe || event.source !== this.iframe.contentWindow) return;

    if (event.data.type === "turnstile-token") {
      this.log("Got Turnstile token!");
      const token = event.data.token;

      const resolve = this.pendingResolve; // Capture ref
      this.cleanupIframe();
      if (resolve) resolve(token);
    } else if (
      event.data.type === "turnstile-error" ||
      event.data.type === "turnstile-expired"
    ) {
      this.log("Turnstile error:", event.data);
      if (event.data.type === "turnstile-error") {
        this.cleanupIframe();
        if (this.pendingReject) this.pendingReject(new Error(event.data.error));
      }
    }
  }

  cleanupIframe() {
    if (this.iframe) {
      this.iframe.remove();
      this.iframe = null;
    }
    window.removeEventListener("message", this.handleMessage.bind(this));
    this.pendingResolve = null;
    this.pendingReject = null;
  }

  async verifyTurnstile(token) {
    this.log("Verifying token via background...");
    try {
      const response = await chrome.runtime.sendMessage({
        type: "CUBEY_VERIFY_TURNSTILE",
        token,
      });

      if (response.error) {
        throw new Error(`Verification failed: ${response.error}`);
      }

      const data = response;
      if (data.jwt) {
        this.log("JWT acquired");
        await chrome.storage.local.set({ cubey_jwt: data.jwt });
        return data.jwt;
      }
      throw new Error("No JWT in response");
    } catch (e) {
      this.log("Verify error:", e);
      throw e;
    }
  }

  /**
   * Fetch Lyrics
   */
  async fetchLyrics(songInfo) {
    try {
      let jwt = await this.getToken();
      if (!jwt) throw new Error("Could not obtain token");

      // Initial Fetch
      let res = await this.callApi(jwt, songInfo);

      // Handle 403 (WAF block -> Refresh Token)
      if (res.status === 403) {
        this.log("403 Forbidden. Refreshing token...");
        jwt = await this.getToken(true);
        res = await this.callApi(jwt, songInfo);
      }

      // Handle 404 (Not Found) - Graceful exit
      if (res.status === 404) {
        this.log("Song not found in Cubey/Musixmatch DB (404)");
        return null;
      }

      if (!res.ok) throw new Error(`API Error: ${res.status}`);

      return await res.json();
    } catch (e) {
      console.warn("[Lyrical:Cubey] Fetch failed:", e.message);
      return null;
    }
  }

  /**
   * Fetch the newer Better Lyrics unified provider stream.
   * This returns all provider payloads collected from /v2/lyrics.
   */
  async fetchUnifiedLyrics(songInfo) {
    try {
      let jwt = await this.getToken();
      if (!jwt) throw new Error("Could not obtain token");

      let res = await this.callUnifiedApi(jwt, songInfo);

      if (res.status === 403) {
        this.log("Unified API returned 403. Refreshing token...");
        jwt = await this.getToken(true);
        res = await this.callUnifiedApi(jwt, songInfo);
      }

      if (res.status === 404) {
        this.log("Song not found in unified provider stream (404)");
        return null;
      }

      if (!res.ok) throw new Error(`Unified API Error: ${res.status}`);

      return await res.json();
    } catch (e) {
      console.warn("[Lyrical:Cubey] Unified fetch failed:", e.message);
      return null;
    }
  }

  async callApi(jwt, songInfo) {
    const url = new URL(this.API_BASE + "lyrics");
    // Ensure we have basics
    url.searchParams.append("song", songInfo.title || "");
    url.searchParams.append("artist", songInfo.artist || "");
    url.searchParams.append("duration", songInfo.duration || "0");

    // VideoID
    const videoId = new URLSearchParams(window.location.search).get("v") || "";
    url.searchParams.append("videoId", videoId);

    if (songInfo.album) url.searchParams.append("album", songInfo.album);

    this.log("Fetching lyrics via background...");
    const response = await chrome.runtime.sendMessage({
      type: "CUBEY_FETCH_LYRICS",
      url: url.toString(),
      jwt,
    });

    if (response.error) {
      // Return error status if possible, or throw
      throw new Error(response.error);
    }

    return {
      ok: response.status === 200,
      status: response.status,
      json: async () => response.data,
    };
  }

  async callUnifiedApi(jwt, songInfo) {
    const videoId = new URLSearchParams(window.location.search).get("v") || "";

    this.log("Fetching unified lyrics via background...");
    const response = await chrome.runtime.sendMessage({
      type: "CUBEY_FETCH_UNIFIED_LYRICS",
      jwt,
      songInfo: {
        title: songInfo.title || "",
        artist: songInfo.artist || "",
        album: songInfo.album || "",
        duration: songInfo.duration || 0,
        videoId,
      },
    });

    if (response.error) {
      throw new Error(response.error);
    }

    return {
      ok: response.status === 200,
      status: response.status,
      json: async () => response.data,
    };
  }
}

// Expose
window.CubeyProvider = new CubeyProvider();
