import { invoke } from '@tauri-apps/api/core';

interface AndroidCastingBridge {
  openScreenCastSettings: () => void;
  requestGoogleCast?: (payload: string) => void;
  getGoogleCastPlaybackState?: () => string;
  controlGoogleCastPlayback?: (action: string, positionSeconds: number) => void;
}

export interface DlnaDevice {
  id: string;
  name: string;
  model?: string | null;
  address: string;
}

export interface DlnaPlaybackState {
  deviceName: string;
  transportState: string;
  positionSeconds: number;
  durationSeconds: number;
}

export interface GoogleCastPlaybackState extends DlnaPlaybackState {
  status?: 'connecting' | 'connected' | 'error';
  error?: string;
}

export const discoverDlnaDevices = () => invoke<DlnaDevice[]>('discover_dlna_devices');

export const castToDlnaDevice = (options: {
  deviceId: string;
  streamUrl: string;
  localFilePath?: string | null;
  title: string;
  mediaType: 'hls' | 'mp4' | 'unknown';
  startPosition: number;
  startPlaying: boolean;
}) => invoke<void>('cast_to_dlna_device', options);

export const controlDlnaPlayback = (action: 'play' | 'pause' | 'seek' | 'stop', positionSeconds?: number) =>
  invoke<void>('control_dlna_playback', { action, positionSeconds });

export const getDlnaPlaybackState = () => invoke<DlnaPlaybackState | null>('get_dlna_playback_state');

export const setDlnaVolume = (volume: number) => invoke<void>('set_dlna_volume', { volume });

export const openAndroidScreenCastSettings = () => {
  const bridge = (window as Window & { AndroidBridge?: AndroidCastingBridge }).AndroidBridge;
  if (!bridge?.openScreenCastSettings) return false;
  bridge.openScreenCastSettings();
  return true;
};

export const isGoogleCastAvailable = () => {
  const bridge = (window as Window & { AndroidBridge?: AndroidCastingBridge }).AndroidBridge;
  return !!bridge?.requestGoogleCast && !!bridge.getGoogleCastPlaybackState && !!bridge.controlGoogleCastPlayback;
};

export const requestGoogleCast = (options: {
  streamUrl: string;
  title: string;
  mediaType: 'hls' | 'mp4' | 'unknown';
  startPosition: number;
  startPlaying: boolean;
}) => {
  const bridge = (window as Window & { AndroidBridge?: AndroidCastingBridge }).AndroidBridge;
  if (!bridge?.requestGoogleCast) throw new Error('Google Cast está disponible solo en la app Android.');
  bridge.requestGoogleCast(JSON.stringify(options));
};

export const getGoogleCastPlaybackState = (): GoogleCastPlaybackState | null => {
  const bridge = (window as Window & { AndroidBridge?: AndroidCastingBridge }).AndroidBridge;
  const raw = bridge?.getGoogleCastPlaybackState?.();
  if (!raw) return null;
  const state = JSON.parse(raw) as GoogleCastPlaybackState;
  return state.status === 'connected' ? state : null;
};

export const getGoogleCastStatus = () => {
  const bridge = (window as Window & { AndroidBridge?: AndroidCastingBridge }).AndroidBridge;
  const raw = bridge?.getGoogleCastPlaybackState?.();
  return raw ? JSON.parse(raw) as GoogleCastPlaybackState : null;
};

export const controlGoogleCastPlayback = (action: 'play' | 'pause' | 'seek' | 'stop', positionSeconds = 0) => {
  const bridge = (window as Window & { AndroidBridge?: AndroidCastingBridge }).AndroidBridge;
  if (!bridge?.controlGoogleCastPlayback) throw new Error('No hay una sesión Google Cast disponible.');
  bridge.controlGoogleCastPlayback(action, positionSeconds);
};
