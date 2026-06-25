import type {
  Alert,
  Lap,
  SessionDetail,
  SessionSummary,
  TelemetryResponse,
} from './types'

// Base URL from the Vite env (committed in .env; no secrets).
const BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000'

/** Error thrown when the API returns a non-2xx response. */
export class ApiError extends Error {
  readonly status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, params?: URLSearchParams): Promise<T> {
  let url = `${BASE_URL}${path}`
  if (params) {
    const qs = params.toString()
    if (qs) url += `?${qs}`
  }
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) {
    let detail = `${res.status} ${res.statusText}`
    try {
      const body = await res.json()
      if (typeof body?.detail === 'string') detail = body.detail
      else if (Array.isArray(body?.detail)) detail = JSON.stringify(body.detail)
    } catch {
      // ignore JSON parse failures; keep status text
    }
    throw new ApiError(res.status, detail)
  }
  return (await res.json()) as T
}

export function fetchSessions(): Promise<SessionSummary[]> {
  return request<SessionSummary[]>('/api/sessions')
}

export function fetchSession(id: number): Promise<SessionDetail> {
  return request<SessionDetail>(`/api/sessions/${id}`)
}

export function fetchLaps(sessionId: number): Promise<Lap[]> {
  return request<Lap[]>(`/api/sessions/${sessionId}/laps`)
}

export interface TelemetryParams {
  lap?: number
  signals?: string[]
  fromMs?: number
  toMs?: number
  maxPoints?: number
}

export function fetchTelemetry(
  sessionId: number,
  params: TelemetryParams = {},
): Promise<TelemetryResponse> {
  const qs = new URLSearchParams()
  if (params.lap !== undefined) qs.set('lap', String(params.lap))
  if (params.signals && params.signals.length > 0) {
    qs.set('signals', params.signals.join(','))
  }
  if (params.fromMs !== undefined) qs.set('from_ms', String(params.fromMs))
  if (params.toMs !== undefined) qs.set('to_ms', String(params.toMs))
  if (params.maxPoints !== undefined) qs.set('max_points', String(params.maxPoints))
  return request<TelemetryResponse>(
    `/api/sessions/${sessionId}/telemetry`,
    qs,
  )
}

export function fetchAlerts(
  sessionId: number,
  severity?: 'info' | 'warning' | 'critical',
): Promise<Alert[]> {
  const qs = new URLSearchParams()
  if (severity) qs.set('severity', severity)
  return request<Alert[]>(`/api/sessions/${sessionId}/alerts`, qs)
}
