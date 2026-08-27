import { useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Loader2, Film, SearchX, Compass } from 'lucide-react';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { searchAnime } from '@/services/animeService';
import type { AnimeResult } from '@/types';

function ResultCard({ anime, onClick }: { anime: AnimeResult; onClick: () => void }) {
  const [imgError, setImgError] = useState(false);
  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -3 }}
      onClick={onClick}
      style={{
        background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
        overflow: 'hidden', cursor: 'pointer',
        border: '1px solid var(--border-subtle)',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ position: 'relative', paddingBottom: '140%', background: 'var(--bg-elevated)' }}>
        {anime.thumbnailUrl && !imgError ? (
          <img
            src={anime.thumbnailUrl} alt={anime.title}
            onError={() => setImgError(true)}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'linear-gradient(135deg, var(--bg-elevated), var(--bg-surface-2))',
            color: 'var(--text-muted)',
          }}>
            <Film size={32} />
          </div>
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(to top, rgba(10,11,15,0.85) 0%, transparent 50%)',
        }} />
        <div style={{
          position: 'absolute', bottom: 8, left: 8, right: 8,
          fontSize: 12, fontWeight: 600, color: 'white',
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {anime.title}
        </div>
      </div>
    </motion.div>
  );
}

export function SearchPage() {
  const navigate = useNavigate();
  const { activeSource, searchResults, setSearchResults, isSearching, setIsSearching } = useAnimeStore();
  const [query, setQuery] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const handleSearch = useCallback(async (q: string) => {
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const results = await searchAnime(q, activeSource);
      setSearchResults(results);
    } catch (e) {
      console.error(e);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [activeSource, setSearchResults, setIsSearching]);

  const handleInput = (val: string) => {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => handleSearch(val), 600);
  };

  const handleAnimeClick = (anime: AnimeResult) => {
    navigate(`/details/${encodeURIComponent(anime.url)}?source=${anime.source}`);
  };

  return (
    <div style={{ padding: '24px', maxWidth: 1400, margin: '0 auto' }}>
      {/* Search bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        paddingBottom: 20, background: 'var(--bg-base)',
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-moderate)',
          borderRadius: 'var(--radius-xl)', padding: '12px 20px',
          boxShadow: query ? 'var(--shadow-glow)' : 'none',
          transition: 'box-shadow var(--transition-base)',
        }}>
          {isSearching
            ? <Loader2 size={20} color="var(--accent-primary)" style={{ animation: 'spin-slow 1s linear infinite', flexShrink: 0 }} />
            : <Search size={20} color="var(--text-muted)" style={{ flexShrink: 0 }} />
          }
          <input
            type="text"
            placeholder="Buscar anime, donghua..."
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            autoFocus
            style={{
              flex: 1, background: 'transparent', border: 'none', outline: 'none',
              color: 'var(--text-primary)', fontSize: 16,
              fontFamily: 'inherit',
            }}
          />
          <AnimatePresence>
            {query && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={() => { setQuery(''); setSearchResults([]); }}
                style={{
                  background: 'var(--bg-elevated)', border: 'none',
                  borderRadius: '50%', width: 28, height: 28,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0,
                }}
              >
                <X size={14} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Resultados */}
      <AnimatePresence mode="wait">
        {!query && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              textAlign: 'center', padding: '80px 20px',
              color: 'var(--text-muted)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ padding: 20, borderRadius: 'var(--radius-xl)', background: 'var(--bg-surface)' }}>
                <Compass size={48} color="var(--accent-primary)" />
              </div>
            </div>
            <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Explora y busca títulos
            </p>
            <p style={{ fontSize: 14 }}>Escribe el nombre de un anime o serie para buscar</p>
          </motion.div>
        )}

        {query && !isSearching && searchResults.length === 0 && (
          <motion.div
            key="no-results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}
          >
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
              <div style={{ padding: 20, borderRadius: 'var(--radius-xl)', background: 'var(--bg-surface)' }}>
                <SearchX size={48} color="var(--text-muted)" />
              </div>
            </div>
            <p style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
              Sin resultados encontrados
            </p>
            <p style={{ fontSize: 14 }}>Prueba buscando con palabras clave diferentes o verifica la fuente</p>
          </motion.div>
        )}

        {searchResults.length > 0 && (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>
              {searchResults.length} resultado{searchResults.length !== 1 ? 's' : ''} para "{query}"
            </p>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
              gap: 14,
            }}>
              <AnimatePresence>
                {searchResults.map((anime, i) => (
                  <ResultCard
                    key={`${anime.url}-${i}`}
                    anime={anime}
                    onClick={() => handleAnimeClick(anime)}
                  />
                ))}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
