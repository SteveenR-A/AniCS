import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Loader2, Film, SearchX, Filter,
  RotateCcw, ChevronDown, Layers, Sparkles, Check
} from 'lucide-react';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { searchAnime, advancedSearch } from '@/services/animeService';
import { CachedImage } from '@/components/CachedImage';
import type { AnimeResult, SearchFilters } from '@/types';

function ResultCard({ anime, onClick }: { anime: AnimeResult; onClick: () => void }) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -4, scale: 1.02 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        overflow: 'hidden', cursor: 'pointer',
        border: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column',
        position: 'relative',
        transition: 'border-color var(--transition-fast)',
      }}
    >
      <div style={{ position: 'relative', paddingBottom: '140%', background: 'var(--bg-elevated)' }}>
        <CachedImage
          src={anime.thumbnailUrl}
          alt={anime.title}
          fallbackIconSize={32}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(10,11,15,0.9) 0%, transparent 60%)',
        }} />

        {/* Badges */}
        {anime.episode && (
          <div style={{
            position: 'absolute', top: 8, right: 8,
            background: 'var(--accent-primary)',
            color: 'white', fontSize: 11, fontWeight: 700,
            padding: '2px 8px', borderRadius: 'var(--radius-full)',
          }}>
            Ep {anime.episode}
          </div>
        )}

        {anime.animeType && (
          <div style={{
            position: 'absolute', top: 8, left: 8,
            background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(8px)',
            color: 'white', fontSize: 10, fontWeight: 600,
            padding: '2px 7px', borderRadius: 'var(--radius-full)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}>
            {anime.animeType}
          </div>
        )}

        <div style={{
          position: 'absolute', bottom: 8, left: 10, right: 10,
        }}>
          <div style={{
            fontSize: 13, fontWeight: 700, color: 'white',
            lineHeight: 1.3,
            overflow: 'hidden', display: '-webkit-box',
            WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
          }}>
            {anime.title}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {anime.source === 'jkanime' ? 'JKAnime' : 'MundoDonghua'}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function SearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    sources, activeSource, setActiveSource,
    genres, isLoadingGenres, loadGenres,
    searchResults, setSearchResults,
    isSearching, setIsSearching
  } = useAnimeStore();

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [selectedGenre, setSelectedGenre] = useState<string>(searchParams.get('genre') ?? '');
  const [selectedStatus, setSelectedStatus] = useState<string>(searchParams.get('status') ?? '');
  const [selectedType, setSelectedType] = useState<string>(searchParams.get('type') ?? '');
  const [selectedOrder, setSelectedOrder] = useState<string>(searchParams.get('order') ?? '');
  const [showFiltersPanel, setShowFiltersPanel] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Inicializar fuente desde URL si está presente
  useEffect(() => {
    const urlSource = searchParams.get('source');
    if (urlSource && urlSource !== activeSource) {
      setActiveSource(urlSource);
    }
  }, [searchParams, activeSource, setActiveSource]);

  // Cargar géneros dinámicos para la fuente activa
  useEffect(() => {
    if (genres.length === 0) {
      loadGenres(activeSource);
    }
  }, [activeSource, genres.length, loadGenres]);

  // Ejecutar búsqueda o filtrado avanzado
  const executeSearch = useCallback(async (
    q: string,
    genre: string,
    status: string,
    type: string,
    order: string,
    page: number = 1
  ) => {
    setIsSearching(true);
    try {
      const hasAdvancedFilters = Boolean(genre || status || type || order);

      if (hasAdvancedFilters) {
        const filters: SearchFilters = {
          query: q.trim() || undefined,
          genre: genre || undefined,
          status: status || undefined,
          anime_type: type || undefined,
          order_by: order || undefined,
          page,
        };
        const res = await advancedSearch(filters, activeSource);
        if (page > 1) {
          setSearchResults([...searchResults, ...res.results]);
        } else {
          setSearchResults(res.results);
        }
        setHasNextPage(res.hasNext);
      } else if (q.trim()) {
        const res = await searchAnime(q.trim(), activeSource);
        setSearchResults(res);
        setHasNextPage(false);
      } else {
        // Sin filtros ni texto: cargar directorio general
        const res = await advancedSearch({ page: 1 }, activeSource);
        setSearchResults(res.results);
        setHasNextPage(res.hasNext);
      }
    } catch (e) {
      console.error(e);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
      setIsLoadingMore(false);
    }
  }, [activeSource, searchResults, setSearchResults, setIsSearching]);

  // Sincronizar búsqueda cuando cambian los filtros
  useEffect(() => {
    const genreParam = searchParams.get('genre') ?? '';
    const qParam = searchParams.get('q') ?? '';
    if (genreParam !== selectedGenre) setSelectedGenre(genreParam);
    if (qParam !== query) setQuery(qParam);

    executeSearch(qParam, genreParam, selectedStatus, selectedType, selectedOrder, 1);
    setCurrentPage(1);
  }, [activeSource, selectedGenre, selectedStatus, selectedType, selectedOrder]);

  const handleInput = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      executeSearch(val, selectedGenre, selectedStatus, selectedType, selectedOrder, 1);
    }, 500);
  };

  const handleGenreToggle = (slug: string) => {
    const nextGenre = selectedGenre === slug ? '' : slug;
    setSelectedGenre(nextGenre);
    const newParams = new URLSearchParams(searchParams);
    if (nextGenre) {
      newParams.set('genre', nextGenre);
    } else {
      newParams.delete('genre');
    }
    setSearchParams(newParams);
  };

  const handleResetFilters = () => {
    setQuery('');
    setSelectedGenre('');
    setSelectedStatus('');
    setSelectedType('');
    setSelectedOrder('');
    setSearchParams({});
    executeSearch('', '', '', '', '', 1);
  };

  const handleLoadMore = () => {
    const nextPage = currentPage + 1;
    setCurrentPage(nextPage);
    setIsLoadingMore(true);
    executeSearch(query, selectedGenre, selectedStatus, selectedType, selectedOrder, nextPage);
  };

  const handleAnimeClick = (anime: AnimeResult) => {
    navigate(`/details/${encodeURIComponent(anime.url)}?source=${anime.source}`);
  };

  const activeFiltersCount = [selectedGenre, selectedStatus, selectedType, selectedOrder].filter(Boolean).length;

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1440, margin: '0 auto', minHeight: '100%' }}>
      {/* Barra de Búsqueda y Switcher de Fuente */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 20,
        paddingBottom: 16, background: 'var(--bg-base)',
      }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          {/* Input principal */}
          <div style={{
            flex: 1, position: 'relative', display: 'flex', alignItems: 'center',
          }}>
            <Search
              size={18}
              style={{
                position: 'absolute', left: 16,
                color: isSearching ? 'var(--accent-primary)' : 'var(--text-muted)',
                transition: 'color var(--transition-fast)',
              }}
            />
            <input
              type="text"
              placeholder="Buscar por título (ej. Naruto, Solo Leveling, Demon Slayer)..."
              value={query}
              onChange={e => handleInput(e.target.value)}
              autoFocus
              style={{
                width: '100%', height: 48,
                paddingLeft: 46, paddingRight: 46,
                background: 'var(--bg-surface)',
                border: '1px solid var(--border-moderate)',
                borderRadius: 'var(--radius-lg)',
                color: 'var(--text-primary)',
                fontSize: 15, outline: 'none',
                transition: 'all var(--transition-fast)',
                boxShadow: 'var(--shadow-sm)',
              }}
            />
            {query && (
              <button
                onClick={() => handleInput('')}
                style={{
                  position: 'absolute', right: 14,
                  background: 'none', border: 'none',
                  color: 'var(--text-muted)', cursor: 'pointer', padding: 4,
                }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Selector de Fuente */}
          <div style={{ display: 'flex', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-lg)', padding: 4 }}>
            <button
              onClick={() => setActiveSource('jkanime')}
              style={{
                padding: '8px 14px', borderRadius: 'var(--radius-md)',
                border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                background: activeSource === 'jkanime' ? 'var(--accent-primary)' : 'transparent',
                color: activeSource === 'jkanime' ? 'white' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              JKAnime
            </button>
            <button
              onClick={() => setActiveSource('mundodonghua')}
              style={{
                padding: '8px 14px', borderRadius: 'var(--radius-md)',
                border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                background: activeSource === 'mundodonghua' ? 'var(--accent-secondary)' : 'transparent',
                color: activeSource === 'mundodonghua' ? 'white' : 'var(--text-secondary)',
                transition: 'all 0.15s ease',
              }}
            >
              MundoDonghua
            </button>
          </div>

          {/* Botón de alternar panel de filtros */}
          <button
            onClick={() => setShowFiltersPanel(!showFiltersPanel)}
            style={{
              height: 48, padding: '0 16px', borderRadius: 'var(--radius-lg)',
              background: activeFiltersCount > 0 ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-surface)',
              border: `1px solid ${activeFiltersCount > 0 ? 'var(--accent-primary)' : 'var(--border-moderate)'}`,
              color: activeFiltersCount > 0 ? 'var(--accent-primary)' : 'var(--text-primary)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
              fontSize: 13, fontWeight: 600,
            }}
          >
            <Filter size={16} />
            Filtros
            {activeFiltersCount > 0 && (
              <span style={{
                background: 'var(--accent-primary)', color: 'white',
                fontSize: 11, fontWeight: 800, width: 20, height: 20,
                borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {activeFiltersCount}
              </span>
            )}
          </button>
        </div>

        {/* Panel de Filtros Dinámicos */}
        <AnimatePresence>
          {showFiltersPanel && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              style={{
                overflow: 'hidden',
                background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg)', padding: '16px 20px', marginTop: 12,
                display: 'flex', flexDirection: 'column', gap: 14,
              }}
            >
              {/* Carrusel de Géneros Dinámicos */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                    Géneros {isLoadingGenres ? '(Cargando...)' : `(${genres.length})`}
                  </span>
                  {activeFiltersCount > 0 && (
                    <button
                      onClick={handleResetFilters}
                      style={{
                        background: 'none', border: 'none', color: '#f87171',
                        fontSize: 12, fontWeight: 600, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      <RotateCcw size={12} /> Limpiar filtros
                    </button>
                  )}
                </div>

                <div style={{
                  display: 'flex', flexWrap: 'wrap', gap: 6,
                  maxHeight: 120, overflowY: 'auto', paddingRight: 4,
                }}>
                  {genres.map((g) => {
                    const isSelected = selectedGenre === g.slug || selectedGenre.toLowerCase() === g.name.toLowerCase();
                    return (
                      <button
                        key={g.slug}
                        onClick={() => handleGenreToggle(g.slug)}
                        style={{
                          background: isSelected
                            ? 'var(--accent-primary)'
                            : 'var(--bg-elevated)',
                          border: `1px solid ${isSelected ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                          color: isSelected ? 'white' : 'var(--text-secondary)',
                          borderRadius: 'var(--radius-full)', padding: '4px 12px',
                          fontSize: 12, fontWeight: isSelected ? 700 : 500,
                          cursor: 'pointer', transition: 'all 0.15s ease',
                        }}
                      >
                        {isSelected && <Check size={11} style={{ display: 'inline', marginRight: 4 }} />}
                        {g.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Filtros de Tipo y Estado */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, borderTop: '1px solid var(--border-subtle)', paddingTop: 12 }}>
                {/* Tipo */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Tipo:</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[
                      { label: 'Todos', val: '' },
                      { label: 'Series', val: 'serie' },
                      { label: 'Películas', val: 'pelicula' },
                      { label: 'OVAs', val: 'ova' },
                    ].map(t => (
                      <button
                        key={t.val}
                        onClick={() => setSelectedType(t.val)}
                        style={{
                          background: selectedType === t.val ? 'var(--bg-overlay)' : 'transparent',
                          border: `1px solid ${selectedType === t.val ? 'var(--border-moderate)' : 'transparent'}`,
                          color: selectedType === t.val ? 'var(--text-primary)' : 'var(--text-muted)',
                          borderRadius: 'var(--radius-md)', padding: '3px 8px',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Estado */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Estado:</span>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {[
                      { label: 'Todos', val: '' },
                      { label: 'En emisión', val: 'emision' },
                      { label: 'Concluido', val: 'concluido' },
                    ].map(s => (
                      <button
                        key={s.val}
                        onClick={() => setSelectedStatus(s.val)}
                        style={{
                          background: selectedStatus === s.val ? 'var(--bg-overlay)' : 'transparent',
                          border: `1px solid ${selectedStatus === s.val ? 'var(--border-moderate)' : 'transparent'}`,
                          color: selectedStatus === s.val ? 'var(--text-primary)' : 'var(--text-muted)',
                          borderRadius: 'var(--radius-md)', padding: '3px 8px',
                          fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Orden */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Orden:</span>
                  <select
                    value={selectedOrder}
                    onChange={e => setSelectedOrder(e.target.value)}
                    style={{
                      background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                      borderRadius: 'var(--radius-md)', padding: '4px 10px',
                      color: 'var(--text-primary)', fontSize: 11, outline: 'none', cursor: 'pointer',
                    }}
                  >
                    <option value="">Por defecto</option>
                    <option value="recientes">Más recientes</option>
                    <option value="populares">Más populares</option>
                    <option value="alfabetico">A - Z</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Resultados */}
      {isSearching && searchResults.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '80px 0', color: 'var(--text-muted)', gap: 12,
        }}>
          <div style={{
            width: 40, height: 40, borderRadius: '50%',
            border: '3px solid var(--border-subtle)', borderTopColor: 'var(--accent-primary)',
            animation: 'spin-slow 0.8s linear infinite',
          }} />
          <p style={{ fontSize: 14 }}>Buscando animes...</p>
        </div>
      ) : searchResults.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          style={{
            textAlign: 'center', padding: '80px 24px',
            color: 'var(--text-muted)',
          }}
        >
          {query || activeFiltersCount > 0 ? (
            <>
              <SearchX size={52} style={{ margin: '0 auto 16px', opacity: 0.4 }} />
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                No se encontraron animes
              </p>
              <p style={{ fontSize: 13, maxWidth: 360, margin: '0 auto 16px' }}>
                Intenta con otros términos o limpia los filtros seleccionados.
              </p>
              <button
                onClick={handleResetFilters}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-md)', padding: '8px 18px',
                  color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
                }}
              >
                Limpiar filtros
              </button>
            </>
          ) : (
            <>
              <Film size={52} style={{ margin: '0 auto 16px', opacity: 0.3 }} />
              <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                Explora el catálogo
              </p>
              <p style={{ fontSize: 13 }}>
                Escribe un título arriba o selecciona un género para comenzar a explorar.
              </p>
            </>
          )}
        </motion.div>
      ) : (
        <div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            marginBottom: 16,
          }}>
            <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
              {searchResults.length} resultados encontrados
            </span>
          </div>

          <motion.div
            layout
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
              gap: 16,
            }}
          >
            {searchResults.map((anime, idx) => (
              <ResultCard
                key={`${anime.url}-${idx}`}
                anime={anime}
                onClick={() => handleAnimeClick(anime)}
              />
            ))}
          </motion.div>

          {/* Botón de Cargar Más */}
          {hasNextPage && (
            <div style={{ textAlign: 'center', marginTop: 32 }}>
              <button
                disabled={isLoadingMore}
                onClick={handleLoadMore}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-full)', padding: '12px 32px',
                  color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 700,
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                {isLoadingMore ? (
                  <>
                    <div style={{
                      width: 14, height: 14, borderRadius: '50%',
                      border: '2px solid var(--accent-primary)', borderTopColor: 'transparent',
                      animation: 'spin-slow 0.6s linear infinite',
                    }} />
                    Cargando más...
                  </>
                ) : (
                  'Cargar más animes'
                )}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
