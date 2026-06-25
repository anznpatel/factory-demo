import { useQuery } from '@tanstack/react-query'
import { fetchAlerts } from '../api/client'
import { POLL_INTERVAL_MS } from '../config'

export function useAlerts(sessionId: number) {
  return useQuery({
    queryKey: ['alerts', sessionId],
    queryFn: () => fetchAlerts(sessionId),
    enabled: sessionId > 0,
    refetchInterval: POLL_INTERVAL_MS,
    refetchIntervalInBackground: false,
  })
}
