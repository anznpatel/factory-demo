interface EmptyStateProps {
  message?: string
}

export function EmptyState({ message = 'No data available' }: EmptyStateProps) {
  return (
    <div data-testid="empty-state">{message}</div>
  )
}
