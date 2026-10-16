export function PageLoading({ label = 'Cargando pantalla…' }: { label?: string }) {
  return (
    <div className="page-loading" role="status" aria-live="polite" aria-busy="true">
      <p>{label}</p>
      <div className="page-loading-grid" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => <div key={index} className="skeleton" />)}
      </div>
    </div>
  );
}
