import { showUpdateNotification } from '@/services/downloadService';

export const CURRENT_VERSION = '0.2.2';
export const DEFAULT_REPO = 'SteveenR-A/AniCS';

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  assets: Array<{
    name: string;
    browser_download_url: string;
    size: number;
  }>;
}

/**
 * Compara dos versiones semver (p.ej. "0.1.6" vs "0.1.7" o "v0.2.0")
 */
export const isNewVersionAvailable = (remoteTag: string): boolean => {
  try {
    const cleanRemote = remoteTag.replace(/^v/i, '').trim();
    const cleanCurrent = CURRENT_VERSION.replace(/^v/i, '').trim();

    const remoteParts = cleanRemote.split('.').map((n) => parseInt(n, 10) || 0);
    const currentParts = cleanCurrent.split('.').map((n) => parseInt(n, 10) || 0);

    for (let i = 0; i < Math.max(remoteParts.length, currentParts.length); i++) {
      const r = remoteParts[i] ?? 0;
      const c = currentParts[i] ?? 0;
      if (r > c) return true;
      if (r < c) return false;
    }
    return false;
  } catch {
    return false;
  }
};

let hasCheckedThisSession = false;

/**
 * Comprueba si hay una nueva versión disponible en GitHub Releases.
 * Si notifyIfNew es true y hay una versión más reciente, emite una notificación nativa.
 */
export async function checkForAppUpdates(
  notifyIfNew = true,
  repo = DEFAULT_REPO
): Promise<GitHubRelease | null> {
  try {
    const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });
    if (!response.ok) return null;

    const data: GitHubRelease = await response.json();
    if (data && data.tag_name && isNewVersionAvailable(data.tag_name)) {
      if (notifyIfNew && !hasCheckedThisSession) {
        hasCheckedThisSession = true;

        // Notificación Android nativa
        showUpdateNotification(
          'AniCS · Nueva versión disponible',
          `La versión ${data.tag_name} ya está disponible con nuevas mejoras y correcciones.`
        );

        // Fallback / Desktop Tauri Notification
        (async () => {
          try {
            const { isPermissionGranted, sendNotification } = await import('@tauri-apps/plugin-notification');
            if (await isPermissionGranted()) {
              sendNotification({
                title: 'AniCS · Nueva versión disponible',
                body: `Versión ${data.tag_name} disponible para actualizar.`,
              });
            }
          } catch {}
        })();
      }
      return data;
    }
    return null;
  } catch (e) {
    console.warn('Error checking for updates:', e);
    return null;
  }
}
