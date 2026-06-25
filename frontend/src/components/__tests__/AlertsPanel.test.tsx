import { describe, expect, it } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { server } from '../../test/msw-server'
import { renderWithQueryClient } from '../../test/render'
import { AlertsPanel } from '../AlertsPanel'
import type { Alert } from '../../api/types'

const BASE = 'http://localhost:8000'

const sessionAlerts: Record<number, Alert[]> = {
  1: [
    {
      id: 1,
      session_id: 1,
      lap_id: 1,
      lap_number: 1,
      t_ms: 42850,
      type: 'redline',
      severity: 'critical',
      message: 'Engine held near redline on the main straight',
    },
    {
      id: 2,
      session_id: 1,
      lap_id: 2,
      lap_number: 2,
      t_ms: 20300,
      type: 'tire_overtemp',
      severity: 'warning',
      message: 'Front-left tire over 110C into Turn 4',
    },
    {
      id: 3,
      session_id: 1,
      lap_id: 1,
      lap_number: 1,
      t_ms: 1200,
      type: 'brake_lock',
      severity: 'info',
      message: 'Front brakes momentarily locked into Turn 1',
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
      message: 'Fuel level low nearing session end',
    },
  ],
}

function installHandlers() {
  server.use(
    http.get(`${BASE}/api/sessions/:id/alerts`, ({ params }) => {
      const id = Number(params.id)
      const list = sessionAlerts[id]
      if (!list) {
        return HttpResponse.json({ detail: 'Session not found' }, { status: 404 })
      }
      return HttpResponse.json(list)
    }),
  )
}

