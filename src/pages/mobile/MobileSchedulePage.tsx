import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Clock, RefreshCw } from 'lucide-react';
import { getScheduleDays as getScheduleDaysFromApi } from '@/services/animeService';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { CachedImage } from '@/components/CachedImage';
import type { ScheduleDay, AnimeResult } from '@/types';

const DAYS_ORDER = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function MobileSchedulePage() {
  const navigate = useNavigate();
  const { activeSource, getScheduleDays, setScheduleDays } = useAnimeStore();

  const cachedDays = getScheduleDays(activeSource);
  const [scheduleDays, setLocalScheduleDays] = useState<ScheduleDay[]>(() => cachedDays ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(!cachedDays || cachedDays.length === 0);
  const [selectedDay, setSelectedDay] = useState<string>('all');

  useEffect(() => {
    const dayIndex = new Date().getDay();
    const dayMap = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const todayName = dayMap[dayIndex];
    setSelectedDay(todayName);
  }, []);

  useEffect(() => {
    const fresh = getScheduleDays(activeSource);
    if (fresh && fresh.length > 0) {
      setLocalScheduleDays(fresh);
      setIsLoading(false);
    } else {
      setLocalScheduleDays([]);
      setIsLoading(true);
    }
  }, [activeSource, getScheduleDays]);

  const loadSchedule = useCallback(async () => {
    try {
      const cached = getScheduleDays(activeSource);
      if (!cached || cached.length === 0) {
        setIsLoading(true);
      }
      const res = await getScheduleDaysFromApi(activeSource);
      setScheduleDays(res, activeSource);
      setLocalScheduleDays(res);
    } catch (e) {
      console.error('Failed to load schedule days in Mobile', e);
    } finally {
      setIsLoading(false);
    }
  }, [activeSource, getScheduleDays, setScheduleDays]);

  useEffect(() => {
    const cached = getScheduleDays(activeSource);
    if (!cached || cached.length === 0) {
      setIsLoading(true);
      loadSchedule();
    }
  }, [activeSource, getScheduleDays, loadSchedule]);

  const displayedDays = useMemo(() => {
    if (selectedDay === 'all') {
      return scheduleDays;
    }
    return scheduleDays.filter((d) => d.day.toLowerCase().includes(selectedDay.toLowerCase()));
  }, [scheduleDays, selectedDay]);

  return (
    <div style={{ padding: '12px 14px 24px' }}>
      {/* Header Móvil */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 14,
      }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
            Horario Semanal
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: 11, margin: '2px 0 0' }}>
            {activeSource === 'jkanime' ? 'Estrenos semanales Anime' : 'Estrenos semanales Donghua'}
          </p>
        </div>

        <button
          onClick={loadSchedule}
          disabled={isLoading}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
            borderRadius: 'var(--radius-full)', padding: '6px 12px',
            color: 'var(--text-secondary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 600,
          }}
        >
          <RefreshCw size={12} style={{ animation: isLoading ? 'spin-slow 1s linear infinite' : 'none' }} />
          Actualizar
        </button>
      </div>

      {/* Tabs de Días con Scroll Horizontal Táctil */}
      <div style={{
        display: 'flex', gap: 6,
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        marginBottom: 16,
        paddingBottom: 4,
        scrollbarWidth: 'none',
      }}>
        <button
          onClick={() => setSelectedDay('all')}
          style={{
            padding: '5px 12px', borderRadius: 'var(--radius-full)',
            background: selectedDay === 'all' ? 'var(--accent-primary)' : 'var(--bg-surface)',
            color: selectedDay === 'all' ? 'white' : 'var(--text-secondary)',
            border: selectedDay === 'all' ? '1px solid var(--accent-primary)' : '1px solid var(--border-moderate)',
            fontWeight: selectedDay === 'all' ? 700 : 500, fontSize: 11, cursor: 'pointer',
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          Toda la semana
        </button>

        {DAYS_ORDER.map((day) => {
          const isSelected = selectedDay === day;
          return (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              style={{
                padding: '5px 12px', borderRadius: 'var(--radius-full)',
                background: isSelected ? 'var(--accent-primary)' : 'var(--bg-surface)',
                color: isSelected ? 'white' : 'var(--text-secondary)',
                border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-moderate)',
                fontWeight: isSelected ? 700 : 500, fontSize: 11, cursor: 'pointer',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}
            >
              {day}
            </button>
          );
        })}
      </div>

      {/* Listado de Animes en 2 Columnas */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
              <div className="skeleton" style={{ paddingBottom: '140%' }} />
              <div style={{ padding: 10 }}>
                <div className="skeleton" style={{ height: 12, marginBottom: 6, borderRadius: 4 }} />
                <div className="skeleton" style={{ height: 10, width: '50%', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      ) : displayedDays.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '40px 16px',
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-subtle)',
        }}>
          <Clock size={36} style={{ color: 'var(--text-muted)', margin: '0 auto 8px', opacity: 0.5 }} />
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            No hay animes para este día.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {displayedDays.map((dayGroup) => (
            <div key={dayGroup.day}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                marginBottom: 10, borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: 6,
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: 'var(--accent-primary)',
                }} />
                <h3 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  {dayGroup.day}
                </h3>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  ({dayGroup.animes.length})
                </span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 10,
              }}>
                {dayGroup.animes.map((anime) => (
                  <motion.div
                    key={anime.url}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => navigate(`/details/${encodeURIComponent(anime.url)}?source=${anime.source}`, { state: { anime } })}
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
                        background: 'linear-gradient(to top, rgba(10,11,15,0.9) 0%, transparent 50%)',
                      }} />
                    </div>

                    <div style={{ padding: '8px 10px 10px' }}>
                      <h4 style={{
                        fontSize: 12, fontWeight: 700, lineHeight: 1.25,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                        margin: 0,
                      }}>
                        {anime.title}
                      </h4>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
