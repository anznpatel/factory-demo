import { useMemo, useState } from 'react'
import { useLaps } from '../hooks/useLaps'
import { useSessions } from '../hooks/useSessions'
import { DEFAULT_SESSION_ID } from '../config'
import { SessionSelector } from './SessionSelector'
import { LapSelector } from './LapSelector'
import { KPISummary } from './KPISummary'
import { AlertsPanel } from './AlertsPanel'
import { ChartsGrid } from './charts/ChartsGrid'
import { Loading } from './common/Loading'
import { ErrorState } from './common/ErrorState'
import { EmptyState } from './common/EmptyState'

export function DashboardLayout() {
  const sessionsQuery = useSessions()
  const sessions = sessionsQuery.data ?? []

  const [sessionId, setSessionId] = useState<number>(DEFAULT_SESSION_ID)
  // undefined = no lap chosen yet for the current session (default to best);
  // null = user picked "All laps"; number = a specific lap.
  const [lapChoice, setLapChoice] = useState<number | null | undefined>(undefined)

  const lapsQuery = useLaps(sessionId)
  const laps = useMemo(() => lapsQuery.data ?? [], [lapsQuery.data])
  const lapsReady = laps.length > 0
  const bestLapNumber = useMemo(
    () => laps.find((l) => l.is_best)?.lap_number ?? null,
    [laps],
  )

  // Synchronously derive the lap used for fetching + display. This avoids
  // out-of-range laps when switching sessions (no effect timing gap) and
  // makes the initial telemetry request carry lap=<best>.
  const effectiveLap: number | null = useMemo(() => {
    if (lapChoice === undefined) return bestLapNumber // default to best lap
    if (lapChoice === null) return null // "All laps"
    if (laps.some((l) => l.lap_number === lapChoice)) return lapChoice
    return bestLapNumber // out of range for this session → reset to best
  }, [lapChoice, laps, bestLapNumber])

  // Session-level KPIs are fetched inside KPISummary (useSession); alerts are
  // polled inside AlertsPanel (useAlerts). Telemetry is fetched inside
  // ChartsGrid, gated on laps being loaded so the first request carries the
  // best lap rather than "All laps".

  function handleSessionChange(id: number) {
    setSessionId(id)
    // Reset lap choice so the new session defaults to its own best lap.
    setLapChoice(undefined)
  }

  function handleLapChange(lap: number | null) {
    setLapChoice(lap)
  }

  if (sessionsQuery.isLoading) {
    return (
      <div data-testid="dashboard-root">
        <Loading label="Loading sessions…" />
      </div>
    )
  }

  if (sessionsQuery.isError) {
    return (
      <div data-testid="dashboard-root">
        <ErrorState
          message="Failed to load sessions"
          onRetry={() => {
            void sessionsQuery.refetch()
            void lapsQuery.refetch()
          }}
        />
      </div>
    )
  }

  if (sessions.length === 0) {
    return (
      <div data-testid="dashboard-root">
        <EmptyState message="No sessions available" />
      </div>
    )
  }

  return (
    <div data-testid="dashboard-root">
      <header>
        <h1>Trackside Telemetry Dashboard</h1>
      </header>

      <div className="selectors">
        <SessionSelector
          sessions={sessions}
          value={sessionId}
          onChange={handleSessionChange}
          disabled={false}
        />
        <LapSelector
          laps={laps}
          value={lapsReady ? effectiveLap : null}
          onChange={handleLapChange}
          disabled={!lapsReady}
        />
      </div>

      <section className="dashboard-body">
        <KPISummary sessionId={sessionId} />
        <AlertsPanel sessionId={sessionId} />
        {lapsQuery.isError ? (
          <ErrorState
            message="Failed to load laps"
            onRetry={() => void lapsQuery.refetch()}
          />
        ) : (
          <ChartsGrid sessionId={sessionId} lap={effectiveLap} enabled={lapsReady} />
        )}
      </section>
    </div>
  )
}
