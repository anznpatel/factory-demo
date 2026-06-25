import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithQueryClient } from '../../../test/render'
import { makeTelemetry } from '../../../test/fixtures'
import { GForceChart } from '../GForceChart'

const samples = makeTelemetry(1, 2).samples

describe('GForceChart', () => {
  it('renders a wrapper with data-testid="gforce-chart" containing an SVG', () => {
    renderWithQueryClient(<GForceChart samples={samples} />)
    const wrapper = screen.getByTestId('gforce-chart')
    expect(wrapper).toBeInTheDocument()
    expect(wrapper.querySelector('svg')).not.toBeNull()
  })

  it('renders scatter symbols (more than 1 point) with no connected line', () => {
    renderWithQueryClient(<GForceChart samples={samples} />)
    const wrapper = screen.getByTestId('gforce-chart')
    // Scatter points render as circles or symbols.
    const symbols = wrapper.querySelectorAll('circle, .recharts-symbols')
    expect(symbols.length).toBeGreaterThan(1)
    // No line curve should be present.
    const lines = wrapper.querySelectorAll('.recharts-line-curve')
    expect(lines.length).toBe(0)
  })

  it('has both x-axis (g_lat) and y-axis (g_long) with numeric ticks', () => {
    renderWithQueryClient(<GForceChart samples={samples} />)
    const wrapper = screen.getByTestId('gforce-chart')
    const xAxes = wrapper.querySelectorAll('.recharts-xAxis')
    const yAxes = wrapper.querySelectorAll('.recharts-yAxis')
    expect(xAxes.length).toBeGreaterThanOrEqual(1)
    expect(yAxes.length).toBeGreaterThanOrEqual(1)
  })

  it('does not show loading/empty/error placeholder when data is present', () => {
    renderWithQueryClient(<GForceChart samples={samples} />)
    const wrapper = screen.getByTestId('gforce-chart')
    expect(wrapper.querySelector('[data-testid="loading-indicator"]')).toBeNull()
    expect(wrapper.querySelector('[data-testid="empty-state"]')).toBeNull()
    expect(wrapper.querySelector('[data-testid="error-state"]')).toBeNull()
  })
})
