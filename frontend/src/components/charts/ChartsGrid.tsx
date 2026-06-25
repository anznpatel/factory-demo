import { useTelemetry } from '../../hooks/useTelemetry'
import { Loading } from '../common/Loading'
import { ErrorState } from '../common/ErrorState'
import { EmptyState } from '../common/EmptyState'
import { SpeedChart } from './SpeedChart'
import { RPMGearChart } from './RPMGearChart'
import { ThrottleBrakeChart } from './ThrottleBrakeChart'
import { TireTempChart } from './TireTempChart'
import { GForceChart } from './GForceChart'

interface ChartsGridProps {
  sessionId: number
  /** Effective lap: number for a specific lap, null for "All laps". */
  lap: number | null
  enabled?: boolean
}

/** Fetches telemetry for the active session/lap via useTelemetry (max_points
 *  ~500, polled every 3s) and renders all five charts. Loading, error, and
 *  empty states are handled at the grid level so individual chart wrappers
 *  contain only SVG content in the settled view. */
export function ChartsGrid({ sessionId, lap, enabled = true }: ChartsGridProps) {
  const { data, isPending, isError, refetch } = useTelemetry({
    sessionId,
    lap,
    enabled,
  })

  if (isError) {
    return (
      <ErrorState
        message="Failed to load telemetry"
        onRetry={() => void refetch()}
      />
    )
  }

  if (isPending || !data) {
    return <Loading label="Loading telemetry…" />
  }

  if (data.samples.length === 0) {
    return <EmptyState message="No telemetry data for this selection" />
  }

  return (
    <div className="charts-grid">
      <SpeedChart samples={data.samples} />
      <RPMGearChart samples={data.samples} />
      <ThrottleBrakeChart samples={data.samples} />
      <TireTempChart samples={data.samples} />
      <GForceChart samples={data.samples} />
    </div>
  )
}
