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

interface ThrottleBrakeChartProps {
  samples: TelemetrySample[]
}

/** Throttle and brake percentages over time. X-axis = t_ms, two lines. */
export function ThrottleBrakeChart({ samples }: ThrottleBrakeChartProps) {
  return (
    <div data-testid="throttle-brake-chart" className="chart-wrapper">
      <h3>Throttle &amp; Brake</h3>
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
            domain={[0, 100]}
            label={{ value: '%', angle: -90, position: 'insideLeft' }}
            tick={{ fontSize: 11 }}
          />
          <Tooltip />
          <Legend />
          <Line
            type="monotone"
            dataKey="throttle_pct"
            stroke="#16a34a"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
            name="Throttle"
          />
          <Line
            type="monotone"
            dataKey="brake_pct"
            stroke="#dc2626"
            dot={false}
            strokeWidth={2}
            isAnimationActive={false}
            name="Brake"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
