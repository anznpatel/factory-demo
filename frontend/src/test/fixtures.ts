import type { Alert, Lap, SessionDetail, SessionSummary } from '../api/types'

export const sessions: SessionSummary[] = [
  {
    id: 1,
    track_name: 'Silverstone',
    car_id: 'RB-19',
    driver: 'A. Verstappen',
    weather: 'dry',
    ambient_temp_c: 22.5,
    started_at: '2024-06-01T13:00:00Z',
    ended_at: '2024-06-01T13:07:24Z',
    total_laps: 5,
  },
  {
    id: 2,
    track_name: 'Monza',
    car_id: 'SF-23',
    driver: 'C. Leclerc',
    weather: 'dry',
    ambient_temp_c: 26.0,
    started_at: '2024-06-08T14:00:00Z',
    ended_at: '2024-06-08T14:06:18Z',
    total_laps: 4,
  },
  {
    id: 3,
    track_name: 'Suzuka',
    car_id: 'W14',
    driver: 'L. Hamilton',
    weather: 'mixed',
    ambient_temp_c: 19.5,
    started_at: '2024-06-15T10:00:00Z',
    ended_at: '2024-06-15T10:09:30Z',
    total_laps: 6,
  },
]

export function makeSessionDetail(id: number): SessionDetail {
  const s = sessions.find((x) => x.id === id) ?? sessions[0]
  return {
    ...s,
    lap_count: s.total_laps,
    kpis: {
      top_speed_kph: 314.97,
      best_lap_ms: 81200,
      avg_throttle_pct: 65.57,
      max_tire_temp_c: 106.9,
    },
  }
}

// Laps with is_best on lap 2 for every session (matches the real seed pattern
// where lap 2 is the fastest for session 1).
export function makeLaps(sessionId: number): Lap[] {
  const total = sessions.find((s) => s.id === sessionId)?.total_laps ?? 5
  const laps: Lap[] = []
  let started = 0
  for (let n = 1; n <= total; n++) {
    const lapTime = n === 2 ? 81200 : 90000 + n * 100
    laps.push({
      id: (sessionId - 1) * 10 + n,
      session_id: sessionId,
      lap_number: n,
      lap_time_ms: lapTime,
      started_at_ms: started,
      is_best: n === 2,
    })
    started += lapTime
  }
  return laps
}

export const alerts: Alert[] = [
  {
    id: 1,
    session_id: 1,
    lap_id: 1,
    lap_number: 1,
    t_ms: 42850,
    type: 'redline',
    severity: 'critical',
    message: 'Silverstone: engine held near redline on the main straight',
  },
  {
    id: 3,
    session_id: 1,
    lap_id: 2,
    lap_number: 2,
    t_ms: 20300,
    type: 'brake_lock',
    severity: 'info',
    message: 'Silverstone: front brakes momentarily locked into Turn 1',
  },
]

export function makeTelemetry(sessionId: number, lap: number | null) {
  return {
    session_id: sessionId,
    lap,
    signals: ['speed_kph', 'rpm'],
    sample_count: 858,
    returned_count: 2,
    downsampled: true,
    samples: [
      { t_ms: 0, speed_kph: 303.82, rpm: 4732 },
      { t_ms: 17200, speed_kph: 171.17, rpm: 4465 },
    ],
  }
}
