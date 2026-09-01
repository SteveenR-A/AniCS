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
  profileId?: string;
}

export interface GenreItem {
  name: string;
  slug: string;
}

export interface ScheduleDay {
  day: string;
  animes: AnimeResult[];
}

export interface AnimeDetails {
  title: string;
  url: string;
  thumbnailUrl: string;
  synopsis: string;
  genres: string[];
  status?: string;
  animeType?: string;
  studio?: string;
  duration?: string;
  totalEpisodes?: string;
  season?: string;
  broadcast?: string;
  languages?: string;
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
  profileId?: string;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  color: string;
  isActive: boolean;
  createdAt: string;
}

export interface TombstoneItem {
  id: string;
  entityType: string;
  entityId: string;
  profileId: string;
  deletedAt: string;
}

export interface SyncMeta {
  schemaVersion: number;
  appVersion: string;
  lastModifiedAt: string;
  lastModifiedDevice: 'windows' | 'android' | 'web';
  pbkdf2Salt?: string;
  fileHashes: {
    profiles: string;
    history: string;
    favorites: string;
    settings: string;
  };
  deletedFavorites: Array<{
    url: string;
    profileId: string;
    deletedAt: string;
  }>;
  deletedProfiles: Array<{
    profileId: string;
    deletedAt: string;
  }>;
}

export interface GistSyncConfig {
  githubToken?: string;
  gistId?: string;
  lastEtag?: string;
  autoSync: boolean;
  encryptionEnabled: boolean;
  lastSyncAt?: string;
  gistUrl?: string;
}

export interface GistFilesPayload {
  syncMeta: SyncMeta;
  profiles: UserProfile[];
  history: HistoryEntry[];
  favorites: AnimeResult[];
  settings: Record<string, string>;
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
  speedKbps?: number;
  downloadedBytes: number;
  totalBytes?: number;
  error?: string;
  createdAt?: string;
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

export interface LocalEpisodeItem {
  filePath: string;
  fileName: string;
  episodeNumber: number;
  fileSize: number;
  fileSizeFormatted: string;
  modifiedAt: string;
  watchProgress: number;
  watchStatus: 'unseen' | 'in_progress' | 'completed';
}

export interface LocalAnimeFolder {
  animeTitle: string;
  folderPath: string;
  totalEpisodes: number;
  totalSize: number;
  totalSizeFormatted: string;
  coverImage?: string;
  episodes: LocalEpisodeItem[];
}

export interface CacheStats {
  totalBytes: number;
  totalFormatted: string;
  fileCount: number;
}

export interface Source {
  id: string;
  name: string;
  baseUrl: string;
}
