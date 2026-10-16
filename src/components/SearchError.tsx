export function SearchError({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="screen-error" role="alert">
      <h3>No se pudo completar la búsqueda</h3>
      <p>Comprueba tu conexión o vuelve a intentarlo. El proveedor puede no estar disponible.</p>
      <button type="button" onClick={onRetry}>Reintentar búsqueda</button>
    </section>
  );
}
