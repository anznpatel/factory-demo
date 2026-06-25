import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw-server'
import { renderWithQueryClient } from '../../test/render'
import { KPISummary } from '../KPISummary'
import { parseLapTime } from '../../utils/format'
import type { SessionDetail } from '../../api/types'

const BASE = 'http://localhost:8000'

// Session-specific KPIs so a session change is observable.
const sessionDetails: Record<number, SessionDetail> = {
  1: {
    id: 1,
    track_name: 'Silverstone',
    car_id: 'RB-19',
    driver: 'A. Verstappen',
    weather: 'dry',
    ambient_temp_c: 22.5,
    started_at: '2024-06-01T13:00:00Z',
    ended_at: '2024-06-01T13:07:24Z',
    total_laps: 5,
    lap_count: 5,
    kpis: {
      top_speed_kph: 314.97,
      best_lap_ms: 81200,
      avg_throttle_pct: 65.57,
      max_tire_temp_c: 106.9,
    },
  },
  2: {
    id: 2,
    track_name: 'Monza',
    car_id: 'SF-23',
    driver: 'C. Leclerc',
    weather: 'dry',
    ambient_temp_c: 26.0,
    started_at: '2024-06-08T14:00:00Z',
    ended_at: '2024-06-08T14:06:18Z',
    total_laps: 4,
    lap_count: 4,
    kpis: {
      top_speed_kph: 348.21,
      best_lap_ms: 88450,
      avg_throttle_pct: 71.34,
      max_tire_temp_c: 118.2,
    },
  },
}

function installHandlers() {
  server.use(
    http.get(`${BASE}/api/sessions/:id`, ({ params }) => {
      const id = Number(params.id)
      const detail = sessionDetails[id]
      if (!detail) {
        return HttpResponse.json({ detail: 'Session not found' }, { status: 404 })
      }
      return HttpResponse.json(detail)
    }),
  )
}

describe('KPISummary', () => {
  it('renders exactly 4 cards with correct testids, labels, and real values', async () => {
    installHandlers()
    renderWithQueryClient(<KPISummary sessionId={1} />)

    await waitFor(() => {
      expect(screen.getByTestId('kpi-top-speed')).toBeInTheDocument()
    })

    const testids = [
      'kpi-top-speed',
      'kpi-best-lap',
      'kpi-avg-throttle',
      'kpi-max-tire-temp',
    ]
    for (const tid of testids) {
      const card = screen.getByTestId(tid)
      expect(card).toBeInTheDocument()
      // Label contains the metric keyword.
      const label = card.querySelector('[data-role="label"]')?.textContent ?? ''
      expect(label).not.toBe('')
      // Value is non-empty and contains a digit.
      const value = card.querySelector('[data-role="value"]')?.textContent ?? ''
      expect(value).not.toBe('')
      expect(value).toMatch(/\d/)
      // Never the forbidden placeholders.
      expect(value).not.toBe('NaN')
      expect(value).not.toBe('undefined')
      expect(value).not.toBe('null')
      expect(value).not.toBe('-')
      expect(value).not.toBe('')
    }
  })

  it('values equal the session API kpis; best-lap formatted m:ss.mmm and parses back exactly', async () => {
    installHandlers()
    renderWithQueryClient(<KPISummary sessionId={1} />)
    const kpis = sessionDetails[1].kpis

    await waitFor(() => {
      expect(screen.getByTestId('kpi-top-speed').textContent).toContain(
        kpis.top_speed_kph.toFixed(1),
      )
    })

    expect(screen.getByTestId('kpi-top-speed').textContent).toContain(
      kpis.top_speed_kph.toFixed(1),
    )
    expect(screen.getByTestId('kpi-avg-throttle').textContent).toContain(
      kpis.avg_throttle_pct.toFixed(1),
    )
    expect(screen.getByTestId('kpi-max-tire-temp').textContent).toContain(
      kpis.max_tire_temp_c.toFixed(1),
    )

    const bestLapText = screen
      .getByTestId('kpi-best-lap')
      .querySelector('[data-role="value"]')!.textContent!
    expect(bestLapText).toMatch(/^\d{1,2}:[0-5]\d\.\d{3}$/)
    expect(parseLapTime(bestLapText)).toBe(kpis.best_lap_ms)
  })

  it('values fall within plausible bounds', async () => {
    installHandlers()
    renderWithQueryClient(<KPISummary sessionId={1} />)
    const kpis = sessionDetails[1].kpis

    await waitFor(() => {
      expect(screen.getByTestId('kpi-best-lap').textContent).toMatch(/\d/)
    })

    expect(kpis.top_speed_kph).toBeGreaterThan(0)
    expect(kpis.top_speed_kph).toBeLessThanOrEqual(360)
    expect(kpis.avg_throttle_pct).toBeGreaterThanOrEqual(0)
    expect(kpis.avg_throttle_pct).toBeLessThanOrEqual(100)
    expect(kpis.best_lap_ms).toBeGreaterThanOrEqual(75000)
    expect(kpis.best_lap_ms).toBeLessThanOrEqual(115000)
    expect(kpis.max_tire_temp_c).toBeGreaterThanOrEqual(40)
    expect(kpis.max_tire_temp_c).toBeLessThanOrEqual(200)
  })

  it('shows a loading indicator before data arrives, then real values', async () => {
    installHandlers()
    renderWithQueryClient(<KPISummary sessionId={1} />)

    // While pending, a loading indicator is shown.
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.queryByTestId('loading-indicator')).toBeNull()
    })
    expect(screen.getByTestId('kpi-top-speed')).toBeInTheDocument()
  })

  it('updates all four cards on session change', async () => {
    installHandlers()
    const { rerender } = renderWithQueryClient(<KPISummary sessionId={1} />)

    await waitFor(() => {
      expect(screen.getByTestId('kpi-top-speed').textContent).toContain('315.0')
    })

    // Re-render with a new session id.
    rerender(<KPISummary sessionId={2} />)

    await waitFor(() => {
      expect(screen.getByTestId('kpi-top-speed').textContent).toContain('348.2')
    })
    expect(screen.getByTestId('kpi-best-lap').textContent).toContain('1:28.450')
    expect(screen.getByTestId('kpi-avg-throttle').textContent).toContain('71.3')
    expect(screen.getByTestId('kpi-max-tire-temp').textContent).toContain('118.2')
  })

  it('renders an error state with retry when the session detail fails', async () => {
    server.use(
      http.get(`${BASE}/api/sessions/:id`, () =>
        HttpResponse.json({ detail: 'Session not found' }, { status: 404 }),
      ),
    )
    renderWithQueryClient(<KPISummary sessionId={1} />)

    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument()
    })
    expect(screen.queryByTestId('kpi-top-speed')).toBeNull()
  })
})
