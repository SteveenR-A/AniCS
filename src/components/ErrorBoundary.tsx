import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';

export class ErrorBoundary extends Component<{
  children: ReactNode;
  onHome?: () => void;
  resetKey?: string;
}, { hasError: boolean; resetKey?: string }> {
  state = { hasError: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('AniCS: error al mostrar una pantalla', error, info);
  }

  static getDerivedStateFromProps(props: { resetKey?: string }, state: { resetKey?: string }) {
    return props.resetKey !== state.resetKey ? { hasError: false, resetKey: props.resetKey } : null;
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <section className="screen-error" role="alert">
        <AlertCircle size={36} aria-hidden="true" />
        <h2>No se pudo mostrar esta pantalla</h2>
        <p>Puedes volver a intentarlo o regresar al inicio.</p>
        <div className="screen-error-actions">
          <button type="button" onClick={() => this.setState({ hasError: false })}>Reintentar</button>
          {this.props.onHome && <button type="button" onClick={this.props.onHome}>Volver al inicio</button>}
          <button type="button" onClick={() => window.location.reload()}>Recargar aplicación</button>
        </div>
      </section>
    );
  }
}

/** Remount only the failed route; global stores and the app shell stay alive. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <ErrorBoundary resetKey={location.pathname + location.search} onHome={() => navigate('/')}>
      {children}
    </ErrorBoundary>
  );
}
