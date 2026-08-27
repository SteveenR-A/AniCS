import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Clock, RefreshCw } from 'lucide-react';
import { getScheduleDays as getScheduleDaysFromApi } from '@/services/animeService';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { CachedImage } from '@/components/CachedImage';
import type { ScheduleDay, AnimeResult } from '@/types';

const DAYS_ORDER = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];

export function SchedulePage() {
  const navigate = useNavigate();
  const { activeSource, getScheduleDays, setScheduleDays } = useAnimeStore();

  const cachedDays = getScheduleDays(activeSource);
  const [scheduleDays, setLocalScheduleDays] = useState<ScheduleDay[]>(() => cachedDays ?? []);
  const [isLoading, setIsLoading] = useState<boolean>(!cachedDays || cachedDays.length === 0);
  const [selectedDay, setSelectedDay] = useState<string>('all');

  // Detectar día actual de la semana en español
  useEffect(() => {
    const dayIndex = new Date().getDay(); // 0 = Domingo, 1 = Lunes, ...
    const dayMap = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const todayName = dayMap[dayIndex];
    setSelectedDay(todayName);
  }, []);

  // Sincronizar con el store de RAM inmediatamente cuando cambia la fuente
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
      console.error('Failed to load schedule days', e);
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

  // Animes filtrados
  const displayedDays = useMemo(() => {
    if (selectedDay === 'all') {
      return scheduleDays;
    }
    return scheduleDays.filter((d) => d.day.toLowerCase().includes(selectedDay.toLowerCase()));
  }, [scheduleDays, selectedDay]);

  const totalAnimes = useMemo(() => {
    return scheduleDays.reduce((acc, curr) => acc + curr.animes.length, 0);
  }, [scheduleDays]);

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1300, margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 40, height: 40, borderRadius: 12,
            background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(99,102,241,0.3)',
          }}>
            <Calendar size={22} color="white" />
          </div>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>
              Horario de Emisión
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '2px 0 0' }}>
              {totalAnimes} series en emisión semanal · {activeSource === 'jkanime' ? 'JKAnime' : 'MundoDonghua'}
            </p>
          </div>
        </div>

        <button
          onClick={loadSchedule}
          disabled={isLoading}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
            borderRadius: 'var(--radius-md)', padding: '8px 14px',
            color: 'var(--text-primary)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
            display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          {isLoading ? 'Cargando...' : 'Actualizar'}
        </button>
      </div>

      {/* Selector de Días (Tabs Horizontales) */}
      <div style={{
        display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8,
        marginBottom: 24, scrollbarWidth: 'none',
      }}>
        <button
          onClick={() => setSelectedDay('all')}
          style={{
            padding: '8px 16px', borderRadius: 'var(--radius-full)',
            background: selectedDay === 'all'
              ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
              : 'var(--bg-surface)',
            color: selectedDay === 'all' ? 'white' : 'var(--text-secondary)',
            border: selectedDay === 'all' ? 'none' : '1px solid var(--border-subtle)',
            fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
            boxShadow: selectedDay === 'all' ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
          }}
        >
          📅 Toda la Semana
        </button>

        {DAYS_ORDER.map((day) => {
          const isActive = selectedDay.toLowerCase() === day.toLowerCase();
          const dayData = scheduleDays.find((d) => d.day.toLowerCase().includes(day.toLowerCase()));
          const count = dayData ? dayData.animes.length : 0;

          return (
            <button
              key={day}
              onClick={() => setSelectedDay(day)}
              style={{
                padding: '8px 16px', borderRadius: 'var(--radius-full)',
                background: isActive
                  ? 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))'
                  : 'var(--bg-surface)',
                color: isActive ? 'white' : 'var(--text-secondary)',
                border: isActive ? 'none' : '1px solid var(--border-subtle)',
                fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
                display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: isActive ? '0 2px 8px rgba(99,102,241,0.3)' : 'none',
              }}
            >
              <span>{day}</span>
              {count > 0 && (
                <span style={{
                  fontSize: 11, padding: '1px 6px', borderRadius: 'var(--radius-full)',
                  background: isActive ? 'rgba(255,255,255,0.25)' : 'var(--bg-elevated)',
                  color: isActive ? 'white' : 'var(--text-muted)',
                }}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Contenido / Listado */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 16 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-subtle)' }}>
              <div className="skeleton" style={{ paddingBottom: '140%' }} />
              <div style={{ padding: 12 }}>
                <div className="skeleton" style={{ height: 14, marginBottom: 6, borderRadius: 4 }} />
                <div className="skeleton" style={{ height: 10, width: '50%', borderRadius: 4 }} />
              </div>
            </div>
          ))}
        </div>
      ) : displayedDays.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '60px 20px',
          background: 'var(--bg-surface)', borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--border-subtle)',
        }}>
          <Clock size={48} style={{ color: 'var(--text-muted)', margin: '0 auto 12px', opacity: 0.5 }} />
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px' }}>No hay animes para este día</h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
            Intenta seleccionar otro día o actualizar la lista.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>
          {displayedDays.map((dayGroup) => (
            <div key={dayGroup.day}>
              {/* Título de Sección del Día */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 16, borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: 8,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: 'var(--accent-primary)',
                }} />
                <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  {dayGroup.day}
                </h2>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>
                  ({dayGroup.animes.length} animes)
                </span>
              </div>

              {/* Grid de Animes del Día */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 16,
              }}>
                {dayGroup.animes.map((anime) => (
                  <motion.div
                    key={anime.url}
                    whileHover={{ y: -4, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
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
                        fallbackIconSize={32}
                        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                      <div style={{
                        position: 'absolute', inset: 0,
                        background: 'linear-gradient(to top, rgba(10,11,15,0.9) 0%, transparent 50%)',
                      }} />
                      <div style={{
                        position: 'absolute', bottom: 8, left: 8, right: 8,
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <span style={{
                          background: 'rgba(10,11,15,0.8)', backdropFilter: 'blur(6px)',
                          color: '#a5b4fc', fontSize: 10, fontWeight: 700,
                          padding: '2px 6px', borderRadius: 'var(--radius-sm)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          <Clock size={10} /> En emisión
                        </span>
                      </div>
                    </div>

                    <div style={{ padding: '10px 12px' }}>
                      <h4 style={{
                        fontSize: 13, fontWeight: 700, lineHeight: 1.3,
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
