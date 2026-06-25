import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithQueryClient } from '../../../test/render'
import { makeTelemetry } from '../../../test/fixtures'
import { RPMGearChart } from '../RPMGearChart'

const samples = makeTelemetry(1, 2).samples

describe('RPMGearChart', () => {
  it('renders a wrapper with data-testid="rpm-gear-chart" containing an SVG', () => {
    renderWithQueryClient(<RPMGearChart samples={samples} />)
    const wrapper = screen.getByTestId('rpm-gear-chart')
    expect(wrapper).toBeInTheDocument()
    expect(wrapper.querySelector('svg')).not.toBeNull()
  })

  it('draws at least 2 lines on dual y-axes', () => {
    renderWithQueryClient(<RPMGearChart samples={samples} />)
    const wrapper = screen.getByTestId('rpm-gear-chart')
    const lines = wrapper.querySelectorAll('.recharts-line-curve')
    expect(lines.length).toBeGreaterThanOrEqual(2)
    const yAxes = wrapper.querySelectorAll('.recharts-yAxis')
    expect(yAxes.length).toBeGreaterThanOrEqual(2)
  })

  it('shows a legend with 2 items', () => {
    renderWithQueryClient(<RPMGearChart samples={samples} />)
    const wrapper = screen.getByTestId('rpm-gear-chart')
    const legendItems = wrapper.querySelectorAll('.recharts-legend-item')
    expect(legendItems.length).toBe(2)
  })

  it('has an x-axis and at least one y-axis with ticks', () => {
    renderWithQueryClient(<RPMGearChart samples={samples} />)
    const wrapper = screen.getByTestId('rpm-gear-chart')
    expect(wrapper.querySelectorAll('.recharts-xAxis').length).toBeGreaterThanOrEqual(1)
    expect(wrapper.querySelectorAll('.recharts-yAxis').length).toBeGreaterThanOrEqual(1)
  })
})
