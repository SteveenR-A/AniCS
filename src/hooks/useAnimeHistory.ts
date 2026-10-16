import { useCallback, useEffect, useMemo, useState } from 'react';
import { getAllHistory } from '@/services/storageService';
import { animeHistory, animeHistoryProgress, animePlaybackAction } from '@/utils/animePlayback';
import type { AnimeDetails, HistoryEntry } from '@/types';

const EMPTY_HISTORY: HistoryEntry[] = [];

export function useAnimeHistory(details: AnimeDetails | null, profileId = 'default') {
  const [reload, setReload] = useState(0);
  const [state, setState] = useState<{ key: string; rows: HistoryEntry[]; error: boolean } | null>(null);
  const hasDetails = Boolean(details);
  const key = JSON.stringify([details?.url, details?.title, profileId, reload]);
  const refresh = useCallback(() => setReload(value => value + 1), []);
  useEffect(() => {
    if (!hasDetails) return;
    let disposed = false;
    void getAllHistory(profileId).then(rows => {
      if (!disposed) setState({ key, rows, error: false });
    }).catch(error => {
      console.error('No se pudo cargar el historial del anime', error);
      if (!disposed) setState({ key, rows: [], error: true });
    });
    return () => { disposed = true; };
  }, [key, profileId, hasDetails]);
  useEffect(() => {
    window.addEventListener('focus', refresh);
    window.addEventListener('anics:sync-completed', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('anics:sync-completed', refresh);
    };
  }, [refresh]);
  const ready = state?.key === key;
  const rows = ready ? state.rows : EMPTY_HISTORY;
  const matched = useMemo(() => details ? animeHistory(details, rows, profileId) : [], [details, rows, profileId]);
  return {
    progress: useMemo(() => animeHistoryProgress(matched), [matched]),
    action: details && ready && !state.error ? animePlaybackAction(details, matched, profileId) : null,
    isLoading: Boolean(details && !ready),
    error: ready && state.error,
    refresh,
  };
}
