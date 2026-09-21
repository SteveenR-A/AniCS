import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Loader2, SearchX,
  RotateCcw, SlidersHorizontal, RefreshCw, Clock, Check,
  Sparkles, Flame, Film
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

const STATUS_OPTIONS = [
  { id: '', label: 'Todos' },
  { id: 'estreno', label: 'Estrenos' },
  { id: 'en-emision', label: 'En emisión' },
  { id: 'concluido', label: 'Concluidos' },
];

const TYPE_OPTIONS = [
  { id: '', label: 'Todos' },
  { id: 'anime', label: 'Anime' },
  { id: 'pelicula', label: 'Película' },
  { id: 'ova', label: 'OVA' },
  { id: 'especial', label: 'Especial' },
];

const CURRENT_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = Array.from({ length: CURRENT_YEAR - 1980 + 1 }, (_, i) => String(CURRENT_YEAR - i));

export function MobileSearchPage() {
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
  const urlYear = searchParams.get('year') ?? '';
  const urlOrder = searchParams.get('order') ?? '';

  const [query, setQuery] = useState(urlQ);
  const [selectedGenre, setSelectedGenre] = useState<string>(urlGenre);
  const [selectedStatus, setSelectedStatus] = useState<string>(urlStatus);
  const [selectedType, setSelectedType] = useState<string>(urlType);
  const [selectedYear, setSelectedYear] = useState<string>(urlYear);
  const [selectedOrder, setSelectedOrder] = useState<string>(urlOrder);
  const [currentPage, setCurrentPage] = useState<number>(urlPage);
  const [totalPages, setTotalPages] = useState<number | undefined>(undefined);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [showFilters, setShowFilters] = useState(Boolean(urlGenre || urlStatus || urlType || urlYear));

  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isInputFocusedRef = useRef(false);
  const isInitialMount = useRef(true);
  const searchRequestIdRef = useRef(0);
  const lastExecutedKey = useRef<string>('');
  const activeFilterCount = (selectedGenre ? 1 : 0) + (selectedStatus ? 1 : 0) + (selectedType ? 1 : 0) + (selectedYear ? 1 : 0) + (selectedOrder ? 1 : 0);

  useEffect(() => {
    loadGenres(activeSource);
  }, [activeSource, loadGenres]);

  const syncUrlParams = useCallback((
    newQ: string,
    newGenre: string,
    newStatus: string,
    newType: string,
    newYear: string,
    newOrder: string,
    newPage: number
  ) => {
    const params = new URLSearchParams();
    if (newQ.trim()) params.set('q', newQ.trim());
    if (newGenre) params.set('genre', newGenre);
    if (newStatus) params.set('status', newStatus);
    if (newType) params.set('type', newType);
    if (newYear) params.set('year', newYear);
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
    year: string,
    order: string,
    page: number = 1
  ) => {
    const currentSource = activeSource;
    const currentRequestId = ++searchRequestIdRef.current;
    setIsSearching(true);
    try {
      const filters: SearchFilters = {
        query: q.trim() || undefined,
        genre: genre || undefined,
        status: status || undefined,
        animeType: type || undefined,
        year: year || undefined,
        orderBy: order || undefined,
        page,
      };

      const res = await advancedSearch(filters, currentSource);

      // Si la fuente cambió o una petición posterior ya finalizó, descartar respuesta
      if (useAnimeStore.getState().activeSource !== currentSource || currentRequestId !== searchRequestIdRef.current) {
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
        year,
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
      if (useAnimeStore.getState().activeSource === currentSource && currentRequestId === searchRequestIdRef.current) {
        setSearchResults([], q, currentSource);
        setTotalPages(undefined);
        setHasNextPage(false);
      }
    } finally {
      if (useAnimeStore.getState().activeSource === currentSource && currentRequestId === searchRequestIdRef.current) {
        setIsSearching(false);
      }
    }
  }, [activeSource, setSearchResults, setIsSearching, saveSearchSession, addRecentSearch]);

  // Restaurar sesión o ejecutar búsqueda inicial
  useEffect(() => {
    const currentKey = `${activeSource}:${urlQ}:${urlGenre}:${urlStatus}:${urlType}:${urlYear}:${urlOrder}:${urlPage}`;
    if (lastExecutedKey.current === currentKey) {
      return;
    }
    lastExecutedKey.current = currentKey;

    const hasParams = Boolean(urlQ || urlGenre || urlStatus || urlType || urlYear || urlOrder || urlPage > 1);

    // Solo restaurar la sesión guardada en el primer montaje si no hay parámetros en la URL
    if (isInitialMount.current) {
      isInitialMount.current = false;
      const session = getSearchSession(activeSource);
      if (!hasParams && session && session.results.length > 0) {
        setQuery(session.query);
        setSelectedGenre(session.genre);
        setSelectedStatus(session.status);
        setSelectedType(session.animeType);
        setSelectedYear(session.year || '');
        setSelectedOrder(session.orderBy);
        setCurrentPage(session.currentPage);
        setTotalPages(session.totalPages);
        setHasNextPage(session.hasNextPage);
        setSearchResults(session.results, session.query, activeSource);
        syncUrlParams(session.query, session.genre, session.status, session.animeType, session.year || '', session.orderBy, session.currentPage);
        return;
      }
    }

    // Mientras el usuario esté escribiendo activamente, no sobreescribir el input
    if (!isInputFocusedRef.current && query !== urlQ) {
      setQuery(urlQ);
    }
    setSelectedGenre(urlGenre);
    setSelectedStatus(urlStatus);
    setSelectedType(urlType);
    setSelectedYear(urlYear);
    setSelectedOrder(urlOrder);
    setCurrentPage(urlPage);

    // Si no hay parámetros ni búsqueda, no disparar consultas pesadas innecesarias
    if (!urlQ && !urlGenre && !urlStatus && !urlType && !urlYear && !urlOrder) {
      setSearchResults([], '', activeSource);
      setTotalPages(undefined);
      setHasNextPage(false);
      return;
    }

    executeSearch(urlQ, urlGenre, urlStatus, urlType, urlYear, urlOrder, urlPage);
  }, [activeSource, urlQ, urlGenre, urlStatus, urlType, urlYear, urlOrder, urlPage, getSearchSession, setSearchResults, syncUrlParams, executeSearch, query]);

  const handleInput = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = val.trim();
    if (trimmed.length === 0) {
      // Limpieza inmediata sin saturar la red ni rellenar la barra
      const key = `${activeSource}::${selectedGenre}:${selectedStatus}:${selectedType}:${selectedYear}:${selectedOrder}:1`;
      lastExecutedKey.current = key;
      syncUrlParams('', selectedGenre, selectedStatus, selectedType, selectedYear, selectedOrder, 1);
      if (!selectedGenre && !selectedStatus && !selectedType && !selectedYear && !selectedOrder) {
        setSearchResults([], '', activeSource);
        setTotalPages(undefined);
        setHasNextPage(false);
      } else {
        executeSearch('', selectedGenre, selectedStatus, selectedType, selectedYear, selectedOrder, 1);
      }
      return;
    }

    // No disparar consultas automáticas con 1 solo carácter para evitar saturación de scrapers
    if (trimmed.length < 2) {
      return;
    }

    debounceRef.current = setTimeout(() => {
      const key = `${activeSource}:${val}:${selectedGenre}:${selectedStatus}:${selectedType}:${selectedYear}:${selectedOrder}:1`;
      lastExecutedKey.current = key;
      syncUrlParams(val, selectedGenre, selectedStatus, selectedType, selectedYear, selectedOrder, 1);
      executeSearch(val, selectedGenre, selectedStatus, selectedType, selectedYear, selectedOrder, 1);
    }, 1000);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const key = `${activeSource}:${query}:${selectedGenre}:${selectedStatus}:${selectedType}:${selectedYear}:${selectedOrder}:1`;
    lastExecutedKey.current = key;
    syncUrlParams(query, selectedGenre, selectedStatus, selectedType, selectedYear, selectedOrder, 1);
    executeSearch(query, selectedGenre, selectedStatus, selectedType, selectedYear, selectedOrder, 1);
  };

  const handleClearQuery = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery('');
    const key = `${activeSource}::${selectedGenre}:${selectedStatus}:${selectedType}:${selectedYear}:${selectedOrder}:1`;
    lastExecutedKey.current = key;
    syncUrlParams('', selectedGenre, selectedStatus, selectedType, selectedYear, selectedOrder, 1);
    if (!selectedGenre && !selectedStatus && !selectedType && !selectedYear && !selectedOrder) {
      setSearchResults([], '', activeSource);
      setTotalPages(undefined);
      setHasNextPage(false);
    } else {
      executeSearch('', selectedGenre, selectedStatus, selectedType, selectedYear, selectedOrder, 1);
    }
  };

  const handleGenreToggle = (slug: string, name?: string) => {
    const isCurrentlySelected =
      selectedGenre.toLowerCase() === slug.toLowerCase() ||
      (name ? selectedGenre.toLowerCase() === name.toLowerCase() : false);
    const nextGenre = isCurrentlySelected ? '' : slug;
    setSelectedGenre(nextGenre);
    const key = `${activeSource}:${query}:${nextGenre}:${selectedStatus}:${selectedType}:${selectedYear}:${selectedOrder}:1`;
    lastExecutedKey.current = key;
    syncUrlParams(query, nextGenre, selectedStatus, selectedType, selectedYear, selectedOrder, 1);
    executeSearch(query, nextGenre, selectedStatus, selectedType, selectedYear, selectedOrder, 1);
  };

  const handleYearChange = (yr: string) => {
    const nextYear = selectedYear === yr ? '' : yr;
    setSelectedYear(nextYear);
    const key = `${activeSource}:${query}:${selectedGenre}:${selectedStatus}:${selectedType}:${nextYear}:${selectedOrder}:1`;
    lastExecutedKey.current = key;
    syncUrlParams(query, selectedGenre, selectedStatus, selectedType, nextYear, selectedOrder, 1);
    executeSearch(query, selectedGenre, selectedStatus, selectedType, nextYear, selectedOrder, 1);
  };

  const handleResetFilters = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setQuery('');
    setSelectedGenre('');
    setSelectedStatus('');
    setSelectedType('');
    setSelectedYear('');
    setSelectedOrder('');
    setCurrentPage(1);
    const key = `${activeSource}:::::::1`;
    lastExecutedKey.current = key;
    syncUrlParams('', '', '', '', '', '', 1);
    saveSearchSession(activeSource, {
      query: '',
      genre: '',
      status: '',
      animeType: '',
      year: '',
      orderBy: '',
      results: [],
      currentPage: 1,
      totalPages: undefined,
      hasNextPage: false,
    });
    executeSearch('', '', '', '', '', '', 1);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    const key = `${activeSource}:${query}:${selectedGenre}:${selectedStatus}:${selectedType}:${selectedYear}:${selectedOrder}:${newPage}`;
    lastExecutedKey.current = key;
    syncUrlParams(query, selectedGenre, selectedStatus, selectedType, selectedYear, selectedOrder, newPage);
    executeSearch(query, selectedGenre, selectedStatus, selectedType, selectedYear, selectedOrder, newPage);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const mainEl = document.querySelector('main > div');
    if (mainEl) {
      mainEl.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <div style={{ padding: '12px 14px 24px' }}>
      {/* Barra de Búsqueda Móvil con Formulario y Submit Inmediato */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <form
          onSubmit={handleSearchSubmit}
          style={{
            flex: 1, display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-full)', padding: '8px 14px',
          }}
        >
          <button
            type="submit"
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
            title="Buscar"
          >
            <Search size={16} color="var(--text-muted)" />
          </button>
          <input
            type="text"
            enterKeyHint="search"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={query}
            onFocus={() => { isInputFocusedRef.current = true; }}
            onBlur={() => { isInputFocusedRef.current = false; }}
            onChange={(e) => handleInput(e.target.value)}
            placeholder="Buscar en catálogo..."
            style={{
              flex: 1, background: 'transparent', border: 'none',
              outline: 'none', color: 'var(--text-primary)', fontSize: 13,
            }}
          />
          {query && (
            <button
              type="button"
              onClick={handleClearQuery}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
              title="Borrar texto"
            >
              <X size={16} />
            </button>
          )}
        </form>

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
            executeSearch(query, selectedGenre, selectedStatus, selectedType, selectedYear, selectedOrder, currentPage);
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

      {/* Selector de Fuente Móvil */}
      <div style={{
        display: 'flex', background: 'var(--bg-surface)',
        padding: 3, borderRadius: 'var(--radius-full)',
        border: '1px solid var(--border-subtle)',
        gap: 2, marginBottom: 10,
      }}>
        {[
          { id: 'jkanime', label: 'JKAnime' },
          { id: 'animejl', label: 'Anime-JL' },
          { id: 'mundodonghua', label: 'Donghua' },
        ].map((src) => (
          <button
            key={src.id}
            onClick={() => {
              setActiveSource(src.id);
              syncUrlParams(query, selectedGenre, selectedStatus, selectedType, selectedYear, selectedOrder, 1);
              executeSearch(query, selectedGenre, selectedStatus, selectedType, selectedYear, selectedOrder, 1);
            }}
            style={{
              flex: 1, padding: '6px 8px', borderRadius: 'var(--radius-full)',
              background: activeSource === src.id ? 'var(--accent-primary)' : 'transparent',
              color: activeSource === src.id ? 'white' : 'var(--text-secondary)',
              border: 'none', fontSize: 11, fontWeight: 700, cursor: 'pointer',
              whiteSpace: 'nowrap', textAlign: 'center',
              transition: 'all 0.15s ease',
            }}
          >
            {src.label}
          </button>
        ))}
      </div>

      {/* Barra de Acceso Rápido / Categorías y Estrenos */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 12, overflowX: 'auto', paddingBottom: 2,
      }}>
        <button
          onClick={() => {
            setSelectedStatus('');
            setSelectedType('');
            setSelectedYear('');
            syncUrlParams(query, selectedGenre, '', '', '', selectedOrder, 1);
            executeSearch(query, selectedGenre, '', '', '', selectedOrder, 1);
          }}
          style={{
            padding: '5px 12px', borderRadius: 'var(--radius-full)',
            background: !selectedStatus && !selectedType && !selectedYear ? 'var(--accent-primary)' : 'var(--bg-surface)',
            color: !selectedStatus && !selectedType && !selectedYear ? '#ffffff' : 'var(--text-secondary)',
            border: `1px solid ${!selectedStatus && !selectedType && !selectedYear ? 'transparent' : 'var(--border-subtle)'}`,
            fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
            transition: 'all var(--transition-fast)',
          }}
        >
          Todos
        </button>

        <button
          onClick={() => {
            const nextStatus = selectedStatus === 'estreno' ? '' : 'estreno';
            setSelectedStatus(nextStatus);
            syncUrlParams(query, selectedGenre, nextStatus, selectedType, selectedYear, selectedOrder, 1);
            executeSearch(query, selectedGenre, nextStatus, selectedType, selectedYear, selectedOrder, 1);
          }}
          style={{
            padding: '5px 12px', borderRadius: 'var(--radius-full)',
            background: selectedStatus === 'estreno'
              ? 'linear-gradient(135deg, #f59e0b, #ef4444)'
              : 'var(--bg-surface)',
            color: selectedStatus === 'estreno' ? '#ffffff' : 'var(--text-secondary)',
            border: `1px solid ${selectedStatus === 'estreno' ? 'transparent' : 'var(--border-subtle)'}`,
            fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', gap: 5,
            boxShadow: selectedStatus === 'estreno' ? '0 2px 8px rgba(245, 158, 11, 0.4)' : 'none',
            transition: 'all var(--transition-fast)',
          }}
        >
          <Sparkles size={12} />
          <span>Estrenos</span>
        </button>

        <button
          onClick={() => {
            const nextStatus = selectedStatus === 'en-emision' ? '' : 'en-emision';
            setSelectedStatus(nextStatus);
            syncUrlParams(query, selectedGenre, nextStatus, selectedType, selectedYear, selectedOrder, 1);
            executeSearch(query, selectedGenre, nextStatus, selectedType, selectedYear, selectedOrder, 1);
          }}
          style={{
            padding: '5px 12px', borderRadius: 'var(--radius-full)',
            background: selectedStatus === 'en-emision'
              ? 'linear-gradient(135deg, #10b981, #059669)'
              : 'var(--bg-surface)',
            color: selectedStatus === 'en-emision' ? '#ffffff' : 'var(--text-secondary)',
            border: `1px solid ${selectedStatus === 'en-emision' ? 'transparent' : 'var(--border-subtle)'}`,
            fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', gap: 5,
            boxShadow: selectedStatus === 'en-emision' ? '0 2px 8px rgba(16, 185, 129, 0.4)' : 'none',
            transition: 'all var(--transition-fast)',
          }}
        >
          <Flame size={12} />
          <span>En Emisión</span>
        </button>

        <button
          onClick={() => {
            const nextType = selectedType === 'pelicula' ? '' : 'pelicula';
            setSelectedType(nextType);
            syncUrlParams(query, selectedGenre, selectedStatus, nextType, selectedYear, selectedOrder, 1);
            executeSearch(query, selectedGenre, selectedStatus, nextType, selectedYear, selectedOrder, 1);
          }}
          style={{
            padding: '5px 12px', borderRadius: 'var(--radius-full)',
            background: selectedType === 'pelicula'
              ? 'linear-gradient(135deg, #8b5cf6, #ec4899)'
              : 'var(--bg-surface)',
            color: selectedType === 'pelicula' ? '#ffffff' : 'var(--text-secondary)',
            border: `1px solid ${selectedType === 'pelicula' ? 'transparent' : 'var(--border-subtle)'}`,
            fontSize: 11, fontWeight: 700, cursor: 'pointer', flexShrink: 0,
            display: 'inline-flex', alignItems: 'center', gap: 5,
            boxShadow: selectedType === 'pelicula' ? '0 2px 8px rgba(139, 92, 246, 0.4)' : 'none',
            transition: 'all var(--transition-fast)',
          }}
        >
          <Film size={12} />
          <span>Películas</span>
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
                  syncUrlParams(term, selectedGenre, selectedStatus, selectedType, selectedYear, selectedOrder, 1);
                  executeSearch(term, selectedGenre, selectedStatus, selectedType, selectedYear, selectedOrder, 1);
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

      {/* Barra de Filtros Activos Móvil */}
      {activeFilterCount > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 600 }}>Filtros:</span>
          {selectedGenre && (
            <button
              type="button"
              onClick={() => handleGenreToggle(selectedGenre)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.35)',
                borderRadius: 'var(--radius-full)', padding: '3px 8px',
                color: 'var(--accent-primary)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <span>{genres.find(g => g.slug.toLowerCase() === selectedGenre.toLowerCase() || g.name.toLowerCase() === selectedGenre.toLowerCase())?.name || selectedGenre}</span>
              <X size={12} />
            </button>
          )}
          {selectedStatus && (
            <button
              type="button"
              onClick={() => {
                setSelectedStatus('');
                syncUrlParams(query, selectedGenre, '', selectedType, selectedYear, selectedOrder, 1);
                executeSearch(query, selectedGenre, '', selectedType, selectedYear, selectedOrder, 1);
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(245, 158, 11, 0.15)', border: '1px solid rgba(245, 158, 11, 0.35)',
                borderRadius: 'var(--radius-full)', padding: '3px 8px',
                color: '#f59e0b', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <span>{STATUS_OPTIONS.find(s => s.id === selectedStatus)?.label || selectedStatus}</span>
              <X size={12} />
            </button>
          )}
          {selectedType && (
            <button
              type="button"
              onClick={() => {
                setSelectedType('');
                syncUrlParams(query, selectedGenre, selectedStatus, '', selectedYear, selectedOrder, 1);
                executeSearch(query, selectedGenre, selectedStatus, '', selectedYear, selectedOrder, 1);
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.35)',
                borderRadius: 'var(--radius-full)', padding: '3px 8px',
                color: 'var(--accent-primary)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <span>{TYPE_OPTIONS.find(t => t.id === selectedType)?.label || selectedType}</span>
              <X size={12} />
            </button>
          )}
          {selectedYear && (
            <button
              type="button"
              onClick={() => handleYearChange('')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                background: 'rgba(99, 102, 241, 0.15)', border: '1px solid rgba(99, 102, 241, 0.35)',
                borderRadius: 'var(--radius-full)', padding: '3px 8px',
                color: 'var(--accent-primary)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
              }}
            >
              <span>Año: {selectedYear}</span>
              <X size={12} />
            </button>
          )}
          <button
            type="button"
            onClick={handleResetFilters}
            style={{
              background: 'none', border: 'none', color: 'var(--text-muted)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer', textDecoration: 'underline',
              padding: '2px 4px',
            }}
          >
            Limpiar
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
              display: 'flex', flexDirection: 'column', gap: 12,
            }}
          >
            {/* Header Filtros */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--text-primary)' }}>
                Filtros Avanzados
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

            {/* Filtro de Estado */}
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Estado
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {STATUS_OPTIONS.map((st) => {
                  const isSelected = selectedStatus === st.id;
                  return (
                    <button
                      key={st.id}
                      onClick={() => {
                        setSelectedStatus(st.id);
                        syncUrlParams(query, selectedGenre, st.id, selectedType, selectedYear, selectedOrder, 1);
                        executeSearch(query, selectedGenre, st.id, selectedType, selectedYear, selectedOrder, 1);
                      }}
                      style={{
                        padding: '4px 10px', borderRadius: 'var(--radius-full)',
                        background: isSelected ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                        border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        color: isSelected ? 'white' : 'var(--text-secondary)',
                        fontSize: 11, fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      {isSelected && <Check size={11} />}
                      {st.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filtro de Tipo */}
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Tipo
              </span>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {TYPE_OPTIONS.map((tp) => {
                  const isSelected = selectedType === tp.id;
                  return (
                    <button
                      key={tp.id}
                      onClick={() => {
                        setSelectedType(tp.id);
                        syncUrlParams(query, selectedGenre, selectedStatus, tp.id, selectedYear, selectedOrder, 1);
                        executeSearch(query, selectedGenre, selectedStatus, tp.id, selectedYear, selectedOrder, 1);
                      }}
                      style={{
                        padding: '4px 10px', borderRadius: 'var(--radius-full)',
                        background: isSelected ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                        border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        color: isSelected ? 'white' : 'var(--text-secondary)',
                        fontSize: 11, fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      {isSelected && <Check size={11} />}
                      {tp.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Filtro de Año */}
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Año
              </span>
              <select
                value={selectedYear}
                onChange={(e) => handleYearChange(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-elevated)',
                  border: `1px solid ${selectedYear ? 'var(--accent-primary)' : 'var(--border-subtle)'}`,
                  borderRadius: 'var(--radius-md)',
                  padding: '7px 12px',
                  color: selectedYear ? 'var(--accent-primary)' : 'var(--text-primary)',
                  fontSize: 12, fontWeight: 600, outline: 'none',
                }}
              >
                <option value="">Todos los años</option>
                {AVAILABLE_YEARS.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Filtro de Géneros */}
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', display: 'block', marginBottom: 6 }}>
                Géneros ({genres.length})
              </span>
              <div style={{
                display: 'flex', flexWrap: 'wrap', gap: 4,
                maxHeight: 120, overflowY: 'auto',
              }}>
                {genres.map((g) => {
                  const isSelected =
                    selectedGenre.toLowerCase() === g.slug.toLowerCase() ||
                    selectedGenre.toLowerCase() === g.name.toLowerCase();
                  return (
                    <button
                      key={g.slug}
                      onClick={() => handleGenreToggle(g.slug, g.name)}
                      style={{
                        padding: '4px 10px', borderRadius: 'var(--radius-full)',
                        background: isSelected ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                        border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        color: isSelected ? 'white' : 'var(--text-secondary)',
                        fontSize: 11, fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4,
                      }}
                    >
                      {isSelected && <Check size={11} />}
                      {g.name}
                    </button>
                  );
                })}
              </div>
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
