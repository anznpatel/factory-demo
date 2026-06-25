import { describe, expect, it, beforeAll } from 'vitest'
import { screen, waitFor, within, fireEvent } from '@testing-library/react'
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

/** Install the canonical mock handler set and record telemetry URLs. */
function installHandlers(telemetryUrls: string[]) {
  server.use(
    http.get(`${BASE}/api/sessions`, () =>
      HttpResponse.json(sessions),
    ),
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
      telemetryUrls.push(request.url)
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

function lapSelectorSelect() {
  return screen.getByTestId('lap-selector').querySelector('select')!
}
function sessionSelectorSelect() {
  return screen.getByTestId('session-selector').querySelector('select')!
}

describe('DashboardLayout selection state', () => {
  beforeAll(() => {
    // Suppress React-Query dev noise in tests.
  })

  it('defaults to session 1 and the session best lap, telemetry?lap=<best>', async () => {
    const telemetryUrls: string[] = []
    installHandlers(telemetryUrls)
    renderWithQueryClient(<DashboardLayout />)

    await waitFor(() => {
      expect(sessionSelectorSelect()).toHaveValue('1')
    })
    // Best lap is lap 2 in the fixtures.
    await waitFor(() => {
      expect(lapSelectorSelect()).toHaveValue('2')
    })

    // The initial telemetry request carries lap=2 (the best lap).
    await waitFor(() => {
      expect(telemetryUrls.length).toBeGreaterThan(0)
      expect(telemetryUrls[0]).toContain('lap=2')
    })

    // No error/empty/loading state on the healthy (mocked) backend.
    expect(screen.queryByTestId('error-state')).toBeNull()
    expect(screen.queryByTestId('empty-state')).toBeNull()
    expect(screen.queryByTestId('loading-indicator')).toBeNull()
  })

  it('changing session re-scopes fetches to the new id and resets lap to best', async () => {
    const telemetryUrls: string[] = []
    installHandlers(telemetryUrls)
    renderWithQueryClient(<DashboardLayout />)

    await waitFor(() => expect(lapSelectorSelect()).toHaveValue('2'))

    // Switch to Suzuka (id 3, 6 laps).
    fireEvent.change(sessionSelectorSelect(), { target: { value: '3' } })

    await waitFor(() => {
      expect(sessionSelectorSelect()).toHaveValue('3')
    })
    // Lap options repopulate: 6 laps + All laps = 7 options.
    await waitFor(() => {
      const options = screen
        .getByTestId('lap-selector')
        .querySelectorAll('option')
      expect(options).toHaveLength(7)
    })
    // Lap resets to the new session's best lap (lap 2), not "All laps".
    await waitFor(() => {
      expect(lapSelectorSelect()).toHaveValue('2')
    })

    // Subsequent telemetry requests target session 3.
    await waitFor(() => {
      expect(
        telemetryUrls.some((u) => u.includes('/api/sessions/3/telemetry')),
      ).toBe(true)
    })
  })

  it('changing lap fetches telemetry?lap=k; "All laps" omits the lap param', async () => {
    const telemetryUrls: string[] = []
    installHandlers(telemetryUrls)
    renderWithQueryClient(<DashboardLayout />)

    await waitFor(() => expect(lapSelectorSelect()).toHaveValue('2'))

    // Select lap 3.
    fireEvent.change(lapSelectorSelect(), { target: { value: '3' } })
    await waitFor(() => {
      expect(
        telemetryUrls.some(
          (u) => u.includes('/api/sessions/1/telemetry') && u.includes('lap=3'),
        ),
      ).toBe(true)
    })

    // Select "All laps".
    fireEvent.change(lapSelectorSelect(), { target: { value: 'all' } })
    await waitFor(() => {
      expect(lapSelectorSelect()).toHaveValue('all')
    })
    await waitFor(() => {
      expect(
        telemetryUrls.some(
          (u) =>
            u.includes('/api/sessions/1/telemetry') && !u.includes('lap='),
        ),
      ).toBe(true)
    })
  })

  it('switching from "All laps" to a new session yields the best lap, not "All laps"', async () => {
    const telemetryUrls: string[] = []
    installHandlers(telemetryUrls)
    renderWithQueryClient(<DashboardLayout />)

    await waitFor(() => expect(lapSelectorSelect()).toHaveValue('2'))
    // Choose "All laps" first.
    fireEvent.change(lapSelectorSelect(), { target: { value: 'all' } })
    await waitFor(() => expect(lapSelectorSelect()).toHaveValue('all'))

    // Switch to Monza (id 2, 4 laps).
    fireEvent.change(sessionSelectorSelect(), { target: { value: '2' } })
    await waitFor(() => expect(sessionSelectorSelect()).toHaveValue('2'))
    // Lap options: 4 laps + All = 5.
    await waitFor(() => {
      expect(
        screen.getByTestId('lap-selector').querySelectorAll('option'),
      ).toHaveLength(5)
    })
    // Reset to Monza best lap (lap 3, matching the real seed), not "All laps".
    await waitFor(() => {
      expect(lapSelectorSelect()).toHaveValue('3')
    })
  })

  it('renders dashboard-root and both selectors', async () => {
    installHandlers([])
    renderWithQueryClient(<DashboardLayout />)
    expect(screen.getByTestId('dashboard-root')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('session-selector')).toBeInTheDocument()
      expect(screen.getByTestId('lap-selector')).toBeInTheDocument()
    })
    // Sanity: within the dashboard root, both selectors present.
    const root = screen.getByTestId('dashboard-root')
    expect(within(root).getByTestId('session-selector')).toBeTruthy()
    expect(within(root).getByTestId('lap-selector')).toBeTruthy()
  })
})
