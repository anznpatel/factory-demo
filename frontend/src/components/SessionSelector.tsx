import type { SessionSummary } from '../api/types'

interface SessionSelectorProps {
  sessions: SessionSummary[]
  value: number
  onChange: (sessionId: number) => void
  disabled?: boolean
}

export function SessionSelector({
  sessions,
  value,
  onChange,
  disabled,
}: SessionSelectorProps) {
  return (
    <label data-testid="session-selector">
      <span>Session</span>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      >
        {sessions.map((s) => (
          <option key={s.id} value={s.id}>
            {s.track_name} — {s.driver}
          </option>
        ))}
      </select>
    </label>
  )
}
