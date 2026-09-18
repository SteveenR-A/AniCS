import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DownloadCloud, X, Layers, ListFilter, CheckSquare, Check, Loader2 } from 'lucide-react';
import type { Episode } from '@/types';
import { getServers, resolveStream } from '@/services/animeService';
import { startDownload } from '@/services/downloadService';
import { useDownloadStore } from '@/stores/useDownloadStore';

interface BatchDownloadModalProps {
  isOpen: boolean;
  onClose: () => void;
  animeTitle: string;
  episodes: Episode[];
  source: string;
  onSuccessToast?: (msg: string) => void;
}

export const BatchDownloadModal: React.FC<BatchDownloadModalProps> = ({
  isOpen,
  onClose,
  animeTitle,
  episodes,
  source,
  onSuccessToast,
}) => {
  const [activeTab, setActiveTab] = useState<'unseen' | 'range' | 'manual'>('unseen');
  const [rangeFrom, setRangeFrom] = useState<number>(episodes[episodes.length - 1]?.number || 1);
  const [rangeTo, setRangeTo] = useState<number>(episodes[0]?.number || 1);
  const [selectedEpNumbers, setSelectedEpNumbers] = useState<Set<number>>(new Set());
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [enqueuedCount, setEnqueuedCount] = useState(0);

  // Episodios no vistos
  const unseenEpisodes = useMemo(() => {
    return episodes.filter(ep => !ep.watched && (!ep.watchProgress || ep.watchProgress < 0.85));
  }, [episodes]);

  // Episodios seleccionados según la pestaña activa
  const targetEpisodes = useMemo(() => {
    if (activeTab === 'unseen') {
      return unseenEpisodes;
    } else if (activeTab === 'range') {
      const min = Math.min(rangeFrom, rangeTo);
      const max = Math.max(rangeFrom, rangeTo);
      return episodes.filter(ep => ep.number >= min && ep.number <= max);
    } else {
      return episodes.filter(ep => selectedEpNumbers.has(ep.number));
    }
  }, [activeTab, unseenEpisodes, rangeFrom, rangeTo, episodes, selectedEpNumbers]);

  const toggleEp = (num: number) => {
    const next = new Set(selectedEpNumbers);
    if (next.has(num)) next.delete(num);
    else next.add(num);
    setSelectedEpNumbers(next);
  };

  const selectAll = () => {
    setSelectedEpNumbers(new Set(episodes.map(ep => ep.number)));
  };

  const clearAll = () => {
    setSelectedEpNumbers(new Set());
  };

  const handleStartBatch = async () => {
    if (targetEpisodes.length === 0 || isProcessing) return;

    setIsProcessing(true);
    let successCount = 0;
    const total = targetEpisodes.length;

    // Ordenar de menor a mayor número para descargar en orden cronológico
    const sorted = [...targetEpisodes].sort((a, b) => a.number - b.number);

    for (let i = 0; i < sorted.length; i++) {
      const ep = sorted[i];
      setProgressText(`Obteniendo enlaces: Cap. ${ep.number} (${i + 1}/${total})...`);

      try {
        const servers = await getServers(ep.url, source);
        if (servers && servers.length > 0) {
          let resolvedMedia = null;
          for (const srv of servers) {
            try {
              const res = await resolveStream(srv, source);
              if (res && res.directUrl) {
                resolvedMedia = res;
                break;
              }
            } catch {}
          }

          if (resolvedMedia && resolvedMedia.directUrl) {
            const downloadId = await startDownload({
              animeTitle,
              episodeNumber: ep.number,
              streamUrl: resolvedMedia.directUrl,
              referer: resolvedMedia.referer,
            });

            useDownloadStore.getState().addTask({
              id: downloadId,
              animeTitle,
              episodeNumber: ep.number,
              streamUrl: resolvedMedia.directUrl,
              outputPath: '',
              progress: 0,
              speedKbps: 0,
              downloadedBytes: 0,
              totalBytes: 0,
              status: 'downloading',
            });

            successCount++;
            setEnqueuedCount(successCount);
          }
        }
      } catch (err) {
        console.warn(`Error encolando descarga para Cap. ${ep.number}:`, err);
      }
    }

    setIsProcessing(false);
    onClose();
    if (onSuccessToast) {
      onSuccessToast(
        successCount > 0
          ? `Se encolaron ${successCount} de ${total} episodios para descarga`
          : 'No se pudieron obtener enlaces directos para los episodios seleccionados'
      );
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 16,
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget && !isProcessing) onClose();
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-moderate)',
            borderRadius: 'var(--radius-xl)',
            width: '100%',
            maxWidth: 540,
            maxHeight: '90vh',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div style={{
            padding: '18px 24px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 38,
                height: 38,
                borderRadius: 10,
                background: 'rgba(59, 130, 246, 0.15)',
                color: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <DownloadCloud size={20} />
              </div>
              <div>
                <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>Descarga por Lotes</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, margin: '2px 0 0' }}>
                  {animeTitle}
                </p>
              </div>
            </div>
            {!isProcessing && (
              <button
                onClick={onClose}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  padding: 6,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <X size={20} />
              </button>
            )}
          </div>

          {/* Modal Tabs */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            padding: '12px 20px 0',
            gap: 8,
          }}>
            <button
              onClick={() => !isProcessing && setActiveTab('unseen')}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: activeTab === 'unseen' ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                color: activeTab === 'unseen' ? 'white' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
            >
              <ListFilter size={14} />
              No Vistos ({unseenEpisodes.length})
            </button>

            <button
              onClick={() => !isProcessing && setActiveTab('range')}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: activeTab === 'range' ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                color: activeTab === 'range' ? 'white' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
            >
              <Layers size={14} />
              Por Rango
            </button>

            <button
              onClick={() => !isProcessing && setActiveTab('manual')}
              style={{
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: activeTab === 'manual' ? 'var(--accent-primary)' : 'var(--bg-elevated)',
                color: activeTab === 'manual' ? 'white' : 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: 12,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s ease',
              }}
            >
              <CheckSquare size={14} />
              Manual ({selectedEpNumbers.size})
            </button>
          </div>

          {/* Tab Content */}
          <div style={{ padding: '20px', flex: 1, overflowY: 'auto' }}>
            {activeTab === 'unseen' && (
              <div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                  Se descargarán automáticamente todos los episodios que aún no has marcado como vistos o cuyo progreso sea menor al 85%.
                </p>
                {unseenEpisodes.length === 0 ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '24px 16px',
                    background: 'var(--bg-elevated)',
                    borderRadius: 'var(--radius-lg)',
                    color: 'var(--text-muted)',
                    fontSize: 13,
                  }}>
                    <Check size={28} color="#10b981" style={{ margin: '0 auto 8px', display: 'block' }} />
                    ¡Ya has visto todos los episodios disponibles!
                  </div>
                ) : (
                  <div style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: 6,
                    maxHeight: 180,
                    overflowY: 'auto',
                    padding: 4,
                  }}>
                    {unseenEpisodes.map(ep => (
                      <span
                        key={ep.number}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          background: 'var(--bg-elevated)',
                          fontSize: 11,
                          fontWeight: 700,
                          color: 'var(--text-primary)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        Cap. {ep.number}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'range' && (
              <div>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
                  Selecciona el rango de números de episodio a encolar:
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Desde Cap.
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={episodes[0]?.number || 1000}
                      value={rangeFrom}
                      onChange={(e) => setRangeFrom(parseInt(e.target.value) || 1)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-moderate)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-primary)',
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4 }}>
                      Hasta Cap.
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={episodes[0]?.number || 1000}
                      value={rangeTo}
                      onChange={(e) => setRangeTo(parseInt(e.target.value) || 1)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-moderate)',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-primary)',
                        fontSize: 14,
                        fontWeight: 700,
                      }}
                    />
                  </div>
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  Total en rango: <strong style={{ color: 'var(--accent-primary)' }}>{targetEpisodes.length} capítulos</strong>
                </div>
              </div>
            )}

            {activeTab === 'manual' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Seleccionados: <strong style={{ color: 'var(--accent-primary)' }}>{selectedEpNumbers.size}</strong> de {episodes.length}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={selectAll}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--accent-primary)',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Todos
                    </button>
                    <span style={{ color: 'var(--border-moderate)' }}>|</span>
                    <button
                      onClick={clearAll}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-muted)',
                        fontSize: 12,
                        fontWeight: 700,
                        cursor: 'pointer',
                        padding: 0,
                      }}
                    >
                      Limpiar
                    </button>
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(64px, 1fr))',
                  gap: 6,
                  maxHeight: 200,
                  overflowY: 'auto',
                  padding: 2,
                }}>
                  {episodes.map(ep => {
                    const isSel = selectedEpNumbers.has(ep.number);
                    return (
                      <button
                        key={ep.number}
                        onClick={() => toggleEp(ep.number)}
                        style={{
                          padding: '6px 4px',
                          borderRadius: 'var(--radius-sm)',
                          border: isSel ? '1px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                          background: isSel ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-elevated)',
                          color: isSel ? 'var(--accent-primary)' : 'var(--text-secondary)',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 4,
                          transition: 'all 0.1s ease',
                        }}
                      >
                        {isSel && <Check size={10} />}
                        {ep.number}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {isProcessing && (
              <div style={{
                marginTop: 16,
                padding: '12px 16px',
                background: 'rgba(59, 130, 246, 0.1)',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}>
                <Loader2 size={18} color="var(--accent-primary)" style={{ animation: 'spin 1s linear infinite' }} />
                <span style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 600 }}>
                  {progressText}
                </span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{
            padding: '16px 20px',
            borderTop: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            background: 'var(--bg-surface)',
          }}>
            <button
              onClick={onClose}
              disabled={isProcessing}
              style={{
                padding: '9px 18px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-moderate)',
                background: 'transparent',
                color: 'var(--text-secondary)',
                fontWeight: 700,
                fontSize: 13,
                cursor: isProcessing ? 'not-allowed' : 'pointer',
                opacity: isProcessing ? 0.5 : 1,
              }}
            >
              Cancelar
            </button>

            <button
              onClick={handleStartBatch}
              disabled={targetEpisodes.length === 0 || isProcessing}
              style={{
                padding: '9px 20px',
                borderRadius: 'var(--radius-md)',
                border: 'none',
                background: 'var(--accent-primary)',
                color: 'white',
                fontWeight: 700,
                fontSize: 13,
                cursor: targetEpisodes.length === 0 || isProcessing ? 'not-allowed' : 'pointer',
                opacity: targetEpisodes.length === 0 || isProcessing ? 0.5 : 1,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                boxShadow: 'var(--shadow-btn)',
              }}
            >
              {isProcessing ? (
                <>
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                  Encolando ({enqueuedCount}/{targetEpisodes.length})...
                </>
              ) : (
                <>
                  <DownloadCloud size={16} />
                  Encolar {targetEpisodes.length} {targetEpisodes.length === 1 ? 'capítulo' : 'capítulos'}
                </>
              )}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
