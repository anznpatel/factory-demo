import { vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterAll, afterEach, beforeAll } from 'vitest'
import { server } from './msw-server'

// Mock Recharts ResponsiveContainer so charts render in jsdom (which has no
// real layout/ResizeObserver). The real ResponsiveContainer measures its
// parent and clones the child chart with width/height props; we replicate
// that by injecting fixed dimensions so the chart produces SVG content.
vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('recharts')>()
  const { createElement, Children, cloneElement } = await import('react')
  return {
    ...actual,
    ResponsiveContainer: (props: { children?: React.ReactNode }) => {
      const child = Children.only(props.children) as React.ReactElement<Record<string, unknown>>
      return createElement(
        'div',
        { style: { width: 800, height: 300 } },
        cloneElement(child, { width: 800, height: 300 }),
      )
    },
  }
})

// Polyfill ResizeObserver for jsdom (some Recharts internals reference it).
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver = ResizeObserverStub as unknown as typeof ResizeObserver

// MSW global lifecycle: start the mock server before tests, reset handlers
// between tests (so per-test handlers don't leak), and close after the run.
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
afterEach(() => {
  cleanup()
  server.resetHandlers()
})
afterAll(() => server.close())
