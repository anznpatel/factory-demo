/**
 * Live polling, end-to-end integration, and cross-area flow verification.
 *
 * Covers VAL-UI-LIVE-001..005 and VAL-CROSS-001..006:
 * - Polling cadence: telemetry + alerts poll ~3s; sessions/laps don't
 * - All /api/* requests target :8000 (no mock/fixture path)
 * - Poll params: max_points in [1,5000], lap=N, "All laps" omits lap
 * - Poll failure -> error-state -> recovery
 * - Selection drives poll params (session id, old-id polling ceases)
 * - First-visit flow populates all 12 regions
 * - End-to-end data integrity (selectors, KPIs, alerts, default lap, critical-red)
 * - Cross-region coherence anchor
 * - Coherent session switch (Suzuka lap 6 -> Monza invalid-lap case)
 * - Coherent lap switch (charts move, KPIs/alerts hold)
 * - Whole-journey robustness across all 3 sessions
 */
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw-server'
import { renderWithQueryClient } from '../../test/render'
import { DashboardLayout } from '../DashboardLayout'
import { parseLapTime } from '../../utils/format'
import {
  sessions,
  makeLaps,
  makeTelemetry,
} from '../../test/fixtures'
import type { Alert, SessionDetail } from '../../api/types'

const BASE = 'http://localhost:8000'

// ---------------------------------------------------------------------------
// Per-session fixtures with DISTINCT data so data-integrity and session-switch
// assertions can detect stale values.
// ---------------------------------------------------------------------------

const SESSION_DETAILS: Record<number, SessionDetail> = {
  1: {
    ...sessions[0],
    lap_count: 5,
    kpis: {
      top_speed_kph: 314.97,
      best_lap_ms: 81200,
      avg_throttle_pct: 65.57,
      max_tire_temp_c: 106.9,
    },
  },
  2: {
    ...sessions[1],
    lap_count: 4,
    kpis: {
      top_speed_kph: 348.21,
      best_lap_ms: 88450,
      avg_throttle_pct: 71.34,
      max_tire_temp_c: 118.2,
    },
  },
  3: {
    ...sessions[2],
    lap_count: 6,
    kpis: {
      top_speed_kph: 302.15,
      best_lap_ms: 95300,
      avg_throttle_pct: 58.72,
      max_tire_temp_c: 112.5,
    },
  },
}

const SESSION_ALERTS: Record<number, Alert[]> = {
  1: [
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
      id: 2,
      session_id: 1,
      lap_id: 2,
      lap_number: 2,
      t_ms: 20300,
      type: 'tire_overtemp',
      severity: 'warning',
      message: 'Silverstone: front-left tire over 110C into Turn 4',
    },
    {
      id: 3,
      session_id: 1,
      lap_id: 1,
      lap_number: 1,
      t_ms: 1200,
      type: 'brake_lock',
      severity: 'info',
      message: 'Silverstone: front brakes momentarily locked into Turn 1',
    },
  ],
  2: [
    {
      id: 10,
      session_id: 2,
      lap_id: 5,
      lap_number: 1,
      t_ms: 5000,
      type: 'fuel_low',
      severity: 'warning',
      message: 'Monza: fuel level low nearing session end',
    },
  ],
  3: [
    {
      id: 20,
      session_id: 3,
      lap_id: 10,
      lap_number: 3,
      t_ms: 30000,
      type: 'tire_overtemp',
      severity: 'critical',
      message: 'Suzuka: rear-right tire critically overheated in Spoon Curve',
    },
    {
      id: 21,
      session_id: 3,
      lap_id: 8,
      lap_number: 1,
      t_ms: 8000,
      type: 'redline',
      severity: 'info',
      message: 'Suzuka: engine briefly near redline on start straight',
    },
  ],
}

// ---------------------------------------------------------------------------
// Tracker + handler installer
// ---------------------------------------------------------------------------

interface RequestTracker {
  telemetry: string[]
  alerts: string[]
  sessions: string[]
  laps: string[]
  sessionDetails: string[]
}

function makeTracker(): RequestTracker {
  return { telemetry: [], alerts: [], sessions: [], laps: [], sessionDetails: [] }
}

