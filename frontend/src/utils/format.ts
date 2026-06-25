// Lap-time formatting helpers. Best-lap is rendered as m:ss.mmm and must
// parse back to the exact best_lap_ms value (architecture.md Section 5).

/** Format a millisecond lap time as `m:ss.mmm` (e.g. 81200 -> "1:21.200"). */
export function formatLapTime(ms: number): string {
  const totalMs = Math.round(ms)
  const minutes = Math.floor(totalMs / 60_000)
  const seconds = Math.floor((totalMs % 60_000) / 1000)
  const millis = totalMs % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}`
}

const LAP_TIME_RE = /^(\d{1,2}):([0-5]\d)\.(\d{3})$/

/** Parse an `m:ss.mmm` string back to milliseconds, or NaN if malformed. */
export function parseLapTime(formatted: string): number {
  const match = formatted.match(LAP_TIME_RE)
  if (!match) return Number.NaN
  const [, m, s, ms] = match
  return Number(m) * 60_000 + Number(s) * 1000 + Number(ms)
}
