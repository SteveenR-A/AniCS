import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Loader2, Film, SearchX, Filter,
  RotateCcw, ChevronDown, ChevronUp, Layers, Sparkles, Check, SlidersHorizontal
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

        {anime.animeType && (
          <span style={{
            position: 'absolute', top: 8, left: 8,
            background: 'rgba(10,11,15,0.75)', backdropFilter: 'blur(8px)',
            border: '1px solid var(--border-subtle)',
            color: 'white', fontSize: 10, fontWeight: 700,
            padding: '2px 7px', borderRadius: 'var(--radius-full)',
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
            fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 'var(--radius-full)',
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
            padding: '2px 7px', borderRadius: 'var(--radius-sm)',
          }}>
            Ep. {anime.episode}
          </span>
        )}
      </div>

      <div style={{ padding: '10px 12px' }}>
        <h4 style={{
          fontSize: 13, fontWeight: 700, lineHeight: 1.3,
          overflow: 'hidden', textOverflow: 'ellipsis',
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {anime.title}
        </h4>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, display: 'block' }}>
          {anime.source === 'jkanime' ? 'JKAnime' : 'MundoDonghua'}
        </span>
      </div>
    </motion.div>
  );
}

export function SearchPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    activeSource, setActiveSource, searchResults, setSearchResults,
    isSearching, setIsSearching, genres, loadGenres
  } = useAnimeStore();

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [selectedGenre, setSelectedGenre] = useState<string>(searchParams.get('genre') ?? '');
  const [selectedStatus, setSelectedStatus] = useState<string>(searchParams.get('status') ?? '');
  const [selectedType, setSelectedType] = useState<string>(searchParams.get('type') ?? '');
  const [selectedOrder, setSelectedOrder] = useState<string>(searchParams.get('order') ?? '');
  
  // Panel de filtros desplegable / ocultable (por defecto oculto para maximizar espacio de resultados)
  const [showFilters, setShowFilters] = useState(Boolean(searchParams.get('genre') || searchParams.get('status') || searchParams.get('type')));
  
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Contar cuántos filtros avanzados están activos
  const activeFilterCount = (selectedGenre ? 1 : 0) + (selectedStatus ? 1 : 0) + (selectedType ? 1 : 0) + (selectedOrder ? 1 : 0);

  // Inicializar fuente desde URL si está presente
  useEffect(() => {
    const urlSource = searchParams.get('source');
    if (urlSource && urlSource !== activeSource) {
      setActiveSource(urlSource);
    }
  }, [searchParams, activeSource, setActiveSource]);

  // Cargar géneros dinámicos para la fuente activa
  useEffect(() => {
    loadGenres(activeSource);
  }, [activeSource, loadGenres]);

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
          animeType: type || undefined,
          orderBy: order || undefined,
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
    }, 450);
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

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Barra de Búsqueda Superior */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{
          flex: 1, minWidth: 260, position: 'relative',
          background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
          borderRadius: 'var(--radius-full)', padding: '10px 18px',
          display: 'flex', alignItems: 'center', gap: 12,
          boxShadow: 'var(--shadow-subtle)',
        }}>
          <Search size={18} color="var(--text-muted)" />
          <input
            type="text"
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Buscar por título (ej. Naruto, Solo Leveling, Demon Slayer)..."
            style={{
              flex: 1, background: 'transparent', border: 'none',
              outline: 'none', color: 'var(--text-primary)', fontSize: 14,
            }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); executeSearch('', selectedGenre, selectedStatus, selectedType, selectedOrder, 1); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          )}
        </div>

        {/* Selector de Fuente */}
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
                padding: '8px 16px', borderRadius: 'var(--radius-full)',
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

        {/* Botón Desplegable de Filtros con Contador Activo */}
        <button
          onClick={() => setShowFilters(!showFilters)}
          style={{
            background: activeFilterCount > 0
              ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
              : showFilters ? 'var(--bg-elevated)' : 'var(--bg-surface)',
            border: `1px solid ${activeFilterCount > 0 ? 'transparent' : 'var(--border-subtle)'}`,
            borderRadius: 'var(--radius-full)', padding: '10px 18px',
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
      </div>

      {/* ─── Panel de Filtros Desplegable con Animación ─── */}
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
              borderRadius: 'var(--radius-xl)', padding: '16px 20px', marginBottom: 20,
              display: 'flex', flexDirection: 'column', gap: 14,
            }}
          >
            {/* Cabecera de filtros */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Géneros disponibles ({genres.length})
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

            {/* Chips de Géneros Dinámicos */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 6,
              maxHeight: 130, overflowY: 'auto', paddingRight: 4,
            }}>
              {genres.map((g) => {
                const isSelected = selectedGenre === g.slug || selectedGenre === g.name;
                return (
                  <button
                    key={g.slug}
                    onClick={() => handleGenreToggle(g.slug)}
                    style={{
                      padding: '5px 12px', borderRadius: 'var(--radius-full)',
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

            {/* Filtros Secundarios: Tipo, Estado y Orden */}
            <div style={{
              display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center',
              borderTop: '1px solid var(--border-subtle)', paddingTop: 12,
            }}>
              {/* Tipo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Tipo:</span>
                {['', 'serie', 'pelicula', 'ova'].map((t) => (
                  <button
                    key={t}
                    onClick={() => setSelectedType(t)}
                    style={{
                      padding: '4px 10px', borderRadius: 'var(--radius-md)',
                      background: selectedType === t ? 'var(--bg-elevated)' : 'transparent',
                      border: selectedType === t ? '1px solid var(--accent-primary)' : '1px solid transparent',
                      color: selectedType === t ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      fontSize: 11, fontWeight: selectedType === t ? 700 : 500, cursor: 'pointer',
                    }}
                  >
                    {t === '' ? 'Todos' : t === 'serie' ? 'Series' : t === 'pelicula' ? 'Películas' : 'OVAs'}
                  </button>
                ))}
              </div>

              {/* Estado */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Estado:</span>
                {['', 'en-emision', 'concluido'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setSelectedStatus(st)}
                    style={{
                      padding: '4px 10px', borderRadius: 'var(--radius-md)',
                      background: selectedStatus === st ? 'var(--bg-elevated)' : 'transparent',
                      border: selectedStatus === st ? '1px solid var(--accent-primary)' : '1px solid transparent',
                      color: selectedStatus === st ? 'var(--accent-primary)' : 'var(--text-secondary)',
                      fontSize: 11, fontWeight: selectedStatus === st ? 700 : 500, cursor: 'pointer',
                    }}
                  >
                    {st === '' ? 'Todos' : st === 'en-emision' ? 'En emisión' : 'Concluido'}
                  </button>
                ))}
              </div>

              {/* Orden */}
              <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>Orden:</span>
                <select
                  value={selectedOrder}
                  onChange={(e) => setSelectedOrder(e.target.value)}
                  style={{
                    background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)',
                    borderRadius: 'var(--radius-md)', padding: '4px 10px',
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

      {/* ─── Resultados de Búsqueda ─── */}
      {isSearching && searchResults.length === 0 ? (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '80px 0', flexDirection: 'column', gap: 14 }}>
          <Loader2 size={36} className="animate-spin" color="var(--accent-primary)" />
          <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Explorando catálogo...</p>
        </div>
      ) : searchResults.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <SearchX size={56} style={{ color: 'var(--text-muted)', margin: '0 auto 16px', opacity: 0.5 }} />
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
              borderRadius: 'var(--radius-md)', padding: '8px 20px',
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
            gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))',
            gap: 16,
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

          {/* Botón Cargar Más Páginas */}
          {hasNextPage && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 32 }}>
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-full)', padding: '10px 28px',
                  color: 'var(--text-primary)', fontSize: 13, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8,
                }}
              >
                {isLoadingMore ? <Loader2 size={16} className="animate-spin" /> : <ChevronDown size={16} />}
                {isLoadingMore ? 'Cargando más...' : 'Cargar más animes'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
