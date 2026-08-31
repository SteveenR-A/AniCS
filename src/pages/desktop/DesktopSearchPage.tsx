import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Loader2, SearchX,
  RotateCcw, ChevronDown, ChevronUp, Check, SlidersHorizontal, RefreshCw, Clock
} from 'lucide-react';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { advancedSearch } from '@/services/animeService';
import { CachedImage } from '@/components/CachedImage';
import { PaginationBar } from '@/components/PaginationBar';
import type { AnimeResult, SearchFilters } from '@/types';

function ResultCard({ anime, onClick }: { anime: AnimeResult; onClick: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -5, scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        overflow: 'hidden', cursor: 'pointer',
        border: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column',
        position: 'relative',
        boxShadow: 'var(--shadow-card)',
        transition: 'border-color var(--transition-fast)',
      }}
    >
      <div style={{ position: 'relative', paddingBottom: '140%', background: 'var(--bg-elevated)' }}>
        <CachedImage
          src={anime.thumbnailUrl}
          alt={anime.title}
          fallbackIconSize={36}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(10,11,15,0.95) 0%, transparent 60%)',
        }} />

        {anime.animeType && (
          <span style={{
            position: 'absolute', top: 8, left: 8,
            background: 'rgba(10,11,15,0.75)', backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-subtle)',
            color: 'white', fontSize: 10, fontWeight: 700,
            padding: '2px 8px', borderRadius: 'var(--radius-full)',
          }}>
            {anime.animeType}
          </span>
        )}

        {anime.status && (
          <span style={{
            position: 'absolute', top: 8, right: 8,
            background: anime.status.toLowerCase().includes('concluido') ? 'rgba(147,51,234,0.3)' : 'rgba(16,185,129,0.3)',
            color: anime.status.toLowerCase().includes('concluido') ? '#c084fc' : '#34d399',
            border: '1px solid rgba(255,255,255,0.1)',
            fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 'var(--radius-full)',
            backdropFilter: 'blur(8px)',
          }}>
            ● {anime.status}
          </span>
        )}

        {anime.episode && (
          <span style={{
            position: 'absolute', bottom: 8, right: 8,
            background: 'var(--accent-primary)',
            color: 'white', fontSize: 10, fontWeight: 800,
            padding: '2px 8px', borderRadius: 'var(--radius-sm)',
          }}>
            Ep. {anime.episode}
          </span>
        )}
      </div>

      <div style={{ padding: '12px 14px 14px' }}>
        <h4 style={{
          fontSize: 13, fontWeight: 700, lineHeight: 1.35,
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

export function DesktopSearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    activeSource, setActiveSource, searchResults, setSearchResults,
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

  // Sincronizar fuente si está en los parámetros de la URL
  useEffect(() => {
    const urlSource = searchParams.get('source');
    if (urlSource && urlSource !== activeSource) {
      setActiveSource(urlSource);
    }
  }, [searchParams, activeSource, setActiveSource]);

  useEffect(() => {
    loadGenres(activeSource);
  }, [activeSource, loadGenres]);

  // Actualizar la URL de forma sincronizada
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

  // Ejecutar búsqueda avanzada paginada
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

      // Guardar en la sesión de búsqueda de esta fuente
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
      console.error('Search execution failed', e);
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

  // Restaurar o ejecutar búsqueda inicial al cambiar fuente o montar
  useEffect(() => {
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
  }, [activeSource]);

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

  const handleTypeSelect = (t: string) => {
    setSelectedType(t);
    syncUrlParams(query, selectedGenre, selectedStatus, t, selectedOrder, 1);
    executeSearch(query, selectedGenre, selectedStatus, t, selectedOrder, 1);
  };

  const handleStatusSelect = (st: string) => {
    setSelectedStatus(st);
    syncUrlParams(query, selectedGenre, st, selectedType, selectedOrder, 1);
    executeSearch(query, selectedGenre, st, selectedType, selectedOrder, 1);
  };

  const handleOrderChange = (ord: string) => {
    setSelectedOrder(ord);
    syncUrlParams(query, selectedGenre, selectedStatus, selectedType, ord, 1);
    executeSearch(query, selectedGenre, selectedStatus, selectedType, ord, 1);
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
    <div style={{ padding: '28px 36px', maxWidth: 1440, margin: '0 auto' }}>
      {/* Barra de Búsqueda Superior Desktop */}
      <div style={{ display: 'flex', gap: 14, marginBottom: 16, alignItems: 'center' }}>
        <div style={{
          flex: 1, minWidth: 300, display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-full)', padding: '12px 20px',
          boxShadow: 'var(--shadow-subtle)',
        }}>
          <Search size={18} color="var(--text-muted)" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Buscar anime por título (ej. Naruto, Solo Leveling, Jujutsu Kaisen)..."
            style={{
              flex: 1, background: 'transparent', border: 'none',
              outline: 'none', color: 'var(--text-primary)', fontSize: 14,
            }}
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                syncUrlParams('', selectedGenre, selectedStatus, selectedType, selectedOrder, 1);
                executeSearch('', selectedGenre, selectedStatus, selectedType, selectedOrder, 1);
              }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={18} />
            </button>
          )}
        </div>

        {/* Selector de Fuente Desktop */}
        <div style={{
          display: 'flex', background: 'var(--bg-surface)',
          padding: 4, borderRadius: 'var(--radius-full)',
          border: '1px solid var(--border-subtle)',
        }}>
          {['jkanime', 'mundodonghua'].map((src) => (
            <button
              key={src}
              onClick={() => setActiveSource(src)}
              style={{
                padding: '8px 18px', borderRadius: 'var(--radius-full)',
                background: activeSource === src ? 'var(--accent-primary)' : 'transparent',
                color: activeSource === src ? 'white' : 'var(--text-secondary)',
                border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {src === 'jkanime' ? 'JKAnime' : 'MundoDonghua'}
            </button>
          ))}
        </div>

        {/* Botón Filtros Desktop */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            background: activeFilterCount > 0
              ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
              : showFilters ? 'var(--bg-elevated)' : 'var(--bg-surface)',
            border: `1px solid ${activeFilterCount > 0 ? 'transparent' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius-full)', padding: '10px 20px',
            color: activeFilterCount > 0 ? 'white' : 'var(--text-primary)',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: activeFilterCount > 0 ? 'var(--shadow-glow)' : 'none',
            transition: 'all 0.15s ease',
          }}
        >
          <SlidersHorizontal size={15} />
          <span>Filtros</span>
          {activeFilterCount > 0 && (
            <span style={{
              background: 'white', color: 'var(--accent-primary)',
              borderRadius: 'var(--radius-full)', padding: '1px 6px',
              fontSize: 10, fontWeight: 800,
            }}>
              {activeFilterCount}
            </span>
          )}
          {showFilters ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>

        {/* Botón Recargar / Actualizar */}
        <button
          onClick={() => {
            loadGenres(activeSource);
            executeSearch(query, selectedGenre, selectedStatus, selectedType, selectedOrder, currentPage);
          }}
          disabled={isSearching}
          title="Actualizar catálogo y recargar resultados"
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-full)', padding: '10px 18px',
            color: 'var(--text-primary)', fontSize: 13, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
            boxShadow: 'var(--shadow-subtle)',
          }}
        >
          <RefreshCw size={15} className={isSearching ? 'animate-spin' : ''} />
          <span>Actualizar</span>
        </button>
      </div>

      {/* Búsquedas Recientes */}
      {recentSearches.length > 0 && !query && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
            <Clock size={13} />
            <span>Recientes:</span>
          </div>
          {recentSearches.map((term) => (
            <div
              key={term}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-full)', padding: '4px 12px',
                fontSize: 12, color: 'var(--text-secondary)',
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
                <X size={12} />
              </button>
            </div>
          ))}
          <button
            onClick={clearRecentSearches}
            style={{
              background: 'none', border: 'none', color: 'var(--accent-primary)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', marginLeft: 4,
            }}
          >
            Borrar historial
          </button>
        </div>
      )}

      {/* Panel de Filtros Desktop */}
      <AnimatePresence>
        {showFilters && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            style={{
              overflow: 'hidden',
              background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-xl)', padding: '20px 24px', marginBottom: 24,
              display: 'flex', flexDirection: 'column', gap: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Géneros ({genres.length})
              </span>
              {activeFilterCount > 0 && (
                <button
                  onClick={handleResetFilters}
                  style={{
                    background: 'none', border: 'none', color: 'var(--accent-primary)',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  <RotateCcw size={12} /> Limpiar filtros
                </button>
              )}
            </div>

            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6,
              maxHeight: 140, overflowY: 'auto', paddingRight: 4,
            }}>
              {genres.map((g) => {
                const isSelected = selectedGenre === g.slug || selectedGenre === g.name;
                return (
                  <button
                    key={g.slug}
                    onClick={() => handleGenreToggle(g.slug)}
                    style={{
                      padding: '6px 14px', borderRadius: 'var(--radius-full)',
                      background: isSelected ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                      border: `1px solid ${isSelected ? 'transparent' : 'var(--border-subtle)'}`,
                      color: isSelected ? 'white' : 'var(--text-secondary)',
                      fontSize: 12, fontWeight: isSelected ? 700 : 500,
                      cursor: 'pointer', transition: 'all 0.12s ease',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                  >
                    {isSelected && <Check size={12} />}
                    {g.name}
                  </button>
                );
              })}
            </div>

            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center',
              borderTop: '1px solid var(--border-subtle)', paddingTop: 14,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Tipo:</span>
                {['', 'serie', 'pelicula', 'ova'].map((t) => (
                  <button
                    key={t}
                    onClick={() => handleTypeSelect(t)}
                    style={{
                      padding: '5px 12px', borderRadius: 'var(--radius-md)',
                      background: selectedType === t ? 'var(--bg-elevated)' : 'transparent',
                      border: selectedType === t ? '1px solid var(--accent-primary)' : '1px solid transparent',
                      color: selectedType === t ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      fontSize: 12, fontWeight: selectedType === t ? 700 : 500, cursor: 'pointer',
                    }}
                  >
                    {t === '' ? 'Todos' : t === 'serie' ? 'Series' : t === 'pelicula' ? 'Películas' : 'OVAs'}
                  </button>
                ))}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Estado:</span>
                {['', 'en-emision', 'concluido'].map((st) => (
                  <button
                    key={st}
                    onClick={() => handleStatusSelect(st)}
                    style={{
                      padding: '5px 12px', borderRadius: 'var(--radius-md)',
                      background: selectedStatus === st ? 'var(--bg-elevated)' : 'transparent',
                      border: selectedStatus === st ? '1px solid var(--accent-primary)' : '1px solid transparent',
                      color: selectedStatus === st ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      fontSize: 12, fontWeight: selectedStatus === st ? 700 : 500, cursor: 'pointer',
                    }}
                  >
                    {st === '' ? 'Todos' : st === 'en-emision' ? 'En emisión' : 'Concluido'}
                  </button>
                ))}
              </div>

              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Orden:</span>
                <select
                  value={selectedOrder}
                  onChange={(e) => handleOrderChange(e.target.value)}
                  style={{
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)', padding: '5px 12px',
                    color: 'var(--text-primary)', fontSize: 12, fontWeight: 600, outline: 'none',
                  }}
                >
                  <option value="">Por defecto</option>
                  <option value="recientes">Más recientes</option>
                  <option value="alfabetico">Alfabético</option>
                  <option value="populares">Más populares</option>
                </select>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resultados Desktop */}
      {isSearching && searchResults.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '100px 0', flexDirection: 'column', gap: 14 }}>
          <Loader2 size={40} className="animate-spin" color="var(--accent-primary)" />
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Explorando catálogo...</p>
        </div>
      ) : searchResults.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '100px 20px' }}>
          <SearchX size={60} style={{ color: 'var(--text-muted)', margin: '0 auto 16px', opacity: 0.5 }} />
          <h3 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
            No se encontraron animes
          </h3>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, maxWidth: 400, margin: '0 auto 20px' }}>
            Intenta con otros términos o limpia los filtros seleccionados.
          </p>
          <button
            onClick={handleResetFilters}
            style={{
              background: 'var(--bg-elevated)', border: '1px solid var(--border-moderate)',
              borderRadius: 'var(--radius-md)', padding: '10px 24px',
              color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            }}
          >
            Limpiar filtros
          </button>
        </div>
      ) : (
        <>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
            gap: 18,
          }}>
            {searchResults.map((anime) => (
              <ResultCard
                key={`${anime.source}-${anime.url}`}
                anime={anime}
                onClick={() => navigate(`/details/${encodeURIComponent(anime.url)}?source=${anime.source}`, {
                  state: { anime },
                })}
              />
            ))}
          </div>

          {/* Paginador Numérico Completo */}
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
