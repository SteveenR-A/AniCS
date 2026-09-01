import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Loader2, SearchX,
  RotateCcw, SlidersHorizontal, RefreshCw, Clock
} from 'lucide-react';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { advancedSearch } from '@/services/animeService';
import { CachedImage } from '@/components/CachedImage';
import { PaginationBar } from '@/components/PaginationBar';
import type { AnimeResult, SearchFilters } from '@/types';

function MobileResultCard({ anime, onClick }: { anime: AnimeResult; onClick: () => void }) {
  return (
    <motion.div
      layout
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        overflow: 'hidden', cursor: 'pointer',
        border: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column',
        position: 'relative',
      }}
    >
      <div style={{ position: 'relative', paddingBottom: '140%', background: 'var(--bg-elevated)' }}>
        <CachedImage
          src={anime.thumbnailUrl}
          alt={anime.title}
          fallbackIconSize={30}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(10,11,15,0.9) 0%, transparent 60%)',
        }} />

        {anime.episode && (
          <span style={{
            position: 'absolute', bottom: 6, right: 6,
            background: 'var(--accent-primary)',
            color: 'white', fontSize: 9, fontWeight: 800,
            padding: '2px 6px', borderRadius: 'var(--radius-sm)',
          }}>
            Ep. {anime.episode}
          </span>
        )}
      </div>

      <div style={{ padding: '8px 10px 10px' }}>
        <h4 style={{
          fontSize: 12, fontWeight: 700, lineHeight: 1.25,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          margin: 0, color: 'var(--text-primary)',
        }}>
          {anime.title}
        </h4>
      </div>
    </motion.div>
  );
}

