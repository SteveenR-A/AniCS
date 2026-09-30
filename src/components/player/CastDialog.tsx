import { useCallback, useEffect, useRef, useState } from 'react';
import { Cast, Check, Loader2, Pause, Play, RefreshCw, Smartphone, Square, Volume2, X } from 'lucide-react';
import {
  castToDlnaDevice,
  controlDlnaPlayback,
  discoverDlnaDevices,
  getDlnaPlaybackState,
  controlGoogleCastPlayback,
  getGoogleCastStatus,
  isGoogleCastAvailable,
  openAndroidScreenCastSettings,
  requestGoogleCast,
  setDlnaVolume,
} from '@/services/castingService';
import type { DlnaDevice, DlnaPlaybackState } from '@/services/castingService';

interface Props {
  isMobile: boolean;
  title: string;
  streamUrl: string;
  localFilePath?: string;
  mediaType: 'hls' | 'mp4' | 'unknown';
  currentTime: number;
  isPlaying: boolean;
  onClose: () => void;
  onCast: () => void;
  onPositionChange: (position: number) => void;
}

const formatTime = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return `${Math.floor(safe / 3600).toString().padStart(2, '0')}:${Math.floor((safe % 3600) / 60).toString().padStart(2, '0')}:${(safe % 60).toString().padStart(2, '0')}`;
};

