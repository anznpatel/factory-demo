import {
  CartesianGrid,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
  ResponsiveContainer,
} from 'recharts'
import type { TelemetrySample } from '../../api/types'

interface GForceChartProps {
  samples: TelemetrySample[]
}

/** G-force scatter plot. X-axis = g_lat (NOT t_ms), Y-axis = g_long.
 *  Renders scatter symbols with no connected line. */
export function GForceChart({ samples }: GForceChartProps) {
  return (
    <div data-testid="gforce-chart" className="chart-wrapper">
      <h3>G-Force</h3>
      <ResponsiveContainer width="100%" height={250}>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            type="number"
            dataKey="g_lat"
            name="Lateral G"
            domain={[-3, 3]}
            tickCount={7}
            label={{ value: 'g_lat', position: 'insideBottom', offset: -2 }}
            tick={{ fontSize: 11 }}
          />
          <YAxis
            type="number"
            dataKey="g_long"
            name="Longitudinal G"
            domain={[-3, 3]}
            tickCount={7}
            label={{ value: 'g_long', angle: -90, position: 'insideLeft' }}
            tick={{ fontSize: 11 }}
          />
          <ZAxis range={[4, 4]} />
          <Tooltip cursor={{ strokeDasharray: '3 3' }} />
          <Scatter
            data={samples}
            fill="#7c3aed"
            isAnimationActive={false}
            name="G-Force"
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  )
}