describe('AlertsPanel', () => {
  it('renders one alert-item per API alert with matching content and severities', async () => {
    installHandlers()
    renderWithQueryClient(<AlertsPanel sessionId={1} />)

    await waitFor(() => {
      expect(screen.getAllByTestId('alert-item')).toHaveLength(3)
    })

    const items = screen.getAllByTestId('alert-item')
    const api = sessionAlerts[1]

    // data-severity in enum and per-severity counts match.
    const enumSet = new Set(['info', 'warning', 'critical'])
    const renderedBySeverity: Record<string, number> = {
      info: 0,
      warning: 0,
      critical: 0,
    }
    const renderedMultiset = new Set<string>()
    items.forEach((item, i) => {
      const sev = item.getAttribute('data-severity')!
      expect(enumSet.has(sev)).toBe(true)
      renderedBySeverity[sev]++
      const type = item.querySelector('[data-role="type"]')!.textContent!
      const severity = item.querySelector('[data-role="severity"]')!.textContent!
      const message = item.querySelector('[data-role="message"]')!.textContent!
      expect(type).not.toBe('')
      expect(severity).not.toBe('')
      expect(message).not.toBe('')
      renderedMultiset.add(`${type}|${severity}|${message}`)
      // Matches the API entry (order preserved by the API).
      expect(type).toBe(api[i].type)
      expect(severity).toBe(api[i].severity)
      expect(message).toBe(api[i].message)
    })

    // per-severity rendered counts equal the API.
    const apiBySeverity: Record<string, number> = {
      info: 0,
      warning: 0,
      critical: 0,
    }
    api.forEach((a) => apiBySeverity[a.severity]++)
    expect(renderedBySeverity).toEqual(apiBySeverity)

    // (type,severity,message) multiset equal the API.
    const apiMultiset = new Set(
      api.map((a) => `${a.type}|${a.severity}|${a.message}`),
    )
    expect(renderedMultiset).toEqual(apiMultiset)
  })

  it('severity color coding is visually distinct (critical red, warning amber, info neutral)', async () => {
    installHandlers()
    renderWithQueryClient(<AlertsPanel sessionId={1} />)

    await waitFor(() => {
      expect(screen.getAllByTestId('alert-item')).toHaveLength(3)
    })

    const items = screen.getAllByTestId('alert-item')
    const colors: Record<string, string> = {}
    for (const item of items) {
      const sev = item.getAttribute('data-severity')!
      const badge = item.querySelector('[data-role="severity"]')! as HTMLElement
      colors[sev] = window.getComputedStyle(badge).color
    }

    // All three present and mutually distinct.
    expect(colors.critical).toBeTruthy()
    expect(colors.warning).toBeTruthy()
    expect(colors.info).toBeTruthy()
    expect(colors.critical).not.toBe(colors.warning)
    expect(colors.critical).not.toBe(colors.info)
    expect(colors.warning).not.toBe(colors.info)

    // Family checks via rgb component dominance.
    const critRgb = parseRgb(colors.critical)
    const warnRgb = parseRgb(colors.warning)
    const infoRgb = parseRgb(colors.info)
    // critical is red-dominant (R > G and R > B).
    expect(critRgb.r).toBeGreaterThan(critRgb.g)
    expect(critRgb.r).toBeGreaterThan(critRgb.b)
    // warning is amber (R and G both high, B lower).
    expect(warnRgb.r).toBeGreaterThan(warnRgb.b)
    expect(warnRgb.g).toBeGreaterThan(warnRgb.b)
    // info is neutral (R ~= G ~= B).
    expect(Math.abs(infoRgb.r - infoRgb.g)).toBeLessThanOrEqual(40)
    expect(Math.abs(infoRgb.g - infoRgb.b)).toBeLessThanOrEqual(40)
  })

  it('a critical alert renders red end-to-end with a matching message', async () => {
    installHandlers()
    renderWithQueryClient(<AlertsPanel sessionId={1} />)

    await waitFor(() => {
      expect(screen.getAllByTestId('alert-item')).toHaveLength(3)
    })

    const criticalItems = screen
      .getAllByTestId('alert-item')
      .filter((el) => el.getAttribute('data-severity') === 'critical')
    expect(criticalItems.length).toBeGreaterThanOrEqual(1)

    const item = criticalItems[0] as HTMLElement
    // The item itself is red (computed color).
    const itemColor = window.getComputedStyle(item).color
    const rgb = parseRgb(itemColor)
    expect(rgb.r).toBeGreaterThan(rgb.g)
    expect(rgb.r).toBeGreaterThan(rgb.b)
    // Message matches the API critical alert.
    const message = item.querySelector('[data-role="message"]')!.textContent!
    const apiCritical = sessionAlerts[1].find((a) => a.severity === 'critical')!
    expect(message).toBe(apiCritical.message)
  })

  it('handles an empty alerts collection without crashing', async () => {
    server.use(
      http.get(`${BASE}/api/sessions/:id/alerts`, () =>
        HttpResponse.json([]),
      ),
    )
    renderWithQueryClient(<AlertsPanel sessionId={1} />)

    await waitFor(() => {
      expect(screen.queryAllByTestId('alert-item')).toHaveLength(0)
    })
    // The panel is still present with an empty presentation.
    expect(screen.getByTestId('alerts-panel')).toBeInTheDocument()
    expect(screen.queryByTestId('error-state')).toBeNull()
  })

  it('updates on session change with no carry-over', async () => {
    installHandlers()
    const { rerender } = renderWithQueryClient(<AlertsPanel sessionId={1} />)

    await waitFor(() => {
      expect(screen.getAllByTestId('alert-item')).toHaveLength(3)
    })

    rerender(<AlertsPanel sessionId={2} />)

    await waitFor(() => {
      expect(screen.getAllByTestId('alert-item')).toHaveLength(1)
    })
    const item = screen.getAllByTestId('alert-item')[0]
    expect(item.getAttribute('data-severity')).toBe('warning')
    expect(item.querySelector('[data-role="message"]')!.textContent).toBe(
      'Fuel level low nearing session end',
    )
    // No carry-over of session-1 critical alert.
    expect(
      screen.queryAllByTestId('alert-item').filter(
        (el) => el.getAttribute('data-severity') === 'critical',
      ),
    ).toHaveLength(0)
  })

  it('shows a loading indicator before data arrives', async () => {
    installHandlers()
    renderWithQueryClient(<AlertsPanel sessionId={1} />)
    expect(screen.getByTestId('loading-indicator')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.queryByTestId('loading-indicator')).toBeNull()
    })
  })
})

/** Parse an rgb()/hex computed color string into {r,g,b}. */
function parseRgb(color: string): { r: number; g: number; b: number } {
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/i)
  if (m) {
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) }
  }
  const hex = color.match(/^#([0-9a-f]{6})$/i)
  if (hex) {
    const n = parseInt(hex[1], 16)
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
  }
  return { r: 0, g: 0, b: 0 }
}
