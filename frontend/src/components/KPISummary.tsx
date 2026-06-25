import { useSession } from '../hooks/useSession'
import { formatLapTime } from '../utils/format'
import { Loading } from './common/Loading'
import { ErrorState } from './common/ErrorState'

interface KPISummaryProps {
  sessionId: number
}

interface KpiCardProps {
  testId: string
  label: string
  value: string
}

function KpiCard({ testId, label, value }: KpiCardProps) {
  return (
    <div data-testid={testId} className="kpi-card">
      <span data-role="label" className="kpi-label">
        {label}
      </span>
      <span data-role="value" className="kpi-value">
        {value}
      </span>
    </div>
  )
}

/** Four KPI cards (top speed, best lap, avg throttle, max tire temp) sourced
 *  from GET /api/sessions/{id} kpis via the useSession hook. Best-lap is
 *  formatted as m:ss.mmm. */
export function KPISummary({ sessionId }: KPISummaryProps) {
  const { data, isPending, isError, refetch } = useSession(sessionId)

  if (isError) {
    return (
      <ErrorState
        message="Failed to load KPIs"
        onRetry={() => void refetch()}
      />
    )
  }

  if (isPending || !data) {
    return <Loading label="Loading KPIs…" />
  }

  const { kpis } = data

  return (
    <section className="kpi-summary" aria-label="KPI Summary">
      <KpiCard
        testId="kpi-top-speed"
        label="Top Speed"
        value={`${kpis.top_speed_kph.toFixed(1)} kph`}
      />
      <KpiCard
        testId="kpi-best-lap"
        label="Best Lap"
        value={formatLapTime(kpis.best_lap_ms)}
      />
      <KpiCard
        testId="kpi-avg-throttle"
        label="Avg Throttle"
        value={`${kpis.avg_throttle_pct.toFixed(1)} %`}
      />
      <KpiCard
        testId="kpi-max-tire-temp"
        label="Max Tire Temp"
        value={`${kpis.max_tire_temp_c.toFixed(1)} °C`}
      />
    </section>
  )
}
