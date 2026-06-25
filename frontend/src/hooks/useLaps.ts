import { useQuery } from '@tanstack/react-query'
import { fetchLaps } from '../api/client'

export function useLaps(sessionId: number) {
  return useQuery({
    queryKey: ['laps', sessionId],
    queryFn: () => fetchLaps(sessionId),
    enabled: sessionId > 0,
    staleTime: Infinity,
  })
}
