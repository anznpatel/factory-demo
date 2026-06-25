import type { ReactElement } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'

/** Render a component tree wrapped in a fresh QueryClientProvider. The
 *  returned `rerender` preserves the provider so hooks still resolve. */
export function renderWithQueryClient(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity, gcTime: 0 },
    },
  })
  const result = render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  )
  return {
    ...result,
    queryClient,
    rerender: (newUi: ReactElement) =>
      result.rerender(
        <QueryClientProvider client={queryClient}>{newUi}</QueryClientProvider>,
      ),
  }
}
