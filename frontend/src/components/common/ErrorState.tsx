interface ErrorStateProps {
  message?: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div data-testid="error-state" role="alert">
      <span>{message ?? 'Something went wrong'}</span>
      {onRetry && <button onClick={onRetry}>Retry</button>}
    </div>
  )
}