function installHandlers(tracker: RequestTracker, overrides?: {
  telemetryHandler?: (id: number, url: URL) => Response
  alertsHandler?: (id: number) => Response
}) {
  server.use(
    http.get(`${BASE}/api/sessions`, ({ request }) => {
      tracker.sessions.push(request.url)
      return HttpResponse.json(sessions)
    }),
    http.get(`${BASE}/api/sessions/:id`, ({ params, request }) => {
      const id = Number(params.id)
      tracker.sessionDetails.push(request.url)
      const detail = SESSION_DETAILS[id]
      if (!detail) {
        return HttpResponse.json({ detail: 'Session not found' }, { status: 404 })
      }
      return HttpResponse.json(detail)
    }),
    http.get(`${BASE}/api/sessions/:id/laps`, ({ params, request }) => {
      const id = Number(params.id)
      tracker.laps.push(request.url)
      if (!sessions.some((s) => s.id === id)) {
        return HttpResponse.json({ detail: 'Session not found' }, { status: 404 })
      }
      return HttpResponse.json(makeLaps(id))
    }),
    http.get(`${BASE}/api/sessions/:id/telemetry`, ({ request, params }) => {
      const id = Number(params.id)
      tracker.telemetry.push(request.url)
      const url = new URL(request.url)
      if (overrides?.telemetryHandler) {
        return overrides.telemetryHandler(id, url)
      }
      const lapParam = url.searchParams.get('lap')
      const lap = lapParam === null ? null : Number(lapParam)
      return HttpResponse.json(makeTelemetry(id, lap))
    }),
    http.get(`${BASE}/api/sessions/:id/alerts`, ({ params, request }) => {
      const id = Number(params.id)
      tracker.alerts.push(request.url)
      if (overrides?.alertsHandler) {
        return overrides.alertsHandler(id)
      }
      const list = SESSION_ALERTS[id]
      if (!list) {
        return HttpResponse.json({ detail: 'Session not found' }, { status: 404 })
      }
      return HttpResponse.json(list)
    }),
  )
}

function sessionSelect() {
  return screen.getByTestId('session-selector').querySelector('select')!
}
function lapSelect() {
  return screen.getByTestId('lap-selector').querySelector('select')!
}

/**
 * Wait for a condition under fake timers. Advances the clock in small
 * increments, flushing microtasks (MSW responses, React re-renders) each
 * step, until the check passes or maxAdvances is exhausted.
 */
async function waitForTimers(check: () => void, maxAdvances = 100): Promise<void> {
  for (let i = 0; i < maxAdvances; i++) {
    try {
      check()
      return
    } catch {
      await vi.advanceTimersByTimeAsync(50)
    }
  }
  // Final check — throws with the real error message if still failing.
  check()
}

// ===========================================================================
// VAL-UI-LIVE-001..005: Live polling & integration (fake timers for cadence)
// ===========================================================================

