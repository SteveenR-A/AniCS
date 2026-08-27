import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Loader2, SearchX,
  RotateCcw, ChevronDown, ChevronUp, Check, SlidersHorizontal
} from 'lucide-react';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { searchAnime, advancedSearch } from '@/services/animeService';
import { CachedImage } from '@/components/CachedImage';
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
    isSearching, setIsSearching, genres, loadGenres
  } = useAnimeStore();

  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const [selectedGenre, setSelectedGenre] = useState<string>(searchParams.get('genre') ?? '');
  const [selectedStatus, setSelectedStatus] = useState<string>(searchParams.get('status') ?? '');
  const [selectedType, setSelectedType] = useState<string>(searchParams.get('type') ?? '');
  const [selectedOrder, setSelectedOrder] = useState<string>(searchParams.get('order') ?? '');
  const [showFilters, setShowFilters] = useState(Boolean(searchParams.get('genre') || searchParams.get('status') || searchParams.get('type')));
  
  const [currentPage, setCurrentPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const activeFilterCount = (selectedGenre ? 1 : 0) + (selectedStatus ? 1 : 0) + (selectedType ? 1 : 0) + (selectedOrder ? 1 : 0);

  useEffect(() => {
    loadGenres(activeSource);
  }, [activeSource, loadGenres]);

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

  useEffect(() => {
    const genreParam = searchParams.get('genre') ?? '';
    const qParam = searchParams.get('q') ?? '';
    if (genreParam !== selectedGenre) setSelectedGenre(genreParam);
    if (qParam !== query) setQuery(qParam);

    if (searchResults.length > 0 && query === qParam && selectedGenre === genreParam) {
      return;
    }

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
              onClick={() => { setQuery(''); executeSearch('', selectedGenre, selectedStatus, selectedType, selectedOrder, 1); }}
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
      </div>

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

          {hasNextPage && (
            <div style={{ display: 'flex', justifyContent: 'center', marginTop: 20 }}>
              <button
                onClick={handleLoadMore}
                disabled={isLoadingMore}
                style={{
                  background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
                  borderRadius: 'var(--radius-full)', padding: '8px 20px',
                  color: 'var(--text-primary)', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                }}
              >
                {isLoadingMore ? <Loader2 size={14} className="animate-spin" /> : <ChevronDown size={14} />}
                {isLoadingMore ? 'Cargando...' : 'Cargar más'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
