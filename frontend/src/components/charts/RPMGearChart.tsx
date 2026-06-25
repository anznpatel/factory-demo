import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TelemetrySample } from '../../api/types'

interface RPMGearChartProps {
  samples: TelemetrySample[]
}

/** RPM line (left y-axis) + gear step line (right y-axis) over time.
 *  X-axis = t_ms. Dual y-axes: rpm on the left, gear on the right. */
export function RPMGearChart({ samples }: RPMGearChartProps) {
  return (
    <div data-testid="rpm-gear-chart" className="chart-wrapper">
      <h3>RPM &amp; Gear</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={samples} margin={{ top: 8, right: 40, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="t_ms"
            type="number"
            domain={['dataMin', 'dataMax']}
            label={{ value: 't (ms)', position: 'insideBottom', offset: -2 }}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            yAxisId="rpm"
            label={{ value: 'rpm', angle: -90, position: 'insideLeft' }}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            yAxisId="gear"
            orientation="right"
            domain={[0, 8]}
            ticks={[0, 1, 2, 3, 4, 5, 6, 7, 8]}
            label={{ value: 'gear', angle: 90, position: 'insideRight' }}
            tick={{ fontSize: 11 }}
          />
          <Tooltip />
          <Legend />
          <Line
            yAxisId="rpm"
            type="monotone"
            dataKey="rpm"
            stroke="#dc2626"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
            name="RPM"
          />
          <Line
            yAxisId="gear"
            type="stepAfter"
            dataKey="gear"
            stroke="#16a34a"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
            name="Gear"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