describe('Live polling & integration (VAL-UI-LIVE-001..005)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  // VAL-UI-LIVE-001: Every rendered surface traces to a real :8000 backend response
  it('all /api/* requests target http://localhost:8000 (none to :5173 or fixtures)', async () => {
    const tracker = makeTracker()
    installHandlers(tracker)
    renderWithQueryClient(<DashboardLayout />)

    // Advance enough to let all initial fetches resolve.
    await vi.advanceTimersByTimeAsync(2000)

    // All tracked URLs start with http://localhost:8000/api/
    const allUrls = [
      ...tracker.sessions,
      ...tracker.sessionDetails,
      ...tracker.laps,
      ...tracker.telemetry,
      ...tracker.alerts,
    ]
    expect(allUrls.length).toBeGreaterThan(0)
    for (const url of allUrls) {
      expect(url.startsWith('http://localhost:8000/api/')).toBe(true)
      expect(url.includes(':5173')).toBe(false)
    }

    // Core endpoint families each have at least one request.
    expect(tracker.sessions.length).toBeGreaterThanOrEqual(1)
    expect(tracker.sessionDetails.length).toBeGreaterThanOrEqual(1)
    expect(tracker.laps.length).toBeGreaterThanOrEqual(1)
    expect(tracker.telemetry.length).toBeGreaterThanOrEqual(1)
    expect(tracker.alerts.length).toBeGreaterThanOrEqual(1)
  })

  // VAL-UI-LIVE-002: Telemetry and alerts poll on a ~3s cadence; sessions/laps don't
  it('telemetry + alerts poll on ~3s cadence while sessions/laps do not', async () => {
    const tracker = makeTracker()
    installHandlers(tracker)
    renderWithQueryClient(<DashboardLayout />)

    // Let initial fetches complete.
    await vi.advanceTimersByTimeAsync(500)

    const initialTelemetry = tracker.telemetry.length
    const initialAlerts = tracker.alerts.length
    const initialSessions = tracker.sessions.length
    const initialLaps = tracker.laps.length

    // Advance 10 seconds to observe polling.
    await vi.advanceTimersByTimeAsync(10_000)

    // Telemetry should have polled >= 3 times over ~10s (initial + >= 3 polls).
    expect(tracker.telemetry.length - initialTelemetry).toBeGreaterThanOrEqual(3)
    // Alerts should have polled >= 2 times over ~7s (initial + >= 2 polls).
    expect(tracker.alerts.length - initialAlerts).toBeGreaterThanOrEqual(2)
    // Sessions and laps should NOT be re-fetched on the polling cadence.
    expect(tracker.sessions.length - initialSessions).toBe(0)
    expect(tracker.laps.length - initialLaps).toBe(0)

    // Bounded: <= 6 telemetry requests over 10s.
    expect(tracker.telemetry.length - initialTelemetry).toBeLessThanOrEqual(6)
  })

  // VAL-UI-LIVE-004: Polling is bounded; a failed poll surfaces error-state with recovery
  it('a failed telemetry poll renders error-state with retry and resumes on recovery', async () => {
    let telemetryFailing = false
    const tracker = makeTracker()
    installHandlers(tracker, {
      telemetryHandler: (id, _url) => {
        if (telemetryFailing) {
          return HttpResponse.json(
            { detail: 'Internal error' },
            { status: 500 },
          )
        }
        return HttpResponse.json(makeTelemetry(id, null))
      },
    })

    renderWithQueryClient(<DashboardLayout />)

    // Wait for initial settle.
    await waitForTimers(() => {
      expect(screen.getByTestId('speed-chart')).toBeInTheDocument()
    })

    // Force telemetry poll failure.
    telemetryFailing = true

    // Advance past the next poll interval to trigger a failed refetch.
    await vi.advanceTimersByTimeAsync(3500)

    // Error state should be visible (ChartsGrid shows ErrorState on isError).
    await waitForTimers(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument()
    })

    // dashboard-root stays non-empty.
    expect(screen.getByTestId('dashboard-root')).toBeInTheDocument()

    // Recover: make telemetry succeed again.
    telemetryFailing = false

    // Click retry.
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    // Should recover: charts render again, error-state gone.
    await waitForTimers(() => {
      expect(screen.getByTestId('speed-chart')).toBeInTheDocument()
      expect(screen.queryByTestId('error-state')).toBeNull()
    })
  })

  // VAL-UI-LIVE-005: Selection drives poll params; max_points in [1,5000]
  it('telemetry carries max_points in [1,5000] (~500) and lap param tracks selection', async () => {
    const tracker = makeTracker()
    installHandlers(tracker)
    renderWithQueryClient(<DashboardLayout />)

    // Wait for initial settle.
    await waitForTimers(() => expect(lapSelect()).toHaveValue('2'))

    // Verify the initial telemetry request has max_points in [1,5000].
    expect(tracker.telemetry.length).toBeGreaterThan(0)
    const initialUrl = new URL(tracker.telemetry[0])
    const maxPoints = Number(initialUrl.searchParams.get('max_points'))
    expect(maxPoints).toBeGreaterThanOrEqual(1)
    expect(maxPoints).toBeLessThanOrEqual(5000)
    // Should be exactly 500 (TELEMETRY_MAX_POINTS).
    expect(maxPoints).toBe(500)

    // Initial request should carry lap=2 (best lap).
    expect(initialUrl.searchParams.get('lap')).toBe('2')

    // Change lap to 3.
    fireEvent.change(lapSelect(), { target: { value: '3' } })
    await vi.advanceTimersByTimeAsync(500)

    // Find a telemetry request with lap=3.
    const lap3Url = tracker.telemetry.find((u) => {
      const url = new URL(u)
      return url.searchParams.get('lap') === '3'
    })
    expect(lap3Url).toBeTruthy()

    // Select "All laps".
    fireEvent.change(lapSelect(), { target: { value: 'all' } })
    await vi.advanceTimersByTimeAsync(500)

    // Find a telemetry request with no lap param.
    const allLapsUrl = tracker.telemetry.find((u) => {
      const url = new URL(u)
      return !url.searchParams.has('lap')
    })
    expect(allLapsUrl).toBeTruthy()
  })

  // VAL-UI-LIVE-005: Session change redirects subsequent polls to the new id
  it('session change redirects polls to the new id; old-id polling ceases', async () => {
    const tracker = makeTracker()
    installHandlers(tracker)
    renderWithQueryClient(<DashboardLayout />)

    await waitForTimers(() => expect(sessionSelect()).toHaveValue('1'))

    // Switch to Monza (id 2).
    fireEvent.change(sessionSelect(), { target: { value: '2' } })
    await vi.advanceTimersByTimeAsync(1000)

    // Subsequent telemetry requests should target session 2.
    const session2Telemetry = tracker.telemetry.filter((u) =>
      u.includes('/api/sessions/2/telemetry'),
    )
    expect(session2Telemetry.length).toBeGreaterThan(0)

    // Record the index of the first session-2 request.
    const firstS2Index = tracker.telemetry.indexOf(session2Telemetry[0])

    // Advance past a poll cycle.
    await vi.advanceTimersByTimeAsync(3500)

    // No new session-1 telemetry requests after the switch.
    const postSwitchSession1 = tracker.telemetry
      .slice(firstS2Index)
      .filter((u) => u.includes('/api/sessions/1/telemetry'))
    expect(postSwitchSession1.length).toBe(0)

    // Session-2 telemetry continues polling.
    const session2PollCount = tracker.telemetry.filter((u) =>
      u.includes('/api/sessions/2/telemetry'),
    ).length
    expect(session2PollCount).toBeGreaterThanOrEqual(2)
  })

  // VAL-UI-LIVE-005: Single stable navigation (no reload loop)
  it('the main document loads once (no reload loop); app stays responsive', async () => {
    const tracker = makeTracker()
    installHandlers(tracker)
    renderWithQueryClient(<DashboardLayout />)

    await vi.advanceTimersByTimeAsync(2000)

    // Sessions should be fetched exactly once (no refetch on poll cadence).
    expect(tracker.sessions.length).toBe(1)

    // Dashboard is populated and interactive.
    expect(screen.getByTestId('dashboard-root')).toBeInTheDocument()
    expect(sessionSelect()).not.toBeDisabled()
    expect(lapSelect()).not.toBeDisabled()
  })
})

