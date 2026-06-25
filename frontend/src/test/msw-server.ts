import { setupServer } from 'msw/node'

// A shared MSW server instance for Node-based Vitest tests. Per-test handlers
// are registered via `server.use(...)` in individual test files; the default
// handler set is intentionally empty so unmocked requests surface as errors
// (via `onUnhandledRequest: 'error'` in setup.ts) unless a test opts in.
export const server = setupServer()
