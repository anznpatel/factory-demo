import type { Alert, Lap, SessionDetail, SessionSummary, TelemetryResponse, TelemetrySample } from '../api/types'

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

// Best-lap (lap_number + lap_time_ms) per session, aligned with the
// deterministic seed so mocked tests don't diverge from the real backend
// data (e.g. Monza's fastest lap is lap 3, not lap 2).
const BEST_LAP_BY_SESSION: Record<number, { lap: number; time: number }> = {
  1: { lap: 2, time: 81200 },
  2: { lap: 3, time: 84300 },
  3: { lap: 2, time: 87500 },
}

export function makeLaps(sessionId: number): Lap[] {
  const total = sessions.find((s) => s.id === sessionId)?.total_laps ?? 5
  const best = BEST_LAP_BY_SESSION[sessionId] ?? { lap: 2, time: 81200 }
  const laps: Lap[] = []
  let started = 0
  for (let n = 1; n <= total; n++) {
    const isBest = n === best.lap
    const lapTime = isBest ? best.time : 90000 + n * 100
    laps.push({
      id: (sessionId - 1) * 10 + n,
      session_id: sessionId,
      lap_number: n,
      lap_time_ms: lapTime,
      started_at_ms: started,
      is_best: isBest,
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

// Build a deterministic set of telemetry samples with ALL 13 signals so every
// chart (speed, rpm/gear, throttle/brake, tire temps, g-force) has data to
// render. `count` controls how many samples are produced.
function buildSamples(count: number): TelemetrySample[] {
  const samples: TelemetrySample[] = []
  for (let i = 0; i < count; i++) {
    const t = i * 1000
    const phase = (i / count) * Math.PI * 2
    samples.push({
      t_ms: t,
      speed_kph: 120 + 80 * Math.sin(phase),
      rpm: 5000 + 3000 * Math.sin(phase),
      gear: (i % 7) + 1,
      throttle_pct: 50 + 40 * Math.sin(phase),
      brake_pct: 50 + 40 * Math.sin(phase + Math.PI),
      steering_deg: 30 * Math.sin(phase * 2),
      tire_temp_fl: 90 + 10 * Math.sin(phase),
      tire_temp_fr: 88 + 10 * Math.sin(phase + 0.5),
      tire_temp_rl: 92 + 10 * Math.sin(phase + 1.0),
      tire_temp_rr: 91 + 10 * Math.sin(phase + 1.5),
      g_lat: 2 * Math.sin(phase),
      g_long: 1.5 * Math.cos(phase),
      fuel_pct: 100 - (i / count) * 50,
    })
  }
  return samples
}

const TELEMETRY_SAMPLES = buildSamples(15)

export function makeTelemetry(sessionId: number, lap: number | null): TelemetryResponse {
  // For "All laps" (lap === null) return more samples than a single lap.
  const count = lap === null ? 30 : 15
  const samples = lap === null ? buildSamples(30) : TELEMETRY_SAMPLES
  return {
    session_id: sessionId,
    lap,
    signals: [
      'speed_kph',
      'rpm',
      'gear',
      'throttle_pct',
      'brake_pct',
      'steering_deg',
      'tire_temp_fl',
      'tire_temp_fr',
      'tire_temp_rl',
      'tire_temp_rr',
      'g_lat',
      'g_long',
      'fuel_pct',
    ],
    sample_count: count * 57,
    returned_count: count,
    downsampled: true,
    samples,
  }
}
