import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithQueryClient } from '../../../test/render'
import { makeTelemetry } from '../../../test/fixtures'
import { TireTempChart } from '../TireTempChart'

const samples = makeTelemetry(1, 2).samples

describe('TireTempChart', () => {
  it('renders a wrapper with data-testid="tire-temp-chart" containing an SVG', () => {
    renderWithQueryClient(<TireTempChart samples={samples} />)
    const wrapper = screen.getByTestId('tire-temp-chart')
    expect(wrapper).toBeInTheDocument()
    expect(wrapper.querySelector('svg')).not.toBeNull()
  })

  it('draws exactly 4 lines', () => {
    renderWithQueryClient(<TireTempChart samples={samples} />)
    const wrapper = screen.getByTestId('tire-temp-chart')
    const lines = wrapper.querySelectorAll('.recharts-line-curve')
    expect(lines.length).toBe(4)
  })

  it('shows a legend with 4 items', () => {
    renderWithQueryClient(<TireTempChart samples={samples} />)
    const wrapper = screen.getByTestId('tire-temp-chart')
    const legendItems = wrapper.querySelectorAll('.recharts-legend-item')
    expect(legendItems.length).toBe(4)
  })

  it('has an x-axis and at least one y-axis', () => {
    renderWithQueryClient(<TireTempChart samples={samples} />)
    const wrapper = screen.getByTestId('tire-temp-chart')
    expect(wrapper.querySelectorAll('.recharts-xAxis').length).toBeGreaterThanOrEqual(1)
    expect(wrapper.querySelectorAll('.recharts-yAxis').length).toBeGreaterThanOrEqual(1)
  })
})
