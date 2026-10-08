import { memo } from 'react';
import { ChevronDown, Server, Check, Crown } from 'lucide-react';
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
  onRefresh?: () => Promise<void>;
  onSelect: (server: PlaybackServer) => void;
  onAdd?: (name: string, url: string) => Promise<void>;
}

export const ServerSelector = memo(function ServerSelector({
  servers, selectedUrl, selectedName, isOpen, isResolving,
  isPortrait = false, onOpenChange, onRefresh, onSelect,
}: Props) {
  const toggleMenu = () => {
    onOpenChange(!isOpen);
    if (!isOpen && onRefresh) {
      void onRefresh().catch(() => {});
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
        </div>
      )}
    </div>
  );
});