export function CastDialog({
  isMobile, title, streamUrl, localFilePath, mediaType, currentTime, isPlaying, onClose, onCast, onPositionChange,
}: Props) {
  const [devices, setDevices] = useState<DlnaDevice[]>([]);
  const [playback, setPlayback] = useState<DlnaPlaybackState | null>(null);
  const [isDiscovering, setIsDiscovering] = useState(false);
  const [isCasting, setIsCasting] = useState(false);
  const [castProtocol, setCastProtocol] = useState<'dlna' | 'google' | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [volume, setVolume] = useState(0.7);
  const [error, setError] = useState('');
  const requestRef = useRef(0);
  const googleCastStartedRef = useRef(false);
  const hasAndroidBridge = typeof window !== 'undefined' && !!(window as Window & { AndroidBridge?: { openScreenCastSettings?: () => void } }).AndroidBridge?.openScreenCastSettings;
  const hasGoogleCast = typeof window !== 'undefined' && isGoogleCastAvailable();

  const discover = useCallback(async () => {
    setIsDiscovering(true);
    setError('');
    const androidBridge = (window as Window & { AndroidBridge?: { setWifiMulticast: (enabled: boolean) => void } }).AndroidBridge;
    androidBridge?.setWifiMulticast(true);
    try {
      setDevices(await discoverDlnaDevices());
    } catch (reason) {
      setDevices([]);
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      androidBridge?.setWifiMulticast(false);
      setIsDiscovering(false);
    }
  }, []);

  useEffect(() => {
    void discover();
  }, [discover]);

  useEffect(() => {
    if (!isCasting) return;
    let disposed = false;
    const poll = async () => {
      const request = ++requestRef.current;
      try {
        if (castProtocol === 'google') {
          const state = getGoogleCastStatus();
          if (!disposed && state?.status === 'error') {
            setError(state.error || 'Google Cast no pudo iniciar la reproducción.');
            setIsCasting(false);
            setCastProtocol(null);
          } else if (!disposed && state?.status === 'connected') {
            setPlayback(state);
            onPositionChange(state.positionSeconds);
            if (!googleCastStartedRef.current) {
              googleCastStartedRef.current = true;
              onCast();
            }
          } else if (!disposed && state?.status !== 'connecting') {
            setPlayback(null);
            setIsCasting(false);
            setCastProtocol(null);
          }
          return;
        }
        const state = await getDlnaPlaybackState();
        if (!disposed && request === requestRef.current) {
          setPlayback(state);
          if (state) onPositionChange(state.positionSeconds);
          else setIsCasting(false);
        }
      } catch (reason) {
        if (!disposed) setError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), castProtocol === 'google' ? 1000 : 2500);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [castProtocol, isCasting, onPositionChange]);

  const cast = async (device: DlnaDevice) => {
    setIsBusy(true);
    setError('');
    try {
      await castToDlnaDevice({
        deviceId: device.id,
        streamUrl,
        localFilePath: localFilePath || null,
        title,
        mediaType,
        startPosition: currentTime,
        startPlaying: isPlaying,
      });
      setPlayback({ deviceName: device.name, transportState: isPlaying ? 'PLAYING' : 'PAUSED_PLAYBACK', positionSeconds: currentTime, durationSeconds: 0 });
      setCastProtocol('dlna');
      setIsCasting(true);
      onCast();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsBusy(false);
    }
  };

  const control = async (action: 'play' | 'pause' | 'seek' | 'stop', position?: number) => {
    setIsBusy(true);
    setError('');
    try {
      if (castProtocol === 'google') controlGoogleCastPlayback(action, position || 0);
      else await controlDlnaPlayback(action, position);
      if (action === 'stop') {
        setIsCasting(false);
        setCastProtocol(null);
        googleCastStartedRef.current = false;
        setPlayback(null);
      }
      if (action === 'seek' && position !== undefined) onPositionChange(position);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setIsBusy(false);
    }
  };

  const castWithGoogle = () => {
    setError('');
    setPlayback(null);
    setCastProtocol('google');
    setIsCasting(true);
    googleCastStartedRef.current = false;
    try {
      requestGoogleCast({ streamUrl, title, mediaType, startPosition: currentTime, startPlaying: isPlaying });
    } catch (reason) {
      setIsCasting(false);
      setCastProtocol(null);
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return (
    <div role="presentation" onClick={onClose} style={styles.backdrop}>
      <section
        data-interactive
        role="dialog"
        aria-modal="true"
        aria-labelledby="dlna-dialog-title"
        onClick={event => event.stopPropagation()}
        onPointerDown={event => event.stopPropagation()}
        style={{ ...styles.dialog, width: isMobile ? 'min(440px, calc(100vw - 28px))' : 440 }}
      >
        <header style={styles.header}>
          <div style={styles.titleWrap}>
            <span style={styles.castIcon}><Cast size={19} /></span>
            <div>
              <h2 id="dlna-dialog-title" style={styles.title}>Transmitir a TV</h2>
              <p style={styles.subtitle}>{playback ? `Conectado a ${playback.deviceName}` : castProtocol === 'google' ? 'Conectando con Google Cast…' : 'Dispositivos disponibles en tu red'}</p>
            </div>
          </div>
          <button type="button" aria-label="Cerrar" onClick={onClose} style={styles.iconButton}><X size={19} /></button>
        </header>

        {playback ? (
          <div style={styles.remote}>
            <div style={styles.nowPlaying}>
              <strong>{title}</strong>
              <span>{formatTime(playback.positionSeconds)}{playback.durationSeconds > 0 ? ` / ${formatTime(playback.durationSeconds)}` : ''}</span>
            </div>
            <div style={styles.remoteButtons}>
              <button type="button" disabled={isBusy} onClick={() => void control(playback.transportState === 'PLAYING' ? 'pause' : 'play')} style={styles.primaryButton}>
                {playback.transportState === 'PLAYING' ? <Pause size={18} fill="currentColor" /> : <Play size={18} fill="currentColor" />}
                {playback.transportState === 'PLAYING' ? 'Pausar' : 'Reproducir'}
              </button>
              <button type="button" disabled={isBusy} onClick={() => void control('seek', Math.max(0, playback.positionSeconds - 10))} style={styles.iconButton} aria-label="Retroceder 10 segundos">−10</button>
              <button type="button" disabled={isBusy} onClick={() => void control('seek', playback.positionSeconds + 10)} style={styles.iconButton} aria-label="Avanzar 10 segundos">+10</button>
              <button type="button" disabled={isBusy} onClick={() => void control('stop')} style={styles.iconButton} aria-label="Detener transmisión"><Square size={16} /></button>
            </div>
            {castProtocol === 'dlna' && <label style={styles.volume}>
              <Volume2 size={17} />
              <input type="range" min="0" max="1" step="0.05" value={volume} onChange={event => setVolume(Number(event.target.value))} onPointerUp={() => void setDlnaVolume(volume).catch(reason => setError(String(reason)))} />
            </label>}
            {castProtocol === 'google' && <button type="button" onClick={() => void control('stop')} style={{ ...styles.refreshButton, marginTop: 16 }}>Desconectar Google Cast</button>}
          </div>
        ) : (
          <div style={styles.deviceList}>
            {hasGoogleCast && <div style={styles.googleCast}>
              <div style={styles.systemCastText}>
                <strong>Google Cast</strong>
                <span>Busca y selecciona tu televisor compatible con Google Cast.</span>
              </div>
              <button type="button" disabled={isBusy || castProtocol === 'google'} onClick={castWithGoogle} style={styles.googleCastButton}>
                {castProtocol === 'google' ? <Loader2 size={16} className="animate-spin" /> : <Cast size={16} />}<span>Transmitir</span>
              </button>
            </div>}
            <div style={styles.listHeading}>
              <span>{devices.length ? `${devices.length} dispositivo${devices.length === 1 ? '' : 's'}` : 'Busca TVs compatibles en la misma red Wi-Fi.'}</span>
              <button type="button" disabled={isDiscovering} onClick={() => void discover()} style={styles.refreshButton}>
                {isDiscovering ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                Buscar
              </button>
            </div>
            {devices.map(device => (
              <button type="button" key={device.id} disabled={isBusy} onClick={() => void cast(device)} style={styles.device}>
                <span style={styles.deviceBadge}><Cast size={17} /></span>
                <span style={styles.deviceText}><strong>{device.name}</strong><small style={{ color: '#aaa9bb', fontSize: 11 }}>{device.model || device.address}</small></span>
                {isBusy ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} style={{ opacity: 0.55 }} />}
              </button>
            ))}
            {isDiscovering && devices.length === 0 && <div style={styles.empty}><Loader2 size={20} className="animate-spin" /> Buscando dispositivos…</div>}
            {hasAndroidBridge && (
              <div style={styles.systemCast}>
                <div style={styles.systemCastText}>
                  <strong>Duplicar con Smart View</strong>
                  <span>Inicia el video y abre Smart View desde el panel rápido de Samsung. El botón abre solo los ajustes Cast genéricos de Android.</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (!openAndroidScreenCastSettings()) setError('No se encontró la opción de transmisión del sistema en este dispositivo.');
                  }}
                  style={styles.systemCastButton}
                >
                  <Smartphone size={16} /> Ajustes Cast de Android
                </button>
              </div>
            )}
          </div>
        )}

        {error && <p role="alert" style={styles.error}>{error}</p>}
        <p style={styles.note}>{hasGoogleCast ? 'Google Cast requiere que el televisor pueda acceder a la URL del video. Los videos locales y algunos enlaces protegidos por cabeceras del sitio no se pueden enviar directamente.' : !hasAndroidBridge ? 'En PC AniCS usa DLNA/UPnP. Google Cast requiere una integración nativa; la opción de Android no aparece en esta versión.' : 'Se requiere un televisor con DLNA/UPnP y que esté conectado a la misma red local.'}</p>
      </section>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  backdrop: { position: 'absolute', inset: 0, zIndex: 80, background: 'rgba(0,0,0,.68)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14, backdropFilter: 'blur(6px)' },
  dialog: { maxHeight: 'min(680px, calc(100vh - 28px))', overflow: 'auto', background: '#171722', border: '1px solid rgba(255,255,255,.12)', borderRadius: 18, boxShadow: '0 24px 80px rgba(0,0,0,.55)', color: 'white', padding: 18 },
  header: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingBottom: 15, borderBottom: '1px solid rgba(255,255,255,.1)' },
  titleWrap: { display: 'flex', alignItems: 'center', gap: 12 }, castIcon: { width: 40, height: 40, borderRadius: 12, background: 'rgba(232,167,181,.15)', color: '#e8a7b5', display: 'grid', placeItems: 'center' },
  title: { margin: 0, fontSize: 16, fontWeight: 750 }, subtitle: { margin: '3px 0 0', fontSize: 12, color: '#aaa9bb' },
  iconButton: { minWidth: 36, height: 36, borderRadius: 10, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.06)', color: 'white', display: 'inline-flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer' },
  listHeading: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, color: '#aaa9bb', fontSize: 12, margin: '14px 0 8px' },
  refreshButton: { display: 'flex', alignItems: 'center', gap: 6, color: 'white', border: 0, background: 'transparent', cursor: 'pointer', fontWeight: 650 },
  deviceList: { minHeight: 120 }, device: { display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', padding: '11px 10px', borderRadius: 12, border: '1px solid rgba(255,255,255,.08)', background: 'rgba(255,255,255,.04)', color: 'white', cursor: 'pointer', marginTop: 7 },
  deviceBadge: { width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 10, background: 'rgba(255,255,255,.08)', color: '#e8a7b5' }, deviceText: { display: 'flex', flexDirection: 'column', flex: 1, minWidth: 0, gap: 3 },
  systemCast: { marginTop: 14, padding: 12, borderRadius: 12, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.035)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }, systemCastText: { display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }, systemCastButton: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 36, padding: '0 11px', borderRadius: 9, border: '1px solid rgba(232,167,181,.35)', color: '#f0c4ce', background: 'rgba(232,167,181,.1)', fontWeight: 700, cursor: 'pointer' },
  googleCast: { marginTop: 14, marginBottom: 12, padding: 12, borderRadius: 12, border: '1px solid rgba(232,167,181,.28)', background: 'rgba(232,167,181,.07)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }, googleCastButton: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 36, padding: '0 12px', borderRadius: 9, border: 0, color: '#241920', background: '#e8a7b5', fontWeight: 750, cursor: 'pointer' },
  empty: { height: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, color: '#aaa9bb', fontSize: 13 },
  remote: { padding: '16px 0 3px' }, nowPlaying: { display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 15 }, remoteButtons: { display: 'flex', alignItems: 'center', gap: 8 }, primaryButton: { flex: 1, height: 40, borderRadius: 11, border: 0, background: '#e8a7b5', color: '#241920', fontWeight: 750, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }, volume: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 17, color: '#aaa9bb' },
  error: { margin: '12px 0 0', padding: '9px 11px', borderRadius: 9, background: 'rgba(239,68,68,.13)', color: '#ffb4b4', fontSize: 12 }, note: { margin: '15px 0 0', fontSize: 11, lineHeight: 1.5, color: '#858497' },
};
