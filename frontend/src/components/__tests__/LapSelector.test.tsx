import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LapSelector } from '../LapSelector'
import { makeLaps } from '../../test/fixtures'

describe('LapSelector', () => {
  it('lists the session laps plus exactly one "All laps" option', () => {
    const laps = makeLaps(1) // 5 laps
    render(<LapSelector laps={laps} value={2} onChange={() => {}} />)
    const selector = screen.getByTestId('lap-selector')
    const options = Array.from(selector.querySelectorAll('option'))
    // 5 laps + 1 "All laps"
    expect(options).toHaveLength(6)
    const allLaps = options.filter((o) => /all laps/i.test(o.textContent ?? ''))
    expect(allLaps).toHaveLength(1)
  })

  it('per-lap options map one-to-one to lap numbers 1..N', () => {
    const laps = makeLaps(3) // 6 laps
    render(<LapSelector laps={laps} value={2} onChange={() => {}} />)
    const selector = screen.getByTestId('lap-selector')
    const lapOptions = Array.from(selector.querySelectorAll('option')).filter(
      (o) => !/all laps/i.test(o.textContent ?? ''),
    )
    const values = lapOptions.map((o) => o.getAttribute('value'))
    expect(values).toEqual(['1', '2', '3', '4', '5', '6'])
  })

  it('default lap is the session best lap (a concrete lap, not "All laps")', () => {
    const laps = makeLaps(1) // best is lap 2
    render(<LapSelector laps={laps} value={2} onChange={() => {}} />)
    const select = screen.getByTestId('lap-selector').querySelector('select')!
    expect(select).toHaveValue('2')
  })

  it('value of null selects "All laps"', () => {
    const laps = makeLaps(1)
    render(<LapSelector laps={laps} value={null} onChange={() => {}} />)
    const select = screen.getByTestId('lap-selector').querySelector('select')!
    expect(select).toHaveValue('all')
  })

  it('calls onChange with null for "All laps" and a number for a lap', async () => {
    const user = (await import('@testing-library/user-event')).default
    const calls: (number | null)[] = []
    const laps = makeLaps(1)
    render(
      <LapSelector laps={laps} value={2} onChange={(l) => calls.push(l)} />,
    )
    const select = screen.getByTestId('lap-selector').querySelector('select')!
    await user.selectOptions(select, 'all')
    await user.selectOptions(select, '3')
    expect(calls).toEqual([null, 3])
  })
})
