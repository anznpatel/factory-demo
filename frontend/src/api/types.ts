// TS interfaces mirroring the API responses (architecture.md Section 4).

export interface SessionSummary {
  id: number
  track_name: string
  car_id: string
  driver: string
  weather: string
  ambient_temp_c: number
  started_at: string
  ended_at: string
  total_laps: number
}

export interface KPIs {
  top_speed_kph: number
  best_lap_ms: number
  avg_throttle_pct: number
  max_tire_temp_c: number
}

export interface SessionDetail extends SessionSummary {
  lap_count: number
  kpis: KPIs
}

export interface Lap {
  id: number
  session_id: number
  lap_number: number
  lap_time_ms: number
  started_at_ms: number
  is_best: boolean
}

export type SignalName =
  | 'speed_kph'
  | 'rpm'
  | 'gear'
  | 'throttle_pct'
  | 'brake_pct'
  | 'steering_deg'
  | 'tire_temp_fl'
  | 'tire_temp_fr'
  | 'tire_temp_rl'
  | 'tire_temp_rr'
  | 'g_lat'
  | 'g_long'
  | 'fuel_pct'

export const ALL_SIGNALS: SignalName[] = [
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
]

export interface TelemetrySample {
  t_ms: number
  [signal: string]: number
}

export interface TelemetryResponse {
  session_id: number
  lap: number | null
  signals: string[]
  sample_count: number
  returned_count: number
  downsampled: boolean
  samples: TelemetrySample[]
}

export type AlertType = 'redline' | 'tire_overtemp' | 'brake_lock' | 'fuel_low'
export type AlertSeverity = 'info' | 'warning' | 'critical'

export interface Alert {
  id: number
  session_id: number
  lap_id: number
  lap_number: number
  t_ms: number
  type: AlertType
  severity: AlertSeverity
  message: string
}
