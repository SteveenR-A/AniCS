// Tipos TypeScript espejo de los modelos Rust (serde_json)

export interface AnimeResult {
  title: string;
  url: string;
  thumbnailUrl: string;
  description?: string;
  episode?: string;
  animeType?: string;
  status?: string;
  genres?: string[];
  year?: string;
  rating?: number;
  source: string;
}

export interface AnimeDetails {
  title: string;
  url: string;
  thumbnailUrl: string;
  synopsis: string;
  genres: string[];
  status?: string;
  animeType?: string;
  year?: string;
  rating?: number;
  episodes: Episode[];
  source: string;
}

export interface Episode {
  number: number;
  title?: string;
  url: string;
  thumbnailUrl?: string;
  watched: boolean;
  watchProgress?: number;
}

export interface VideoServer {
  name: string;
  url: string;
  isDirect: boolean;
  referer?: string;
}

export interface ResolvedMedia {
  directUrl: string;
  mediaType: 'hls' | 'mp4' | 'unknown';
  referer?: string;
  userAgent?: string;
  qualities: Quality[];
}

export interface Quality {
  label: string;
  url: string;
  bandwidth?: number;
}

export interface SearchFilters {
  query?: string;
  genre?: string;
  status?: string;
  animeType?: string;
  year?: string;
  orderBy?: string;
  page: number;
}

export interface SearchResultPage {
  results: AnimeResult[];
  currentPage: number;
  totalPages?: number;
  hasNext: boolean;
}

export interface HistoryEntry {
  id: string;
  animeTitle: string;
  animeUrl: string;
  thumbnailUrl: string;
  episodeNumber: number;
  episodeUrl: string;
  watchProgress: number;
  watchedAt: string;
  source: string;
}

export type DownloadStatus = 'queued' | 'downloading' | 'paused' | 'completed' | 'failed' | 'canceled';

export interface DownloadTask {
  id: string;
  animeTitle: string;
  episodeNumber: number;
  streamUrl: string;
  referer?: string;
  outputPath: string;
  status: DownloadStatus;
  progress: number;
  speedKbps: number;
  downloadedBytes: number;
  totalBytes?: number;
  error?: string;
}

export interface DownloadProgress {
  id: string;
  progress: number;
  speedKbps: number;
  downloadedBytes: number;
  totalBytes?: number;
  status: DownloadStatus;
  error?: string;
}

export interface Source {
  id: string;
  name: string;
  baseUrl: string;
}
