import { useState } from 'react';
import { ChevronLeft, ChevronRight, CornerDownLeft } from 'lucide-react';

interface PaginationBarProps {
  currentPage: number;
  totalPages?: number;
  hasNext?: boolean;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
}

export function PaginationBar({
  currentPage,
  totalPages,
  hasNext = false,
  onPageChange,
  isLoading = false,
}: PaginationBarProps) {
  const [jumpInput, setJumpInput] = useState('');
  const [showJumpInput, setShowJumpInput] = useState(false);

  // Si no conocemos el total de páginas exacto, estimamos según hasNext
  const effectiveTotal = totalPages && totalPages > 0 ? totalPages : (hasNext ? currentPage + 1 : currentPage);

  if (effectiveTotal <= 1 && !hasNext) {
    return null;
  }

  // Generar lista de páginas visibles con elipsis (...)
  const getVisiblePages = (): (number | '...')[] => {
    const pages: (number | '...')[] = [];
    const total = effectiveTotal;

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
      return pages;
    }

    // Siempre incluir página 1
    pages.push(1);

    if (currentPage > 3) {
      pages.push('...');
    }

    const start = Math.max(2, currentPage - 1);
    const end = Math.min(total - 1, currentPage + 1);

    for (let i = start; i <= end; i++) {
      if (!pages.includes(i)) {
        pages.push(i);
      }
    }

    if (currentPage < total - 2) {
      pages.push('...');
    }

    // Siempre incluir última página
    if (!pages.includes(total)) {
      pages.push(total);
    }

    return pages;
  };

  const handleJump = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseInt(jumpInput, 10);
    if (!isNaN(target) && target >= 1 && target <= effectiveTotal) {
      onPageChange(target);
      setShowJumpInput(false);
      setJumpInput('');
    }
  };

  const visiblePages = getVisiblePages();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 12,
      marginTop: 28,
      marginBottom: 16,
    }}>
      {/* Barra de botones de páginas */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-full)',
        padding: '6px 10px',
        boxShadow: 'var(--shadow-subtle)',
        maxWidth: '100%',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
      }}>
        {/* Botón Anterior */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1 || isLoading}
          title="Página anterior"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 34,
            height: 34,
            borderRadius: 'var(--radius-full)',
            border: 'none',
            background: 'var(--bg-elevated)',
            color: currentPage <= 1 || isLoading ? 'var(--text-muted)' : 'var(--text-primary)',
            cursor: currentPage <= 1 || isLoading ? 'not-allowed' : 'pointer',
            opacity: currentPage <= 1 ? 0.4 : 1,
            transition: 'all var(--transition-fast)',
            flexShrink: 0,
          }}
        >
          <ChevronLeft size={16} />
        </button>

        {/* Números de página */}
        {visiblePages.map((item, index) => {
          if (item === '...') {
            return (
              <button
                key={`ellipsis-${index}`}
                onClick={() => setShowJumpInput(!showJumpInput)}
                title="Saltar a página..."
                style={{
                  minWidth: 32,
                  height: 34,
                  padding: '0 4px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  borderRadius: 'var(--radius-sm)',
                }}
              >
                ...
              </button>
            );
          }

          const isCurrent = item === currentPage;

          return (
            <button
              key={`page-${item}`}
              onClick={() => onPageChange(item)}
              disabled={isLoading || isCurrent}
              style={{
                minWidth: 34,
                height: 34,
                padding: '0 8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 'var(--radius-full)',
                border: isCurrent ? '1px solid transparent' : '1px solid transparent',
                background: isCurrent ? 'var(--accent-primary)' : 'transparent',
                color: isCurrent ? '#ffffff' : 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: isCurrent ? 700 : 500,
                cursor: isCurrent || isLoading ? 'default' : 'pointer',
                boxShadow: isCurrent ? '0 2px 8px rgba(124, 58, 237, 0.4)' : 'none',
                transition: 'all var(--transition-fast)',
                flexShrink: 0,
              }}
            >
              {item}
            </button>
          );
        })}

        {/* Botón Siguiente */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={(totalPages ? currentPage >= totalPages : !hasNext) || isLoading}
          title="Página siguiente"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 34,
            height: 34,
            borderRadius: 'var(--radius-full)',
            border: 'none',
            background: 'var(--bg-elevated)',
            color: (totalPages ? currentPage >= totalPages : !hasNext) || isLoading ? 'var(--text-muted)' : 'var(--text-primary)',
            cursor: (totalPages ? currentPage >= totalPages : !hasNext) || isLoading ? 'not-allowed' : 'pointer',
            opacity: (totalPages ? currentPage >= totalPages : !hasNext) ? 0.4 : 1,
            transition: 'all var(--transition-fast)',
            flexShrink: 0,
          }}
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Input de Salto Rápido a Página */}
      {showJumpInput && (
        <form
          onSubmit={handleJump}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'var(--bg-elevated)',
            border: '1px solid var(--border-moderate)',
            borderRadius: 'var(--radius-full)',
            padding: '4px 10px',
            fontSize: 12,
          }}
        >
          <span style={{ color: 'var(--text-muted)' }}>Ir a:</span>
          <input
            type="number"
            min={1}
            max={effectiveTotal}
            value={jumpInput}
            onChange={(e) => setJumpInput(e.target.value)}
            placeholder={`1-${effectiveTotal}`}
            autoFocus
            style={{
              width: 55,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
              padding: '2px 6px',
              fontSize: 12,
              outline: 'none',
              textAlign: 'center',
            }}
          />
          <button
            type="submit"
            style={{
              background: 'var(--accent-primary)',
              border: 'none',
              borderRadius: 'var(--radius-full)',
              color: 'white',
              padding: '3px 8px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <CornerDownLeft size={12} />
          </button>
        </form>
      )}
    </div>
  );
}
