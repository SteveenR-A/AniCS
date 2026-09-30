import { memo, useState } from 'react';
import type { FormEvent } from 'react';
import { ChevronDown, Server, Check, Plus, Crown } from 'lucide-react';
import type { PlaybackServer } from '@/hooks/usePlaybackServers';
import { isVipServer } from '@/utils/serverUtils';
import './ServerSelector.css';

interface Props {
  servers: PlaybackServer[];
  selectedUrl?: string;
  selectedName?: string;
  isOpen: boolean;
  isResolving: boolean;
  isPortrait?: boolean;
  onOpenChange: (open: boolean) => void;
  onRefresh: () => Promise<void>;
  onSelect: (server: PlaybackServer) => void;
  onAdd: (name: string, url: string) => Promise<void>;
}

export const ServerSelector = memo(function ServerSelector({
  servers, selectedUrl, selectedName, isOpen, isResolving,
  isPortrait = false, onOpenChange, onRefresh, onSelect, onAdd,
}: Props) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const toggleMenu = () => {
    onOpenChange(!isOpen);
    if (!isOpen) {
      setError('');
      void onRefresh().catch(() => setError('No se pudieron cargar los servidores guardados.'));
    }
  };

  const saveServer = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await onAdd(name, url);
      setName('');
      setUrl('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el servidor.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      data-interactive
      className="player-server-selector"
      onClick={event => event.stopPropagation()}
      onTouchStart={event => event.stopPropagation()}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          onOpenChange(false);
        }
      }}
    >
      <button
        type="button"
        className={`player-server-trigger ${isPortrait ? 'is-portrait' : ''}`}
        aria-label="Seleccionar servidor de video"
        aria-expanded={isOpen}
        aria-controls="playback-servers"
        onClick={toggleMenu}
      >
        <Server size={isPortrait ? 11 : 12} strokeWidth={1.75} />
        <span>{selectedName || 'Servidores'}</span>
        {selectedName && isVipServer(selectedName) && (
          <Crown size={isPortrait ? 9 : 10} color="#fbbf24" style={{ flexShrink: 0 }} />
        )}
        <ChevronDown size={isPortrait ? 10 : 11} strokeWidth={2} />
      </button>

      {isOpen && (
        <div id="playback-servers" className="player-server-menu">
          <div className="player-server-heading">
            <strong>Servidores</strong>
            <button type="button" onClick={() => onOpenChange(false)} aria-label="Cerrar selector de servidores">
              Cerrar
            </button>
          </div>

          {servers.length === 0 && <p>No hay servidores disponibles.</p>}
          {servers.map(server => (
            <button
              type="button"
              key={server.url}
              className="player-server-option"
              aria-pressed={selectedUrl === server.url}
              disabled={isResolving || !!server.unavailableReason}
              title={server.unavailableReason}
              onClick={() => {
                onSelect(server);
                onOpenChange(false);
              }}
            >
              <span>
                {server.name}
                {server.unavailableReason && <small>{server.unavailableReason}</small>}
              </span>
              {selectedUrl === server.url && <Check size={16} />}
            </button>
          ))}

          <form onSubmit={saveServer} className="player-server-form">
            <strong>Agregar servidor para este episodio</strong>
            <input
              aria-label="Nombre del servidor"
              placeholder="Nombre"
              required
              value={name}
              onChange={event => setName(event.target.value)}
            />
            <input
              aria-label="URL del servidor"
              placeholder="https://… (video o embed)"
              type="url"
              required
              value={url}
              onChange={event => setUrl(event.target.value)}
            />
            <small>MP4/HLS directo o embed compatible con la fuente actual.</small>
            <button type="submit" disabled={saving}>
              <Plus size={14} /> {saving ? 'Guardando…' : 'Guardar servidor'}
            </button>
            {error && <p role="alert" className="player-server-error">{error}</p>}
          </form>
        </div>
      )}
    </div>
  );
});
