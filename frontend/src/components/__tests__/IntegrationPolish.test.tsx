import { describe, expect, it } from 'vitest'
import { screen, waitFor, fireEvent } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw-server'
import { renderWithQueryClient } from '../../test/render'
import {
  alerts,
  makeLaps,
  makeSessionDetail,
  makeTelemetry,
  sessions,
} from '../../test/fixtures'
import { DashboardLayout } from '../DashboardLayout'

const BASE = 'http://localhost:8000'

const ALL_12_TESTIDS = [
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

/** Install the canonical happy-path handler set for all 5 endpoint families. */
function happyHandlers() {
  server.use(
    http.get(`${BASE}/api/sessions`, () => HttpResponse.json(sessions)),
    http.get(`${BASE}/api/sessions/:id`, ({ params }) => {
      const id = Number(params.id)
      if (!sessions.some((s) => s.id === id)) {
        return HttpResponse.json({ detail: 'Session not found' }, { status: 404 })
      }
      return HttpResponse.json(makeSessionDetail(id))
    }),
    http.get(`${BASE}/api/sessions/:id/laps`, ({ params }) => {
      const id = Number(params.id)
      if (!sessions.some((s) => s.id === id)) {
        return HttpResponse.json({ detail: 'Session not found' }, { status: 404 })
      }
      return HttpResponse.json(makeLaps(id))
    }),
    http.get(`${BASE}/api/sessions/:id/telemetry`, ({ request, params }) => {
      const id = Number(params.id)
      const url = new URL(request.url)
      const lapParam = url.searchParams.get('lap')
      const lap = lapParam === null ? null : Number(lapParam)
      return HttpResponse.json(makeTelemetry(id, lap))
    }),
    http.get(`${BASE}/api/sessions/:id/alerts`, ({ params }) => {
      const id = Number(params.id)
      if (!sessions.some((s) => s.id === id)) {
        return HttpResponse.json({ detail: 'Session not found' }, { status: 404 })
      }
      return HttpResponse.json(alerts)
    }),
  )
}

describe('Integration polish: shell states (VAL-UI-SHELL-002..005)', () => {
  it('renders all 12 region testids together in the settled view', async () => {
    happyHandlers()
    renderWithQueryClient(<DashboardLayout />)

    await waitFor(() => {
      for (const testid of ALL_12_TESTIDS) {
        expect(screen.getByTestId(testid)).toBeInTheDocument()
      }
    })

    // Settled: no loading/error/empty overlay
    expect(screen.queryByTestId('loading-indicator')).toBeNull()
    expect(screen.queryByTestId('error-state')).toBeNull()
    expect(screen.queryByTestId('empty-state')).toBeNull()
  })

  it('shows a loading indicator while initial data is in flight', () => {
    happyHandlers()
    renderWithQueryClient(<DashboardLayout />)
    // Before any data arrives, the global loading-indicator is shown.
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument()
    expect(screen.getByTestId('dashboard-root')).toBeInTheDocument()
  })

  it('shows error-state with retry when backend unreachable; recovers fully on retry', async () => {
    let failing = true
    server.use(
      http.get(`${BASE}/api/sessions`, () => {
        if (failing) return HttpResponse.error()
        return HttpResponse.json(sessions)
      }),
      http.get(`${BASE}/api/sessions/:id`, ({ params }) => {
        if (failing) return HttpResponse.error()
        const id = Number(params.id)
        return HttpResponse.json(makeSessionDetail(id))
      }),
      http.get(`${BASE}/api/sessions/:id/laps`, ({ params }) => {
        if (failing) return HttpResponse.error()
        const id = Number(params.id)
        return HttpResponse.json(makeLaps(id))
      }),
      http.get(`${BASE}/api/sessions/:id/telemetry`, ({ request, params }) => {
        if (failing) return HttpResponse.error()
        const id = Number(params.id)
        const url = new URL(request.url)
        const lapParam = url.searchParams.get('lap')
        const lap = lapParam === null ? null : Number(lapParam)
        return HttpResponse.json(makeTelemetry(id, lap))
      }),
      http.get(`${BASE}/api/sessions/:id/alerts`, () => {
        if (failing) return HttpResponse.error()
        return HttpResponse.json(alerts)
      }),
    )

    renderWithQueryClient(<DashboardLayout />)

    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument()
    })
    // #root stays non-empty during error
    expect(screen.getByTestId('dashboard-root')).toBeInTheDocument()
    // Retry button is present
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument()

    // Recover: make all endpoints succeed, click retry
    failing = false
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))

    // Full recovery: sessions, KPIs, laps, AND charts all repopulate
    await waitFor(
      () => {
        expect(screen.getByTestId('session-selector')).toBeInTheDocument()
        expect(screen.getByTestId('speed-chart')).toBeInTheDocument()
        expect(screen.getByTestId('rpm-gear-chart')).toBeInTheDocument()
        expect(screen.getByTestId('alerts-panel')).toBeInTheDocument()
      },
      { timeout: 5000 },
    )
    // Error state is gone after recovery
    expect(screen.queryByTestId('error-state')).toBeNull()
  })

  it('renders empty-state when sessions return []', async () => {
    server.use(
      http.get(`${BASE}/api/sessions`, () => HttpResponse.json([])),
      // useLaps(1) fires before the early return; stub it to avoid MSW noise.
      http.get(`${BASE}/api/sessions/:id/laps`, () => HttpResponse.json([])),
    )

    renderWithQueryClient(<DashboardLayout />)

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
    // #root stays non-empty
    expect(screen.getByTestId('dashboard-root')).toBeInTheDocument()
  })

  it('shows error-state with retry when laps fail but sessions succeed', async () => {
    server.use(
      http.get(`${BASE}/api/sessions`, () => HttpResponse.json(sessions)),
      http.get(`${BASE}/api/sessions/:id`, ({ params }) => {
        const id = Number(params.id)
        return HttpResponse.json(makeSessionDetail(id))
      }),
      http.get(`${BASE}/api/sessions/:id/laps`, () =>
        HttpResponse.json({ detail: 'Internal error' }, { status: 500 }),
      ),
      http.get(`${BASE}/api/sessions/:id/telemetry`, ({ request, params }) => {
        const id = Number(params.id)
        const url = new URL(request.url)
        const lapParam = url.searchParams.get('lap')
        const lap = lapParam === null ? null : Number(lapParam)
        return HttpResponse.json(makeTelemetry(id, lap))
      }),
      http.get(`${BASE}/api/sessions/:id/alerts`, () => HttpResponse.json(alerts)),
    )

    renderWithQueryClient(<DashboardLayout />)

    // Sessions + KPIs + alerts load, but laps fail → error-state surfaces
    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument()
    })
    // Wait for KPIs and alerts to resolve (they don't depend on laps)
    await waitFor(() => {
      expect(screen.getByTestId('kpi-top-speed')).toBeInTheDocument()
    })
    expect(screen.getByTestId('alerts-panel')).toBeInTheDocument()
    // Lap selector is disabled (no laps)
    const lapSelect = screen.getByTestId('lap-selector').querySelector('select')!
    expect(lapSelect).toBeDisabled()
  })

  it('shows a loading indicator while laps are in flight (sessions already loaded)', async () => {
    // Deferred laps response so we can observe the explicit laps loading
    // state (sessions/KPIs/alerts resolve immediately; laps stays pending).
    let resolveLaps: () => void = () => {}
    const lapsPending = new Promise<void>((resolve) => {
      resolveLaps = resolve
    })
    server.use(
      http.get(`${BASE}/api/sessions`, () => HttpResponse.json(sessions)),
      http.get(`${BASE}/api/sessions/:id`, ({ params }) =>
        HttpResponse.json(makeSessionDetail(Number(params.id))),
      ),
      http.get(`${BASE}/api/sessions/:id/laps`, async () => {
        await lapsPending
        return HttpResponse.json(makeLaps(Number(1)))
      }),
      http.get(`${BASE}/api/sessions/:id/telemetry`, ({ request, params }) => {
        const id = Number(params.id)
        const url = new URL(request.url)
        const lapParam = url.searchParams.get('lap')
        const lap = lapParam === null ? null : Number(lapParam)
        return HttpResponse.json(makeTelemetry(id, lap))
      }),
      http.get(`${BASE}/api/sessions/:id/alerts`, () => HttpResponse.json(alerts)),
    )

    renderWithQueryClient(<DashboardLayout />)

    // Sessions + KPIs + alerts resolve; laps still pending → the explicit
    // laps loading indicator is surfaced (not a perpetual telemetry spinner).
    await waitFor(() => {
      expect(screen.getByTestId('session-selector')).toBeInTheDocument()
    })
    await waitFor(() => {
      expect(screen.getByText('Loading laps…')).toBeInTheDocument()
    })
    // Lap selector is disabled while laps are unavailable.
    expect(
      screen.getByTestId('lap-selector').querySelector('select')!,
    ).toBeDisabled()
    // dashboard-root stays mounted.
    expect(screen.getByTestId('dashboard-root')).toBeInTheDocument()

    // Resolve laps → loading indicator clears and charts populate.
    resolveLaps()
    await waitFor(() => {
      expect(screen.queryByText('Loading laps…')).toBeNull()
      expect(screen.getByTestId('speed-chart')).toBeInTheDocument()
    })
  })

  it('renders empty-state when laps return [] (no perpetual loading spinner)', async () => {
    server.use(
      http.get(`${BASE}/api/sessions`, () => HttpResponse.json(sessions)),
      http.get(`${BASE}/api/sessions/:id`, ({ params }) => {
        const id = Number(params.id)
        return HttpResponse.json(makeSessionDetail(id))
      }),
      http.get(`${BASE}/api/sessions/:id/laps`, () => HttpResponse.json([])),
      http.get(`${BASE}/api/sessions/:id/telemetry`, () =>
        HttpResponse.json(makeTelemetry(1, null)),
      ),
      http.get(`${BASE}/api/sessions/:id/alerts`, () => HttpResponse.json(alerts)),
    )

    renderWithQueryClient(<DashboardLayout />)

    // Sessions succeed but laps list is empty → explicit empty-state for laps
    // (graceful degradation instead of relying on every session having laps).
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
    expect(screen.getByTestId('dashboard-root')).toBeInTheDocument()
    expect(screen.getByTestId('session-selector')).toBeInTheDocument()
    // KPIs and alerts are independent of laps and still populate.
    await waitFor(() => {
      expect(screen.getByTestId('kpi-top-speed')).toBeInTheDocument()
    })
    expect(screen.getByTestId('alerts-panel')).toBeInTheDocument()
    // Lap selector is disabled (no laps to choose from).
    expect(
      screen.getByTestId('lap-selector').querySelector('select')!,
    ).toBeDisabled()
  })

  it('renders empty-state when telemetry returns no samples (induced empty)', async () => {
    server.use(
      http.get(`${BASE}/api/sessions`, () => HttpResponse.json(sessions)),
      http.get(`${BASE}/api/sessions/:id`, ({ params }) => {
        const id = Number(params.id)
        return HttpResponse.json(makeSessionDetail(id))
      }),
      http.get(`${BASE}/api/sessions/:id/laps`, ({ params }) => {
        const id = Number(params.id)
        return HttpResponse.json(makeLaps(id))
      }),
      http.get(`${BASE}/api/sessions/:id/telemetry`, () =>
        HttpResponse.json({
          session_id: 1,
          lap: 2,
          signals: [],
          sample_count: 0,
          returned_count: 0,
          downsampled: false,
          samples: [],
        }),
      ),
      http.get(`${BASE}/api/sessions/:id/alerts`, () => HttpResponse.json(alerts)),
    )

    renderWithQueryClient(<DashboardLayout />)

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
    // Other regions still present
    expect(screen.getByTestId('session-selector')).toBeInTheDocument()
    expect(screen.getByTestId('kpi-top-speed')).toBeInTheDocument()
    expect(screen.getByTestId('alerts-panel')).toBeInTheDocument()
  })

  it('renders empty alerts presentation when alerts return [] (induced empty)', async () => {
    server.use(
      http.get(`${BASE}/api/sessions`, () => HttpResponse.json(sessions)),
      http.get(`${BASE}/api/sessions/:id`, ({ params }) => {
        const id = Number(params.id)
        return HttpResponse.json(makeSessionDetail(id))
      }),
      http.get(`${BASE}/api/sessions/:id/laps`, ({ params }) => {
        const id = Number(params.id)
        return HttpResponse.json(makeLaps(id))
      }),
      http.get(`${BASE}/api/sessions/:id/telemetry`, ({ request, params }) => {
        const id = Number(params.id)
        const url = new URL(request.url)
        const lapParam = url.searchParams.get('lap')
        const lap = lapParam === null ? null : Number(lapParam)
        return HttpResponse.json(makeTelemetry(id, lap))
      }),
      http.get(`${BASE}/api/sessions/:id/alerts`, () => HttpResponse.json([])),
    )

    renderWithQueryClient(<DashboardLayout />)

    // Wait for the alerts empty-state to render (data resolved to []).
    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
    expect(screen.getByTestId('alerts-panel')).toBeInTheDocument()
    expect(screen.queryAllByTestId('alert-item')).toHaveLength(0)
  })

  it('dashboard-root is always present (#root stays non-empty)', async () => {
    happyHandlers()
    const { unmount } = renderWithQueryClient(<DashboardLayout />)

    // Present during loading
    expect(screen.getByTestId('dashboard-root')).toBeInTheDocument()

    // Present after settle
    await waitFor(() => {
      expect(screen.getByTestId('speed-chart')).toBeInTheDocument()
    })
    expect(screen.getByTestId('dashboard-root')).toBeInTheDocument()

    // Clean unmount (re-mount stability proxy)
    unmount()
  })
})
