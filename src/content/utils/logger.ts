/**
 * Centralized logging utility for Lyrical extension.
 * Respects the "Show Logs" toggle in settings.
 */

// Debug mode flag - updated by main.jsx when settings change
let isDebugMode = false;

/**
 * Set the debug mode state
 * @param {boolean} enabled - Whether debug logging is enabled
 */
export function setDebugMode(enabled) {
  isDebugMode = enabled;
}

/**
 * Check if debug mode is enabled
 * @returns {boolean}
 */
export function isDebugEnabled() {
  return isDebugMode;
}

/**
 * Log a message (only when debug mode is enabled)
 * @param  {...any} args - Arguments to log
 */
export function log(...args) {
  if (isDebugMode) {
    console.log("[Lyrical]", ...args);
  }
}

/**
 * Log a warning (only when debug mode is enabled)
 * @param  {...any} args - Arguments to log
 */
export function warn(...args) {
  if (isDebugMode) {
    console.warn("[Lyrical]", ...args);
  }
}

/**
 * Log an error (always shown - errors are important)
 * @param  {...any} args - Arguments to log
 */
export function error(...args) {
  // Errors are always shown for debugging critical issues
  console.error("[Lyrical]", ...args);
}

/**
 * Log with a custom prefix (only when debug mode is enabled)
 * @param {string} prefix - Custom prefix for the log
 * @param  {...any} args - Arguments to log
 */
export function logWithPrefix(prefix, ...args) {
  if (isDebugMode) {
    console.log(`[Lyrical ${prefix}]`, ...args);
  }
}

// Export a logger object for convenience
export const logger = {
  log,
  warn,
  error,
  setDebugMode,
  isDebugEnabled,
  logWithPrefix,
};

export default logger;
