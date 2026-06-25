import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { DashboardLayout } from './components/DashboardLayout'
import './App.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Transient "Failed to fetch" blips (e.g. a connection reset under
      // concurrent load) recover with a short exponential backoff.
      retry: 3,
      retryDelay: (attempt) => Math.min(300 * 2 ** attempt, 2000),
      refetchOnWindowFocus: false,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <DashboardLayout />
    </QueryClientProvider>
  )
}

export default App
