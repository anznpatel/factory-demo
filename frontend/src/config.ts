// App-wide configuration constants.

/** Polling interval (ms) for live telemetry + alerts queries. */
export const POLL_INTERVAL_MS = 3000

/** Downsample cap sent on every telemetry request (architecture.md Section 5). */
export const TELEMETRY_MAX_POINTS = 500

/** Default selected session id on first load (first session = id 1). */
export const DEFAULT_SESSION_ID = 1
