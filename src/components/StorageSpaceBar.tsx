import React, { useEffect, useState, useCallback } from 'react';
import { HardDrive, RefreshCw } from 'lucide-react';
import type { StorageSpaceInfo } from '@/types';
import { getStorageSpaceInfo } from '@/services/storageService';

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export const StorageSpaceBar: React.FC<{ style?: React.CSSProperties }> = ({ style }) => {
  const [info, setInfo] = useState<StorageSpaceInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchInfo = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getStorageSpaceInfo();
      setInfo(data);
    } catch (e) {
      console.warn('Error fetching storage space info:', e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInfo();
  }, [fetchInfo]);

  if (!info || info.totalBytes === 0) {
    return null;
  }

  const { downloadsBytes, availableBytes, totalBytes } = info;
  const anicsPercent = Math.min(100, Math.max(0.5, (downloadsBytes / totalBytes) * 100));
  const otherUsedBytes = Math.max(0, totalBytes - availableBytes - downloadsBytes);
  const otherPercent = Math.min(100 - anicsPercent, Math.max(0, (otherUsedBytes / totalBytes) * 100));
  const freePercent = Math.max(0, 100 - anicsPercent - otherPercent);

  return (
    <div
      style={{
        background: 'var(--bg-surface)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 18px',
        marginBottom: 20,
        boxShadow: 'var(--shadow-card)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <HardDrive size={16} color="var(--accent-primary)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>
            Almacenamiento del Dispositivo
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{formatBytes(availableBytes)}</strong> libres de {formatBytes(totalBytes)}
          </span>
          <button
            onClick={fetchInfo}
            disabled={isLoading}
            title="Actualizar espacio de almacenamiento"
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              padding: 4,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <RefreshCw size={13} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
          </button>
        </div>
      </div>

      {/* Segmented Bar */}
      <div
        style={{
          height: 8,
          background: 'var(--bg-elevated)',
          borderRadius: 4,
          overflow: 'hidden',
          display: 'flex',
          gap: 2,
        }}
      >
        {/* AniCS Downloads */}
        <div
          title={`AniCS: ${formatBytes(downloadsBytes)} (${anicsPercent.toFixed(1)}%)`}
          style={{
            width: `${anicsPercent}%`,
            background: 'var(--accent-primary)',
            borderRadius: 4,
            transition: 'width 0.3s ease',
          }}
        />

        {/* Other Used Space */}
        <div
          title={`Otras aplicaciones y sistema: ${formatBytes(otherUsedBytes)}`}
          style={{
            width: `${otherPercent}%`,
            background: 'rgba(255,255,255,0.15)',
            borderRadius: 4,
            transition: 'width 0.3s ease',
          }}
        />

        {/* Free Space */}
        <div
          title={`Espacio libre: ${formatBytes(availableBytes)}`}
          style={{
            width: `${freePercent}%`,
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 4,
          }}
        />
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, fontSize: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: 'var(--accent-primary)' }} />
          <span style={{ color: 'var(--text-secondary)' }}>
            AniCS: <strong>{formatBytes(downloadsBytes)}</strong>
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(255,255,255,0.2)' }} />
          <span style={{ color: 'var(--text-muted)' }}>
            Otros: {formatBytes(otherUsedBytes)}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }} />
          <span style={{ color: 'var(--text-muted)' }}>
            Libre: {formatBytes(availableBytes)}
          </span>
        </div>
      </div>
    </div>
  );
};
