import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithQueryClient } from '../../../test/render'
import { makeTelemetry } from '../../../test/fixtures'
import { SpeedChart } from '../SpeedChart'

const samples = makeTelemetry(1, 2).samples

describe('SpeedChart', () => {
  it('renders a wrapper with data-testid="speed-chart" containing an SVG', () => {
    renderWithQueryClient(<SpeedChart samples={samples} />)
    const wrapper = screen.getByTestId('speed-chart')
    expect(wrapper).toBeInTheDocument()
    const svg = wrapper.querySelector('svg')
    expect(svg).not.toBeNull()
  })

  it('draws exactly one line (recharts-line-curve or svg path)', () => {
    renderWithQueryClient(<SpeedChart samples={samples} />)
    const wrapper = screen.getByTestId('speed-chart')
    const lines = wrapper.querySelectorAll('.recharts-line-curve')
    expect(lines.length).toBe(1)
  })

  it('has an x-axis with t_ms ticks and at least one y-axis', () => {
    renderWithQueryClient(<SpeedChart samples={samples} />)
    const wrapper = screen.getByTestId('speed-chart')
    const xAxes = wrapper.querySelectorAll('.recharts-xAxis')
    expect(xAxes.length).toBeGreaterThanOrEqual(1)
    const yAxes = wrapper.querySelectorAll('.recharts-yAxis')
    expect(yAxes.length).toBeGreaterThanOrEqual(1)
  })

  it('does not show loading/empty/error placeholder when data is present', () => {
    renderWithQueryClient(<SpeedChart samples={samples} />)
    const wrapper = screen.getByTestId('speed-chart')
    expect(wrapper.querySelector('[data-testid="loading-indicator"]')).toBeNull()
    expect(wrapper.querySelector('[data-testid="empty-state"]')).toBeNull()
    expect(wrapper.querySelector('[data-testid="error-state"]')).toBeNull()
  })
})
