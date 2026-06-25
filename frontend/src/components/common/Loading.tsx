interface LoadingProps {
  label?: string
}

export function Loading({ label = 'Loading…' }: LoadingProps) {
  return (
    <div data-testid="loading-indicator" role="status" aria-live="polite">
      {label}
    </div>
  )
}
