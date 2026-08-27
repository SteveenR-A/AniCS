import React, { Component, ErrorInfo, ReactNode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Importar fuente Inter y Outfit desde Google Fonts
const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@700;800;900&display=swap';
document.head.appendChild(link);

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Unhandled UI Exception caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '100vh', width: '100vw', background: '#0a0b0f', color: '#f3f4f6', padding: 24,
          fontFamily: 'Inter, sans-serif', textAlign: 'center', boxSizing: 'border-box',
        }}>
          <div style={{
            background: '#13151f', border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 16, padding: '32px 28px', maxWidth: 480, width: '100%',
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, background: 'rgba(239, 68, 68, 0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
              color: '#ef4444', fontSize: 26, fontWeight: 'bold',
            }}>
              !
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, margin: '0 0 8px' }}>Se produjo un error visual</h2>
            <p style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 20px', lineHeight: 1.5 }}>
              {this.state.error?.message || 'Error desconocido al renderizar la interfaz'}
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                background: 'linear-gradient(135deg, #6366f1, #ec4899)',
                border: 'none', borderRadius: 8, padding: '10px 20px',
                color: 'white', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(99,102,241,0.4)',
              }}
            >
              Recargar Aplicación
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
