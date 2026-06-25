import type { AlertSeverity } from '../api/types'
import { useAlerts } from '../hooks/useAlerts'
import { Loading } from './common/Loading'
import { ErrorState } from './common/ErrorState'
import { EmptyState } from './common/EmptyState'

interface AlertsPanelProps {
  sessionId: number
}

// Severity color families: critical=red, warning=amber, info=neutral.
const SEVERITY_COLORS: Record<AlertSeverity, string> = {
  critical: '#dc2626',
  warning: '#d97706',
  info: '#4b5563',
}

const SEVERITY_BG: Record<AlertSeverity, string> = {
  critical: '#fee2e2',
  warning: '#fef3c7',
  info: '#f3f4f6',
}

/** Alerts list sourced from GET /api/sessions/{id}/alerts via the useAlerts
 *  polling hook. One alert-item per entry with data-severity; critical renders
 *  red end-to-end, warning amber, info neutral. Empty collection is handled
 *  gracefully. */
export function AlertsPanel({ sessionId }: AlertsPanelProps) {
  const { data, isPending, isError, refetch } = useAlerts(sessionId)

  function content() {
    if (isError) {
      return (
        <ErrorState
          message="Failed to load alerts"
          onRetry={() => void refetch()}
        />
      )
    }
    if (isPending || !data) {
      return <Loading label="Loading alerts…" />
    }
    if (data.length === 0) {
      return <EmptyState message="No alerts" />
    }
    return (
      <ul className="alert-list">
        {data.map((alert) => {
          const sev = alert.severity
          const color = SEVERITY_COLORS[sev]
          const bg = SEVERITY_BG[sev]
          return (
            <li
              key={alert.id}
              data-testid="alert-item"
              data-severity={sev}
              className="alert-item"
              style={{ color, backgroundColor: bg, borderLeft: `4px solid ${color}` }}
            >
              <span data-role="type" className="alert-type">
                {alert.type}
              </span>
              <span
                data-role="severity"
                className="alert-severity"
                style={{ color, fontWeight: 700 }}
              >
                {sev}
              </span>
              <span data-role="message" className="alert-message">
                {alert.message}
              </span>
            </li>
          )
        })}
      </ul>
    )
  }

  return (
    <section data-testid="alerts-panel" className="alerts-panel" aria-label="Alerts">
      <h2>Alerts</h2>
      {content()}
    </section>
  )
}
