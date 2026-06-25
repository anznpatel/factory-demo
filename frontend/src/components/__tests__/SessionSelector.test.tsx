import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SessionSelector } from '../SessionSelector'
import { sessions } from '../../test/fixtures'

describe('SessionSelector', () => {
  it('renders a select with exactly 3 options ordered by id ascending', () => {
    render(
      <SessionSelector sessions={sessions} value={1} onChange={() => {}} />,
    )
    const selector = screen.getByTestId('session-selector')
    const options = selector.querySelectorAll('option')
    expect(options).toHaveLength(3)
    expect(options[0]).toHaveTextContent('Silverstone')
    expect(options[1]).toHaveTextContent('Monza')
    expect(options[2]).toHaveTextContent('Suzuka')
  })

  it('each option label contains track_name and driver', () => {
    render(
      <SessionSelector sessions={sessions} value={1} onChange={() => {}} />,
    )
    const selector = screen.getByTestId('session-selector')
    const options = Array.from(selector.querySelectorAll('option'))
    expect(options[0]).toHaveTextContent('Silverstone')
    expect(options[0]).toHaveTextContent('A. Verstappen')
    expect(options[1]).toHaveTextContent('Monza')
    expect(options[1]).toHaveTextContent('C. Leclerc')
    expect(options[2]).toHaveTextContent('Suzuka')
    expect(options[2]).toHaveTextContent('L. Hamilton')
  })

  it('default selection is session 1 and the select is enabled', () => {
    render(
      <SessionSelector sessions={sessions} value={1} onChange={() => {}} />,
    )
    const select = screen.getByTestId('session-selector').querySelector('select')!
    expect(select).toHaveValue('1')
    expect(select).not.toBeDisabled()
  })

  it('calls onChange with the new session id when changed', async () => {
    const user = (await import('@testing-library/user-event')).default
    let changed = 0
    render(
      <SessionSelector
        sessions={sessions}
        value={1}
        onChange={(id) => (changed = id)}
      />,
    )
    const select = screen.getByTestId('session-selector').querySelector('select')!
    await user.selectOptions(select, '3')
    expect(changed).toBe(3)
  })
})
