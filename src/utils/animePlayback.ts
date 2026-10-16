import type { AnimeDetails, Episode, HistoryEntry } from '@/types';
import { localAnimeTitlesMatch } from './localAnimeTitles';

export const EPISODE_COMPLETION_PROGRESS = 0.9;
const normalizedUrl = (url: string) => url.trim().replace(/\/+$/, '');

export function animeHistory(details: AnimeDetails, history: HistoryEntry[], profileId = 'default'): HistoryEntry[] {
  const episodeUrls = new Set(details.episodes.map(episode => normalizedUrl(episode.url)).filter(Boolean));
  return history.filter(entry => (entry.profileId || 'default') === profileId && (
    (entry.animeUrl && normalizedUrl(entry.animeUrl) === normalizedUrl(details.url)) ||
    (entry.episodeUrl && episodeUrls.has(normalizedUrl(entry.episodeUrl))) ||
    localAnimeTitlesMatch(entry.animeTitle, details.title)
  )).sort((a, b) => (Date.parse(b.watchedAt) || 0) - (Date.parse(a.watchedAt) || 0) || b.episodeNumber - a.episodeNumber);
}

export function animeHistoryProgress(history: HistoryEntry[]): Map<number, number> {
  const progress = new Map<number, number>();
  for (const entry of history) {
    if (!progress.has(entry.episodeNumber)) progress.set(entry.episodeNumber, entry.watchProgress);
  }
  return progress;
}

export interface AnimePlaybackAction { episode: Episode; label: string }

/** Select the last watched episode, or the next available unwatched one after completion. */
export function animePlaybackAction(details: AnimeDetails, history: HistoryEntry[], profileId = 'default'): AnimePlaybackAction | null {
  const episodes = [...details.episodes].sort((a, b) => a.number - b.number);
  if (!episodes.length) return null;
  const rows = animeHistory(details, history, profileId);
  const last = rows[0];
  if (!last) return { episode: episodes[0], label: `Reproducir episodio ${episodes[0].number}` };
  const progress = animeHistoryProgress(rows);
  const current = episodes.find(episode => normalizedUrl(episode.url) === normalizedUrl(last.episodeUrl))
    ?? episodes.find(episode => episode.number === last.episodeNumber);
  if (last.watchProgress < EPISODE_COMPLETION_PROGRESS && current) {
    return { episode: current, label: `Reanudar episodio ${current.number}` };
  }
  const next = episodes.find(episode => episode.number > (current?.number ?? last.episodeNumber)
    && (progress.get(episode.number) ?? 0) < EPISODE_COMPLETION_PROGRESS);
  if (next) return { episode: next, label: `Continuar episodio ${next.number}` };
  const episode = current ?? episodes[episodes.length - 1];
  return { episode, label: `Volver a ver episodio ${episode.number}` };
}
