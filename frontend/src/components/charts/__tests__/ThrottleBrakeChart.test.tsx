import { describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { renderWithQueryClient } from '../../../test/render'
import { makeTelemetry } from '../../../test/fixtures'
import { ThrottleBrakeChart } from '../ThrottleBrakeChart'

const samples = makeTelemetry(1, 2).samples

describe('ThrottleBrakeChart', () => {
  it('renders a wrapper with data-testid="throttle-brake-chart" containing an SVG', () => {
    renderWithQueryClient(<ThrottleBrakeChart samples={samples} />)
    const wrapper = screen.getByTestId('throttle-brake-chart')
    expect(wrapper).toBeInTheDocument()
    expect(wrapper.querySelector('svg')).not.toBeNull()
  })

  it('draws exactly 2 lines', () => {
    renderWithQueryClient(<ThrottleBrakeChart samples={samples} />)
    const wrapper = screen.getByTestId('throttle-brake-chart')
    const lines = wrapper.querySelectorAll('.recharts-line-curve')
    expect(lines.length).toBe(2)
  })

  it('shows a legend with 2 items', () => {
    renderWithQueryClient(<ThrottleBrakeChart samples={samples} />)
    const wrapper = screen.getByTestId('throttle-brake-chart')
    const legendItems = wrapper.querySelectorAll('.recharts-legend-item')
    expect(legendItems.length).toBe(2)
  })

  it('has an x-axis and at least one y-axis', () => {
    renderWithQueryClient(<ThrottleBrakeChart samples={samples} />)
    const wrapper = screen.getByTestId('throttle-brake-chart')
    expect(wrapper.querySelectorAll('.recharts-xAxis').length).toBeGreaterThanOrEqual(1)
    expect(wrapper.querySelectorAll('.recharts-yAxis').length).toBeGreaterThanOrEqual(1)
  })
})