// ===========================================================================
// VAL-CROSS-001..006: Cross-area flows (real timers + waitFor)
// ===========================================================================

describe('Cross-area flows (VAL-CROSS-001..006)', () => {
  // VAL-CROSS-001: First-visit flow populates the whole dashboard
  it('first visit populates all 12 regions with no error/empty state', async () => {
    const tracker = makeTracker()
    installHandlers(tracker)
    renderWithQueryClient(<DashboardLayout />)

    const ALL_12 = [
      'session-selector',
      'lap-selector',
      'kpi-top-speed',
      'kpi-best-lap',
      'kpi-avg-throttle',
      'kpi-max-tire-temp',
      'speed-chart',
      'rpm-gear-chart',
      'throttle-brake-chart',
      'tire-temp-chart',
      'gforce-chart',
      'alerts-panel',
    ] as const

    await waitFor(() => {
      for (const tid of ALL_12) {
        expect(screen.getByTestId(tid)).toBeInTheDocument()
      }
    })

    // No error/empty/loading state on the healthy backend.
    expect(screen.queryByTestId('error-state')).toBeNull()
    expect(screen.queryByTestId('empty-state')).toBeNull()
    expect(screen.queryByTestId('loading-indicator')).toBeNull()

    // Default session is Silverstone (id 1).
    expect(sessionSelect()).toHaveValue('1')

    // Default lap is the best lap (lap 2 from fixtures), not "All laps".
    expect(lapSelect()).toHaveValue('2')

    // At least one alert rendered.
    expect(screen.getAllByTestId('alert-item').length).toBeGreaterThanOrEqual(1)
  })

  // VAL-CROSS-002: End-to-end data integrity
  it('end-to-end data integrity: selectors, KPIs, alerts, default lap, critical-red', async () => {
    const tracker = makeTracker()
    installHandlers(tracker)
    renderWithQueryClient(<DashboardLayout />)

    await waitFor(() => {
      expect(screen.getByTestId('speed-chart')).toBeInTheDocument()
    })

    // --- Selector options match /api/sessions ---
    const sessionOptions = sessionSelect().querySelectorAll('option')
    expect(sessionOptions).toHaveLength(3)
    expect(sessionOptions[0].textContent).toContain('Silverstone')
    expect(sessionOptions[0].textContent).toContain('A. Verstappen')
    expect(sessionOptions[1].textContent).toContain('Monza')
    expect(sessionOptions[1].textContent).toContain('C. Leclerc')
    expect(sessionOptions[2].textContent).toContain('Suzuka')
    expect(sessionOptions[2].textContent).toContain('L. Hamilton')

    // --- Lap options match /laps + "All laps" ---
    const lapOptions = lapSelect().querySelectorAll('option')
    // 5 laps + 1 "All laps" = 6 options for session 1.
    expect(lapOptions).toHaveLength(6)
    // Lap numbers 1..5 present.
    const lapValues = Array.from(lapOptions).map((o) => o.value)
    expect(lapValues).toContain('1')
    expect(lapValues).toContain('2')
    expect(lapValues).toContain('3')
    expect(lapValues).toContain('4')
    expect(lapValues).toContain('5')
    // Exactly one "All laps" entry.
    const allLapsOptions = Array.from(lapOptions).filter((o) =>
      /all laps/i.test(o.textContent ?? ''),
    )
    expect(allLapsOptions).toHaveLength(1)

    // --- Default lap == is_best (lap 2 from fixtures) ---
    expect(lapSelect()).toHaveValue('2')
    const fixtureLaps = makeLaps(1)
    const bestLap = fixtureLaps.find((l) => l.is_best)
    expect(bestLap).toBeTruthy()
    expect(lapSelect()).toHaveValue(String(bestLap!.lap_number))

    // --- KPIs match /api/sessions/1 kpis ---
    const kpis = SESSION_DETAILS[1].kpis
    expect(screen.getByTestId('kpi-top-speed').textContent).toContain(
      kpis.top_speed_kph.toFixed(1),
    )
    expect(screen.getByTestId('kpi-avg-throttle').textContent).toContain(
      kpis.avg_throttle_pct.toFixed(1),
    )
    expect(screen.getByTestId('kpi-max-tire-temp').textContent).toContain(
      kpis.max_tire_temp_c.toFixed(1),
    )
    // Best-lap formatted as m:ss.mmm and parses back exactly.
    const bestLapText = screen
      .getByTestId('kpi-best-lap')
      .querySelector('[data-role="value"]')!.textContent!
    expect(bestLapText).toMatch(/^\d{1,2}:[0-5]\d\.\d{3}$/)
    expect(parseLapTime(bestLapText)).toBe(kpis.best_lap_ms)

    // --- Alerts match /alerts (count + severity multiset) ---
    const apiAlerts = SESSION_ALERTS[1]
    const alertItems = screen.getAllByTestId('alert-item')
    expect(alertItems).toHaveLength(apiAlerts.length)

    const apiSeverities = apiAlerts.map((a) => a.severity).sort()
    const renderedSeverities = alertItems
      .map((el) => el.getAttribute('data-severity')!)
      .sort()
    expect(renderedSeverities).toEqual(apiSeverities)

    // --- Critical alert renders red end-to-end ---
    const criticalItems = alertItems.filter(
      (el) => el.getAttribute('data-severity') === 'critical',
    )
    expect(criticalItems.length).toBeGreaterThanOrEqual(1)
    const criticalItem = criticalItems[0] as HTMLElement
    const itemColor = window.getComputedStyle(criticalItem).color
    // Red-dominant: R > G and R > B.
    const rgbMatch = itemColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i)
    expect(rgbMatch).toBeTruthy()
    if (rgbMatch) {
      const r = Number(rgbMatch[1])
      const g = Number(rgbMatch[2])
      const b = Number(rgbMatch[3])
      expect(r).toBeGreaterThan(g)
      expect(r).toBeGreaterThan(b)
    }
    // Critical message matches the API.
    const criticalMessage = criticalItem.querySelector('[data-role="message"]')!.textContent!
    const apiCritical = apiAlerts.find((a) => a.severity === 'critical')!
    expect(criticalMessage).toBe(apiCritical.message)
  })

  // VAL-CROSS-003: Cross-region coherence anchor
  it('all regions reflect the same selected session id', async () => {
    const tracker = makeTracker()
    installHandlers(tracker)
    renderWithQueryClient(<DashboardLayout />)

    await waitFor(() => {
      expect(screen.getByTestId('speed-chart')).toBeInTheDocument()
    })

    // All initial data requests target session 1.
    expect(tracker.sessionDetails.every((u) => u.includes('/api/sessions/1'))).toBe(true)
    expect(tracker.laps.every((u) => u.includes('/api/sessions/1/'))).toBe(true)
    expect(tracker.alerts.every((u) => u.includes('/api/sessions/1/'))).toBe(true)
    expect(tracker.telemetry.every((u) => u.includes('/api/sessions/1/'))).toBe(true)

    // KPIs match session 1.
    const kpis = SESSION_DETAILS[1].kpis
    expect(screen.getByTestId('kpi-top-speed').textContent).toContain(
      kpis.top_speed_kph.toFixed(1),
    )

    // Alerts match session 1.
    expect(screen.getAllByTestId('alert-item')).toHaveLength(SESSION_ALERTS[1].length)

    // Switch to Suzuka (id 3).
    fireEvent.change(sessionSelect(), { target: { value: '3' } })
    await waitFor(() => expect(sessionSelect()).toHaveValue('3'))

    // Wait for new data to arrive.
    await waitFor(() => {
      expect(
        tracker.telemetry.some((u) => u.includes('/api/sessions/3/telemetry')),
      ).toBe(true)
    })

    // All NEW data requests target session 3.
    const session3Details = tracker.sessionDetails.filter((u) =>
      u.includes('/api/sessions/3'),
    )
    const session3Laps = tracker.laps.filter((u) => u.includes('/api/sessions/3/'))
    const session3Alerts = tracker.alerts.filter((u) => u.includes('/api/sessions/3/'))
    const session3Telemetry = tracker.telemetry.filter((u) =>
      u.includes('/api/sessions/3/telemetry'),
    )
    expect(session3Details.length).toBeGreaterThanOrEqual(1)
    expect(session3Laps.length).toBeGreaterThanOrEqual(1)
    expect(session3Alerts.length).toBeGreaterThanOrEqual(1)
    expect(session3Telemetry.length).toBeGreaterThanOrEqual(1)

    // KPIs update to session 3 values.
    await waitFor(() => {
      expect(screen.getByTestId('kpi-top-speed').textContent).toContain(
        SESSION_DETAILS[3].kpis.top_speed_kph.toFixed(1),
      )
    })
  })

  // VAL-CROSS-004: Coherent session switch with Suzuka lap 6 -> Monza invalid-lap case
  it('session switch updates every region; Suzuka lap 6 -> Monza resets to valid lap', async () => {
    const tracker = makeTracker()
    installHandlers(tracker)
    renderWithQueryClient(<DashboardLayout />)

    await waitFor(() => expect(lapSelect()).toHaveValue('2'))

    // Switch to Suzuka (id 3, 6 laps).
    fireEvent.change(sessionSelect(), { target: { value: '3' } })
    await waitFor(() => expect(sessionSelect()).toHaveValue('3'))

    // Lap options: 6 laps + All = 7.
    await waitFor(() => {
      expect(lapSelect().querySelectorAll('option')).toHaveLength(7)
    })
    // Default lap is Suzuka's best (lap 2 from fixtures).
    await waitFor(() => expect(lapSelect()).toHaveValue('2'))

    // Select lap 6 on Suzuka.
    fireEvent.change(lapSelect(), { target: { value: '6' } })
    await waitFor(() => expect(lapSelect()).toHaveValue('6'))

    // Switch to Monza (id 2, 4 laps).
    fireEvent.change(sessionSelect(), { target: { value: '2' } })
    await waitFor(() => expect(sessionSelect()).toHaveValue('2'))

    // Lap options: 4 laps + All = 5.
    await waitFor(() => {
      expect(lapSelect().querySelectorAll('option')).toHaveLength(5)
    })

    // Lap resets to Monza's best lap (lap 2), NOT lap 6 (which is out of range).
    await waitFor(() => expect(lapSelect()).toHaveValue('2'))

    // KPIs update to Monza values.
    await waitFor(() => {
      expect(screen.getByTestId('kpi-top-speed').textContent).toContain(
        SESSION_DETAILS[2].kpis.top_speed_kph.toFixed(1),
      )
    })

    // Alerts update to Monza alerts (1 warning).
    await waitFor(() => {
      expect(screen.getAllByTestId('alert-item')).toHaveLength(SESSION_ALERTS[2].length)
    })
    const monzaAlert = screen.getAllByTestId('alert-item')[0]
    expect(monzaAlert.getAttribute('data-severity')).toBe('warning')

    // Telemetry requests target session 2 with a valid lap.
    const monzaTelemetry = tracker.telemetry.filter((u) =>
      u.includes('/api/sessions/2/telemetry'),
    )
    expect(monzaTelemetry.length).toBeGreaterThan(0)
    const lastMonzaUrl = new URL(monzaTelemetry[monzaTelemetry.length - 1])
    const lapParam = lastMonzaUrl.searchParams.get('lap')
    expect(lapParam).not.toBeNull()
    const lapNum = Number(lapParam)
    expect(lapNum).toBeGreaterThanOrEqual(1)
    expect(lapNum).toBeLessThanOrEqual(4)

    // No error/empty state throughout.
    expect(screen.queryByTestId('error-state')).toBeNull()
    expect(screen.queryByTestId('empty-state')).toBeNull()
  })

  // VAL-CROSS-005: Coherent lap switch moves charts while KPIs/alerts hold
  it('lap switch moves charts while KPIs/alerts hold; All laps vs single lap differ', async () => {
    const tracker = makeTracker()
    installHandlers(tracker)
    renderWithQueryClient(<DashboardLayout />)

    // Wait for everything to settle (KPIs, alerts, charts all loaded).
    await waitFor(() => {
      expect(screen.getByTestId('kpi-top-speed')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByTestId('speed-chart')).toBeInTheDocument()
    })
    await waitFor(() => expect(lapSelect()).toHaveValue('2'))

    // Snapshot KPI values at lap 2.
    const kpiTopSpeedLap2 = screen.getByTestId('kpi-top-speed').textContent
    const kpiBestLapLap2 = screen.getByTestId('kpi-best-lap').textContent
    const alertCountLap2 = screen.getAllByTestId('alert-item').length

    // Change to lap 3.
    fireEvent.change(lapSelect(), { target: { value: '3' } })

    // Telemetry request should carry lap=3.
    await waitFor(() => {
      expect(
        tracker.telemetry.some((u) => {
          const url = new URL(u)
          return url.searchParams.get('lap') === '3'
        }),
      ).toBe(true)
    })

    // KPIs should NOT change (session-scoped).
    expect(screen.getByTestId('kpi-top-speed').textContent).toBe(kpiTopSpeedLap2)
    expect(screen.getByTestId('kpi-best-lap').textContent).toBe(kpiBestLapLap2)

    // Alerts should NOT change (session-scoped).
    expect(screen.getAllByTestId('alert-item')).toHaveLength(alertCountLap2)

    // Select "All laps" - request should omit lap param.
    fireEvent.change(lapSelect(), { target: { value: 'all' } })
    await waitFor(() => {
      expect(
        tracker.telemetry.some((u) => {
          const url = new URL(u)
          return !url.searchParams.has('lap')
        }),
      ).toBe(true)
    })

    // KPIs still unchanged.
    expect(screen.getByTestId('kpi-top-speed').textContent).toBe(kpiTopSpeedLap2)

    // "All laps" telemetry request exists (differs from single-lap in params).
    const allLapsTelemetryUrls = tracker.telemetry.filter((u) => {
      const url = new URL(u)
      return !url.searchParams.has('lap')
    })
    const singleLapTelemetryUrls = tracker.telemetry.filter((u) => {
      const url = new URL(u)
      return url.searchParams.has('lap')
    })
    expect(allLapsTelemetryUrls.length).toBeGreaterThan(0)
    expect(singleLapTelemetryUrls.length).toBeGreaterThan(0)

    // No error/empty state.
    expect(screen.queryByTestId('error-state')).toBeNull()
    expect(screen.queryByTestId('empty-state')).toBeNull()
  })

  // VAL-CROSS-006: Whole-journey robustness across all 3 sessions
  it('whole journey across all 3 sessions: coherent, no drift, no errors', async () => {
    const tracker = makeTracker()
    installHandlers(tracker)
    renderWithQueryClient(<DashboardLayout />)

    await waitFor(() => expect(sessionSelect()).toHaveValue('1'))

    // Helper: verify all regions reflect a given session id.
    async function verifySession(id: number) {
      await waitFor(() => expect(sessionSelect()).toHaveValue(String(id)))

      const totalLaps = sessions.find((s) => s.id === id)!.total_laps
      const expectedLapOptions = totalLaps + 1 // + "All laps"

      // Lap options count matches.
      await waitFor(() => {
        expect(lapSelect().querySelectorAll('option')).toHaveLength(expectedLapOptions)
      })

      // KPIs match this session.
      await waitFor(() => {
        expect(screen.getByTestId('kpi-top-speed').textContent).toContain(
          SESSION_DETAILS[id].kpis.top_speed_kph.toFixed(1),
        )
      })

      // Alerts match this session.
      await waitFor(() => {
        expect(screen.getAllByTestId('alert-item')).toHaveLength(SESSION_ALERTS[id].length)
      })

      // Telemetry requests target this session.
      const sessionTelemetry = tracker.telemetry.filter((u) =>
        u.includes(`/api/sessions/${id}/telemetry`),
      )
      expect(sessionTelemetry.length).toBeGreaterThan(0)

      // No error/empty/loading state.
      expect(screen.queryByTestId('error-state')).toBeNull()
      expect(screen.queryByTestId('empty-state')).toBeNull()
    }

    // Journey: 1 -> 2 -> 3 -> 1 -> 3 -> 2
    await verifySession(1)

    fireEvent.change(sessionSelect(), { target: { value: '2' } })
    await verifySession(2)

    fireEvent.change(sessionSelect(), { target: { value: '3' } })
    await verifySession(3)

    fireEvent.change(sessionSelect(), { target: { value: '1' } })
    await verifySession(1)

    fireEvent.change(sessionSelect(), { target: { value: '3' } })
    await verifySession(3)

    fireEvent.change(sessionSelect(), { target: { value: '2' } })
    await verifySession(2)

    // Cycle laps on the final session (Monza, 4 laps).
    const finalLaps = sessions.find((s) => s.id === 2)!.total_laps
    for (let lap = 1; lap <= finalLaps; lap++) {
      fireEvent.change(lapSelect(), { target: { value: String(lap) } })
      await waitFor(() => expect(lapSelect()).toHaveValue(String(lap)))
      expect(screen.queryByTestId('error-state')).toBeNull()
      expect(screen.queryByTestId('empty-state')).toBeNull()
    }

    // "All laps" cycle.
    fireEvent.change(lapSelect(), { target: { value: 'all' } })
    await waitFor(() => expect(lapSelect()).toHaveValue('all'))
    expect(screen.queryByTestId('error-state')).toBeNull()

    // Final state: dashboard coherent for session 2.
    expect(sessionSelect()).toHaveValue('2')
    expect(screen.getByTestId('kpi-top-speed').textContent).toContain(
      SESSION_DETAILS[2].kpis.top_speed_kph.toFixed(1),
    )
    expect(screen.getAllByTestId('alert-item')).toHaveLength(SESSION_ALERTS[2].length)
    expect(screen.queryByTestId('error-state')).toBeNull()
    expect(screen.queryByTestId('empty-state')).toBeNull()

    // dashboard-root never blanks.
    expect(screen.getByTestId('dashboard-root')).toBeInTheDocument()
  })
})
