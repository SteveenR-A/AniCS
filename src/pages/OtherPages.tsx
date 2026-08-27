import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Trash2, Film, Bookmark, BookmarkX, Download, Inbox, History } from 'lucide-react';
import { getHistory, clearHistory, getFavorites } from '@/services/storageService';
import type { HistoryEntry, AnimeResult } from '@/types';

export function HistoryPage() {
  const navigate = useNavigate();
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getHistory(100, 0).then(data => { setEntries(data); setIsLoading(false); });
  }, []);

  const handleClear = async () => {
    await clearHistory();
    setEntries([]);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <History size={22} color="var(--accent-primary)" />
          <h1 style={{ fontSize: 22, fontWeight: 800 }}>Historial de Reproducción</h1>
        </div>
        {entries.length > 0 && (
          <button
            onClick={handleClear}
            style={{
              background: 'transparent', border: '1px solid var(--border-moderate)',
              borderRadius: 'var(--radius-md)', padding: '6px 14px',
              color: 'var(--accent-error)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6, fontSize: 13,
            }}
          >
            <Trash2 size={14} /> Limpiar Historial
          </button>
        )}
      </div>

      {isLoading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 72, borderRadius: 'var(--radius-md)' }} />
          ))}
        </div>
      )}

      {!isLoading && entries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ padding: 20, borderRadius: 'var(--radius-xl)', background: 'var(--bg-surface)' }}>
              <History size={48} color="var(--text-muted)" />
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600 }}>Sin historial de reproducción</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>Los episodios que reproduzcas aparecerán listados aquí automáticamente</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {entries.map((entry, i) => (
          <motion.div
            key={entry.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.02 }}
            onClick={() => navigate(`/details/${encodeURIComponent(entry.animeUrl)}?source=${entry.source}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-md)',
              padding: '10px 14px', cursor: 'pointer',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ width: 50, height: 70, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--bg-elevated)' }}>
              {entry.thumbnailUrl
                ? <img src={entry.thumbnailUrl} alt={entry.animeTitle} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}><Film size={20} /></div>
              }
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontWeight: 600, fontSize: 14, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.animeTitle}
              </p>
              <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>Episodio {entry.episodeNumber}</p>
              <div style={{ height: 3, background: 'var(--bg-elevated)', borderRadius: 2, marginTop: 8 }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: `${(entry.watchProgress ?? 0) * 100}%`,
                  background: 'linear-gradient(90deg, var(--accent-primary), var(--accent-secondary))',
                }} />
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)', fontSize: 11, flexShrink: 0 }}>
              <Clock size={11} />
              {new Date(entry.watchedAt).toLocaleDateString('es', { day: 'numeric', month: 'short' })}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function FavoritesPage() {
  const navigate = useNavigate();
  const [favorites, setFavorites] = useState<AnimeResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    getFavorites().then(data => { setFavorites(data); setIsLoading(false); });
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Bookmark size={22} color="var(--accent-primary)" />
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Series Favoritas</h1>
      </div>

      {!isLoading && favorites.length === 0 && (
        <div style={{ textAlign: 'center', padding: '80px 20px' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
            <div style={{ padding: 20, borderRadius: 'var(--radius-xl)', background: 'var(--bg-surface)' }}>
              <BookmarkX size={48} color="var(--text-muted)" />
            </div>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600 }}>Sin favoritos guardados</p>
          <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>Guarda animes en favoritos desde la página de detalles para acceder rápidamente</p>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 16 }}>
        {favorites.map((anime, i) => (
          <motion.div
            key={anime.url}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.04 }}
            whileHover={{ y: -4 }}
            onClick={() => navigate(`/details/${encodeURIComponent(anime.url)}?source=${anime.source}`)}
            style={{
              background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
              overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--border-subtle)',
            }}
          >
            <div style={{ position: 'relative', paddingBottom: '140%', background: 'var(--bg-elevated)' }}>
              {anime.thumbnailUrl
                ? <img src={anime.thumbnailUrl} alt={anime.title} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                : <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}><Film size={32} /></div>
              }
            </div>
            <div style={{ padding: '8px 10px 10px' }}>
              <p style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {anime.title}
              </p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export function DownloadsPage() {
  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 24 }}>
        <Download size={22} color="var(--accent-secondary)" />
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Monitor de Descargas</h1>
      </div>
      <div style={{ textAlign: 'center', padding: '80px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}>
          <div style={{ padding: 20, borderRadius: 'var(--radius-xl)', background: 'var(--bg-surface)' }}>
            <Inbox size={48} color="var(--text-muted)" />
          </div>
        </div>
        <p style={{ color: 'var(--text-secondary)', fontSize: 16, fontWeight: 600 }}>No hay descargas en curso</p>
        <p style={{ color: 'var(--text-muted)', fontSize: 14, marginTop: 6 }}>Descarga episodios desde la vista de cualquier anime para verlos sin conexión</p>
      </div>
    </div>
  );
}