export function MobileSearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    activeSource, searchResults, setSearchResults,
    isSearching, setIsSearching, genres, loadGenres,
    saveSearchSession, getSearchSession,
    recentSearches, addRecentSearch, removeRecentSearch, clearRecentSearches
  } = useAnimeStore();

  const urlQ = searchParams.get('q') ?? '';
  const urlPage = parseInt(searchParams.get('p') || '1', 10) || 1;
  const urlGenre = searchParams.get('genre') ?? '';
  const urlStatus = searchParams.get('status') ?? '';
  const urlType = searchParams.get('type') ?? '';
  const urlOrder = searchParams.get('order') ?? '';

  const [query, setQuery] = useState(urlQ);
  const [selectedGenre, setSelectedGenre] = useState<string>(urlGenre);
  const [selectedStatus, setSelectedStatus] = useState<string>(urlStatus);
  const [selectedType, setSelectedType] = useState<string>(urlType);
  const [selectedOrder, setSelectedOrder] = useState<string>(urlOrder);
  const [currentPage, setCurrentPage] = useState<number>(urlPage);
  const [totalPages, setTotalPages] = useState<number | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [showFilters, setShowFilters] = useState(Boolean(urlGenre || urlStatus || urlType));

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activeFilterCount = (selectedGenre ? 1 : 0) + (selectedStatus ? 1 : 0) + (selectedType ? 1 : 0) + (selectedOrder ? 1 : 0);

  useEffect(() => {
    loadGenres(activeSource);
  }, [activeSource, loadGenres]);

  const syncUrlParams = useCallback((
    newQ: string,
    newGenre: string,
    newStatus: string,
    newType: string,
    newOrder: string,
    newPage: number
  ) => {
    const params = new URLSearchParams();
    if (newQ.trim()) params.set('q', newQ.trim());
    if (newGenre) params.set('genre', newGenre);
    if (newStatus) params.set('status', newStatus);
    if (newType) params.set('type', newType);
    if (newOrder) params.set('order', newOrder);
    if (newPage > 1) params.set('p', String(newPage));
    if (activeSource) params.set('source', activeSource);

    setSearchParams(params, { replace: true });
  }, [activeSource, setSearchParams]);

  const executeSearch = useCallback(async (
    q: string,
    genre: string,
    status: string,
    type: string,
    order: string,
    page: number = 1
  ) => {
    const currentSource = activeSource;
    setIsSearching(true);
    try {
      const filters: SearchFilters = {
        query: q.trim() || undefined,
        genre: genre || undefined,
        status: status || undefined,
        animeType: type || undefined,
        orderBy: order || undefined,
        page,
      };

      const res = await advancedSearch(filters, currentSource);

      if (useAnimeStore.getState().activeSource !== currentSource) {
        return;
      }

      const sanitized = res.results.map((a) => ({ ...a, source: currentSource }));
      setSearchResults(sanitized, q, currentSource);
      setCurrentPage(page);
      setTotalPages(res.totalPages);
      setHasNextPage(res.hasNext);

      // Guardar sesión
      saveSearchSession(currentSource, {
        query: q,
        genre,
        status,
        animeType: type,
        orderBy: order,
        results: sanitized,
        currentPage: page,
        totalPages: res.totalPages,
        hasNextPage: res.hasNext,
      });

      if (q.trim()) {
        addRecentSearch(q.trim());
      }
    } catch (e) {
      console.error('Mobile search execution failed', e);
      if (useAnimeStore.getState().activeSource === currentSource) {
        setSearchResults([], q, currentSource);
        setTotalPages(undefined);
        setHasNextPage(false);
      }
    } finally {
      if (useAnimeStore.getState().activeSource === currentSource) {
        setIsSearching(false);
      }
    }
  }, [activeSource, setSearchResults, setIsSearching, saveSearchSession, addRecentSearch]);

  const lastExecutedKey = useRef<string>('');

  // Restaurar o ejecutar búsqueda inicial al cambiar fuente, filtros o URL
  useEffect(() => {
    const currentKey = `${activeSource}:${urlQ}:${urlGenre}:${urlStatus}:${urlType}:${urlOrder}:${urlPage}`;
    if (lastExecutedKey.current === currentKey) {
      return;
    }
    lastExecutedKey.current = currentKey;

    const session = getSearchSession(activeSource);
    const hasParams = Boolean(urlQ || urlGenre || urlStatus || urlType || urlOrder || urlPage > 1);

    if (!hasParams && session && session.results.length > 0) {
      setQuery(session.query);
      setSelectedGenre(session.genre);
      setSelectedStatus(session.status);
      setSelectedType(session.animeType);
      setSelectedOrder(session.orderBy);
      setCurrentPage(session.currentPage);
      setTotalPages(session.totalPages);
      setHasNextPage(session.hasNextPage);
      setSearchResults(session.results, session.query, activeSource);
      syncUrlParams(session.query, session.genre, session.status, session.animeType, session.orderBy, session.currentPage);
      return;
    }

    setQuery(urlQ);
    setSelectedGenre(urlGenre);
    setSelectedStatus(urlStatus);
    setSelectedType(urlType);
    setSelectedOrder(urlOrder);
    setCurrentPage(urlPage);

    executeSearch(urlQ, urlGenre, urlStatus, urlType, urlOrder, urlPage);
  }, [activeSource, urlQ, urlGenre, urlStatus, urlType, urlOrder, urlPage, getSearchSession, setSearchResults, syncUrlParams, executeSearch]);

  const handleInput = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      syncUrlParams(val, selectedGenre, selectedStatus, selectedType, selectedOrder, 1);
      executeSearch(val, selectedGenre, selectedStatus, selectedType, selectedOrder, 1);
    }, 400);
  };

  const handleGenreToggle = (slug: string) => {
    const nextGenre = selectedGenre === slug ? '' : slug;
    setSelectedGenre(nextGenre);
    syncUrlParams(query, nextGenre, selectedStatus, selectedType, selectedOrder, 1);
    executeSearch(query, nextGenre, selectedStatus, selectedType, selectedOrder, 1);
  };

  const handleResetFilters = () => {
    setQuery('');
    setSelectedGenre('');
    setSelectedStatus('');
    setSelectedType('');
    setSelectedOrder('');
    setCurrentPage(1);
    syncUrlParams('', '', '', '', '', 1);
    executeSearch('', '', '', '', '', 1);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    syncUrlParams(query, selectedGenre, selectedStatus, selectedType, selectedOrder, newPage);
    executeSearch(query, selectedGenre, selectedStatus, selectedType, selectedOrder, newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const mainEl = document.querySelector('main > div');
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div style={{ padding: '12px 14px 24px' }}>
      {/* Barra de Búsqueda Móvil */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-full)', padding: '8px 14px',
        }}>
          <Search size={16} color="var(--text-muted)" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Buscar en catálogo..."
            style={{
              flex: 1, background: 'transparent', border: 'none',
              outline: 'none', color: 'var(--text-primary)', fontSize: 13,
            }}
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                syncUrlParams('', selectedGenre, selectedStatus, selectedType, selectedOrder, 1);
                executeSearch('', selectedGenre, selectedStatus, selectedType, selectedOrder, 1);
              }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Botón Filtros Móvil */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            background: activeFilterCount > 0
              ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
              : showFilters ? 'var(--bg-elevated)' : 'var(--bg-surface)',
            border: `1px solid ${activeFilterCount > 0 ? 'transparent' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius-full)', padding: '8px 14px',
            color: activeFilterCount > 0 ? 'white' : 'var(--text-primary)',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <SlidersHorizontal size={14} />
          {activeFilterCount > 0 && <span>({activeFilterCount})</span>}
        </button>

        {/* Botón Recargar Móvil */}
        <button
          onClick={() => {
            loadGenres(activeSource);
            executeSearch(query, selectedGenre, selectedStatus, selectedType, selectedOrder, currentPage);
          }}
          disabled={isSearching}
          title="Actualizar catálogo"
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-full)', padding: '8px 12px',
            color: 'var(--text-primary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <RefreshCw size={14} className={isSearching ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Chips de Búsquedas Recientes Móvil */}
      {recentSearches.length > 0 && !query && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 4 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, color: 'var(--text-muted)', fontSize: 11, fontWeight: 600, flexShrink: 0 }}>
            <Clock size={12} />
          </div>
          {recentSearches.map((term) => (
            <div
              key={term}
              style={{
                display: 'flex', alignItems: 'center', gap: 4,
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-full)', padding: '3px 10px',
                fontSize: 11, color: 'var(--text-secondary)', flexShrink: 0,
              }}
            >
              <span
                onClick={() => {
                  setQuery(term);
                  syncUrlParams(term, selectedGenre, selectedStatus, selectedType, selectedOrder, 1);
                  executeSearch(term, selectedGenre, selectedStatus, selectedType, selectedOrder, 1);
                }}
                style={{ cursor: 'pointer', fontWeight: 600 }}
              >
                {term}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); removeRecentSearch(term); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex' }}
              >
                <X size={11} />
              </button>
            </div>
          ))}
          <button
            onClick={clearRecentSearches}
            style={{
              background: 'none', border: 'none', color: 'var(--accent-primary)',
              fontSize: 10, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
            }}
          >
            Borrar
          </button>
        </div>
      )}

      {/* Panel Desplegable de Filtros Móvil */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{
              overflow: 'hidden',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-lg)', padding: '12px 14px', marginBottom: 14,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Géneros ({genres.length})
              </span>
              {activeFilterCount > 0 && (
                <button
                  onClick={handleResetFilters}
                  style={{
                    background: 'none', border: 'none', color: 'var(--accent-primary)',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <RotateCcw size={11} /> Limpiar
                </button>
              )}
            </div>

            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 4,
              maxHeight: 110, overflowY: 'auto',
            }}>
              {genres.map((g) => {
                const isSelected = selectedGenre === g.slug || selectedGenre === g.name;
                return (
                  <button
                    key={g.slug}
                    onClick={() => handleGenreToggle(g.slug)}
                    style={{
                      padding: '3px 8px', borderRadius: 'var(--radius-full)',
                      background: isSelected ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                      border: 'none',
                      color: isSelected ? 'white' : 'var(--text-secondary)',
                      fontSize: 11, fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer',
                    }}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resultados 2 Columnas Móvil */}
      {isSearching && searchResults.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '60px 0', flexDirection: 'column', gap: 10 }}>
          <Loader2 size={30} className="animate-spin" color="var(--accent-primary)" />
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Buscando...</p>
        </div>
      ) : searchResults.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 16px' }}>
          <SearchX size={44} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.5 }} />
          <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', margin: '0 0 6px' }}>
            Sin resultados
          </h4>
          <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '0 0 14px' }}>
            Prueba con otro término de búsqueda.
          </p>
          <button
            onClick={handleResetFilters}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
              borderRadius: 'var(--radius-md)', padding: '6px 16px',
              color: 'var(--text-primary)', cursor: 'pointer', fontSize: 12,
            }}
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: 10,
          }}>
            {searchResults.map((anime) => (
              <MobileResultCard
                key={`${anime.source}-${anime.url}`}
                anime={anime}
                onClick={() => navigate(`/details/${encodeURIComponent(anime.url)}?source=${anime.source}`, {
                  state: { anime },
                })}
              />
            ))}
          </div>

          {/* Paginador Numérico Móvil */}
          <PaginationBar
            currentPage={currentPage}
            totalPages={totalPages}
            hasNext={hasNextPage}
            onPageChange={handlePageChange}
            isLoading={isSearching}
          />
        </>
      )}
    </div>
  );
}
