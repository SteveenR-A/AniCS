import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Clock, RefreshCw, Sparkles } from 'lucide-react';
import { getScheduleDays as getScheduleDaysFromApi } from '@/services/animeService';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { CachedImage } from '@/components/CachedImage';
import type { ScheduleDay, AnimeResult } from '@/types';

const DAYS_ORDER = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const EMPTY_SCHEDULE_DAYS: ScheduleDay[] = [];

export function DesktopSchedulePage() {
  const navigate = useNavigate();
  const activeSource = useAnimeStore((s) => s.activeSource);

  const [scheduleDays, setScheduleDays] = useState<ScheduleDay[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [selectedDay, setSelectedDay] = useState<string>('all');

  useEffect(() => {
    const dayIndex = new Date().getDay();
    const dayMap = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const todayName = dayMap[dayIndex];
    setSelectedDay(todayName);
  }, []);

  const loadSchedule = useCallback(async (targetSource: string) => {
    setIsLoading(true);
    setScheduleDays([]);
    try {
      const res = await getScheduleDaysFromApi(targetSource);

      if (useAnimeStore.getState().activeSource !== targetSource) {
        return;
      }

      const sanitized = res.map((day) => {
        const seen = new Set<string>();
        const uniqueAnimes = day.animes
          .map((a) => ({ ...a, source: targetSource }))
          .filter((a) => {
            const key = (a.url || a.title).toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
        return { ...day, animes: uniqueAnimes };
      });
      setScheduleDays(sanitized);
    } catch (e) {
      console.error('Failed to load schedule days in Desktop', e);
    } finally {
      if (useAnimeStore.getState().activeSource === targetSource) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadSchedule(activeSource);
  }, [activeSource, loadSchedule]);

  const isDonghua = activeSource === 'mundodonghua';

  const displayedDays = useMemo(() => {
    if (isDonghua || selectedDay === 'all') {
      return scheduleDays.map((day) => {
        const seen = new Set<string>();
        const unique = day.animes.filter((a) => {
          const key = (a.url || a.title).toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        return { ...day, animes: unique };
      });
    }

    const filtered = scheduleDays.filter((d) => d.day.toLowerCase().includes(selectedDay.toLowerCase()));
    return filtered.map((day) => {
      const seen = new Set<string>();
      const unique = day.animes.filter((a) => {
        const key = (a.url || a.title).toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { ...day, animes: unique };
    });
  }, [scheduleDays, selectedDay, isDonghua]);

  const totalAnimes = useMemo(() => {
    return displayedDays.reduce((acc, curr) => acc + curr.animes.length, 0);
  }, [displayedDays]);

  return (
    <div style={{ padding: '28px 36px', maxWidth: 1440, margin: '0 auto' }}>
      {/* Header Desktop */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 28, flexWrap: 'wrap', gap: 14,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 4px 14px rgba(99, 102, 241, 0.25)',
          }}>
            <Calendar size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', margin: 0 }}>
              {isDonghua ? 'Donghuas en Emisión' : 'Horario de Emisión Semanal'}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: '3px 0 0' }}>
              {totalAnimes} producciones en emisión oficial · {isDonghua ? 'MundoDonghua' : 'JKAnime'}
            </p>
          </div>
        </div>

        <button
          onClick={() => loadSchedule(activeSource)}
          disabled={isLoading}
          style={{
            background: 'var(--bg-surface)', border: '1px solid var(--border-moderate)',
            borderRadius: 'var(--radius-md)', padding: '10px 18px',
            color: 'var(--text-primary)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 600,
            boxShadow: 'var(--shadow-subtle)',
          }}
        >
          <RefreshCw size={14} style={{ animation: isLoading ? 'spin-slow 1s linear infinite' : 'none' }} />
          Actualizar {isDonghua ? 'donghuas' : 'horario'}
        </button>
      </div>

      {/* Selector de Días Desktop */}
      {!isDonghua ? (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 32 }}>
          <button
            onClick={() => setSelectedDay('all')}
            style={{
              padding: '8px 18px', borderRadius: 'var(--radius-full)',
              background: selectedDay === 'all' ? 'var(--accent-primary)' : 'var(--bg-surface)',
              color: selectedDay === 'all' ? 'white' : 'var(--text-secondary)',
              border: selectedDay === 'all' ? '1px solid var(--accent-primary)' : '1px solid var(--border-moderate)',
              fontWeight: selectedDay === 'all' ? 700 : 500, fontSize: 13, cursor: 'pointer',
              boxShadow: selectedDay === 'all' ? 'var(--shadow-glow)' : 'none',
              display: 'flex', alignItems: 'center', gap: 6,
            }}
          >
            <Calendar size={14} /> Toda la semana
          </button>

          {DAYS_ORDER.map((day) => {
            const isSelected = selectedDay === day;
            return (
              <button
                key={day}
                onClick={() => setSelectedDay(day)}
                style={{
                  padding: '8px 18px', borderRadius: 'var(--radius-full)',
                  background: isSelected ? 'var(--accent-primary)' : 'var(--bg-surface)',
                  color: isSelected ? 'white' : 'var(--text-secondary)',
                  border: isSelected ? '1px solid var(--accent-primary)' : '1px solid var(--border-moderate)',
                  fontWeight: isSelected ? 700 : 500, fontSize: 13, cursor: 'pointer',
                  boxShadow: isSelected ? 'var(--shadow-glow)' : 'none',
                }}
              >
                {day}
              </button>
            );
          })}
        </div>
      ) : (
        <div style={{ marginBottom: 24 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'var(--accent-primary-glow)', border: '1px solid var(--accent-primary)',
            borderRadius: 'var(--radius-full)', padding: '6px 18px',
            color: 'var(--text-primary)', fontSize: 13, fontWeight: 700,
          }}>
            <Sparkles size={14} color="var(--accent-primary)" />
            <span>Animación China en Emisión Continua</span>
          </div>
        </div>
      )}

      {/* Listado de Animes Desktop */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 18 }}>
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} style={{ borderRadius: 'var(--radius-lg)', overflow: 'hidden', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)' }}>
              <div className="skeleton" style={{ paddingBottom: '140%' }} />
              <div style={{ padding: 12 }}>
                <div className="skeleton" style={{ height: 16, marginBottom: 6, borderRadius: 4 }} />
                <div className="skeleton" style={{ height: 12, width: '50%', borderRadius: 4 }} />
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 36 }}>
          {displayedDays.map((dayGroup) => (
            <div key={dayGroup.day}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 16, borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: 8,
              }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: 'var(--accent-primary)',
                }} />
                <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'var(--text-primary)' }}>
                  {dayGroup.day}
                </h2>
                <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>
                  ({dayGroup.animes.length} animes)
                </span>
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 18,
              }}>
                {dayGroup.animes.map((anime, idx) => (
                  <motion.div
                    key={`${anime.source}-${anime.url}-${idx}`}
                    whileHover={{ y: -5, scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate(`/details/${encodeURIComponent(anime.url)}?source=${anime.source}`, { state: { anime } })}
                    style={{
                      background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)',
                      overflow: 'hidden', cursor: 'pointer',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex', flexDirection: 'column',
                      position: 'relative', boxShadow: 'var(--shadow-card)',
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
                        background: 'linear-gradient(to top, rgba(10,11,15,0.9) 0%, transparent 50%)',
                      }} />
                      <div style={{
                        position: 'absolute', bottom: 8, left: 8, right: 8,
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        <span style={{
                          background: 'rgba(10,11,15,0.85)', backdropFilter: 'blur(6px)',
                          color: '#a5b4fc', fontSize: 11, fontWeight: 700,
                          padding: '3px 8px', borderRadius: 'var(--radius-sm)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          display: 'flex', alignItems: 'center', gap: 4,
                        }}>
                          <Clock size={11} /> En emisión
                        </span>
                      </div>
                    </div>

                    <div style={{ padding: '12px 14px' }}>
                      <h4 style={{
                        fontSize: 13, fontWeight: 700, lineHeight: 1.35,
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
