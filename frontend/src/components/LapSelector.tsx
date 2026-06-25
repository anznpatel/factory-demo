import type { Lap } from '../api/types'

interface LapSelectorProps {
  laps: Lap[]
  /** Selected lap number, or null for "All laps". */
  value: number | null
  onChange: (lap: number | null) => void
  disabled?: boolean
}

export function LapSelector({ laps, value, onChange, disabled }: LapSelectorProps) {
  return (
    <label data-testid="lap-selector">
      <span>Lap</span>
      <select
        value={value === null ? 'all' : String(value)}
        disabled={disabled}
        onChange={(e) => {
          const v = e.target.value
          onChange(v === 'all' ? null : Number(v))
        }}
      >
        {laps.map((lap) => (
          <option key={lap.id} value={String(lap.lap_number)}>
            Lap {lap.lap_number}
            {lap.is_best ? ' (best)' : ''}
          </option>
        ))}
        <option value="all">All laps</option>
      </select>
    </label>
  )
}
