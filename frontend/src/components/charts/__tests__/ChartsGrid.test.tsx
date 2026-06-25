import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../../test/msw-server'
import { renderWithQueryClient } from '../../../test/render'
import { makeTelemetry } from '../../../test/fixtures'
import { ChartsGrid } from '../ChartsGrid'

const BASE = 'http://localhost:8000'

function installTelemetryHandler() {
  server.use(
    http.get(`${BASE}/api/sessions/:id/telemetry`, ({ params, request }) => {
      const id = Number(params.id)
      const url = new URL(request.url)
      const lapParam = url.searchParams.get('lap')
      const lap = lapParam === null ? null : Number(lapParam)
      return HttpResponse.json(makeTelemetry(id, lap))
    }),
  )
}

describe('ChartsGrid', () => {
  it('renders all 5 chart testids after telemetry loads', async () => {
    installTelemetryHandler()
    renderWithQueryClient(<ChartsGrid sessionId={1} lap={2} enabled={true} />)

    await waitFor(() => {
      expect(screen.getByTestId('speed-chart')).toBeInTheDocument()
    })

    expect(screen.getByTestId('rpm-gear-chart')).toBeInTheDocument()
    expect(screen.getByTestId('throttle-brake-chart')).toBeInTheDocument()
    expect(screen.getByTestId('tire-temp-chart')).toBeInTheDocument()
    expect(screen.getByTestId('gforce-chart')).toBeInTheDocument()
  })

  it('shows a loading indicator before data arrives', () => {
    installTelemetryHandler()
    renderWithQueryClient(<ChartsGrid sessionId={1} lap={2} enabled={true} />)
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument()
  })

  it('renders an error state when telemetry fails', async () => {
    server.use(
      http.get(`${BASE}/api/sessions/:id/telemetry`, () =>
        HttpResponse.json({ detail: 'Session not found' }, { status: 404 }),
      ),
    )
    renderWithQueryClient(<ChartsGrid sessionId={1} lap={2} enabled={true} />)

    await waitFor(() => {
      expect(screen.getByTestId('error-state')).toBeInTheDocument()
    })
  })

  it('renders an empty state when telemetry has no samples', async () => {
    server.use(
      http.get(`${BASE}/api/sessions/:id/telemetry`, () =>
        HttpResponse.json({
          session_id: 1,
          lap: 99,
          signals: [],
          sample_count: 0,
          returned_count: 0,
          downsampled: false,
          samples: [],
        }),
      ),
    )
    renderWithQueryClient(<ChartsGrid sessionId={1} lap={99} enabled={true} />)

    await waitFor(() => {
      expect(screen.getByTestId('empty-state')).toBeInTheDocument()
    })
  })
})
