import type { PlaybackQualityOption } from '@/hooks/usePlaybackQuality';
import './QualitySelector.css';

interface Props {
  qualityLabel: string | null;
  options: PlaybackQualityOption[];
  selectedLevel: number;
  onSelect: (level: number) => void;
}

export function QualitySelector({ qualityLabel, options, selectedLevel, onSelect }: Props) {
  return (
    <div className="player-quality" data-interactive onClick={event => event.stopPropagation()}>
      <span aria-label="Resolución actual" title={qualityLabel ? 'Resolución del video' : 'Esperando metadatos del video'}>
        {qualityLabel ?? 'Pendiente'}
      </span>
      {options.length > 1 ? (
        <select
          aria-label="Calidad del video"
          title={`Calidad actual: ${qualityLabel ?? 'pendiente'}`}
          value={selectedLevel}
          onChange={event => onSelect(Number(event.target.value))}
        >
          <option value={-1}>Auto</option>
          {options.map(option => <option key={option.index} value={option.index}>{option.label}</option>)}
        </select>
      ) : null}
    </div>
  );
}
