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

interface TireTempChartProps {
  samples: TelemetrySample[]
}

/** Four tire-temperature lines over time. X-axis = t_ms. */
export function TireTempChart({ samples }: TireTempChartProps) {
  return (
    <div data-testid="tire-temp-chart" className="chart-wrapper">
      <h3>Tire Temperatures</h3>
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
            label={{ value: '°C', angle: -90, position: 'insideLeft' }}
            tick={{ fontSize: 11 }}
          />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="tire_temp_fl" stroke="#2563eb" dot={false} strokeWidth={2} isAnimationActive={false} name="Front-Left" />
          <Line type="monotone" dataKey="tire_temp_fr" stroke="#9333ea" dot={false} strokeWidth={2} isAnimationActive={false} name="Front-Right" />
          <Line type="monotone" dataKey="tire_temp_rl" stroke="#ea580c" dot={false} strokeWidth={2} isAnimationActive={false} name="Rear-Left" />
          <Line type="monotone" dataKey="tire_temp_rr" stroke="#16a34a" dot={false} strokeWidth={2} isAnimationActive={false} name="Rear-Right" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
