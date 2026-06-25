import { useQuery } from '@tanstack/react-query'
import { fetchTelemetry } from '../api/client'
import { POLL_INTERVAL_MS, TELEMETRY_MAX_POINTS } from '../config'
import { ALL_SIGNALS } from '../api/types'

export interface UseTelemetryArgs {
  sessionId: number
  /** Lap number; when undefined, fetches the whole session. */
  lap?: number | null
  enabled?: boolean
}

export function useTelemetry({ sessionId, lap, enabled = true }: UseTelemetryArgs) {
  const lapParam = lap === null ? undefined : lap
  return useQuery({
    queryKey: ['telemetry', sessionId, lapParam ?? 'all'],
    queryFn: () =>
      fetchTelemetry(sessionId, {
        lap: lapParam,
        signals: ALL_SIGNALS,
        maxPoints: TELEMETRY_MAX_POINTS,
      }),
    enabled: enabled && sessionId > 0,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}
