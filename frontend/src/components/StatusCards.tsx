/** Shared loading and error states for the data-backed cards. */
export function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="card empty" role="alert">
      <div className="empty-icon" aria-hidden>⚠️</div>
      <h2>We couldn't load office hours</h2>
      <p>{message}</p>
      <button className="btn btn-ghost" onClick={onRetry}>
        Try again
      </button>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="card" aria-busy="true" aria-label="Loading">
      <div className="skeleton" style={{ width: '30%' }} />
      <div className="skeleton-row">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="skeleton block" />
        ))}
      </div>
    </div>
  );
}
