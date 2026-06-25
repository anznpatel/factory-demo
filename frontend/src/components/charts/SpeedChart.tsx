import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { TelemetrySample } from '../../api/types'

interface SpeedChartProps {
  samples: TelemetrySample[]
}

/** Speed-over-time line chart. X-axis = t_ms, single line for speed_kph. */
export function SpeedChart({ samples }: SpeedChartProps) {
  return (
    <div data-testid="speed-chart" className="chart-wrapper">
      <h3>Speed</h3>
      <ResponsiveContainer width="100%" height={250}>
        <LineChart data={samples} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="t_ms"
            type="number"
            domain={['dataMin', 'dataMax']}
            label={{ value: 't (ms)', position: 'insideBottom', offset: -2 }}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            label={{ value: 'kph', angle: -90, position: 'insideLeft' }}
            tick={{ fontSize: 11 }}
          />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="speed_kph"
            stroke="#2563eb"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
            name="Speed"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
