import { useQuery } from '@tanstack/react-query'
import { fetchSession } from '../api/client'

export function useSession(sessionId: number) {
  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => fetchSession(sessionId),
    enabled: sessionId > 0,
    staleTime: Infinity,
  })
}
