import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isNewVersionAvailable, checkForAppUpdates, CURRENT_VERSION, getDesktopUpdateAssets, getDesktopUpdatePlatform } from '../updateService';

vi.mock('@/services/downloadService', () => ({
  showUpdateNotification: vi.fn(),
}));

describe('updateService', () => {
  describe('desktop update packages', () => {
    const assets = ['AniCS-setup.exe', 'AniCS.apk', 'AniCS_x86_64.AppImage', 'AniCS_amd64.deb', 'AniCS.x86_64.rpm', 'notes.txt']
      .map(name => ({ name, browser_download_url: `https://example.com/${name}`, size: 100 }));

    it('offers Linux packages and excludes Windows and Android installers', () => {
      const platform = getDesktopUpdatePlatform('Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15');
      expect(getDesktopUpdateAssets(assets, platform).map(asset => asset.name)).toEqual([
        'AniCS_x86_64.AppImage', 'AniCS_amd64.deb', 'AniCS.x86_64.rpm',
      ]);
    });

    it('preserves the Windows installer selection', () => {
      expect(getDesktopUpdateAssets(assets, getDesktopUpdatePlatform('Windows NT 10.0')).map(asset => asset.name))
        .toEqual(['AniCS-setup.exe']);
    });

    it.each(['Linux; Android 13', 'Macintosh; Intel Mac OS X', ''])('does not offer incompatible desktop packages for %s', userAgent => {
      expect(getDesktopUpdateAssets(assets, getDesktopUpdatePlatform(userAgent))).toEqual([]);
    });
  });

  describe('isNewVersionAvailable', () => {
    it('returns true when remote version is higher', () => {
      expect(isNewVersionAvailable('v99.0.0')).toBe(true);
      expect(isNewVersionAvailable('99.9.9')).toBe(true);
    });

    it('returns false when remote version is equal or lower', () => {
      expect(isNewVersionAvailable(CURRENT_VERSION)).toBe(false);
      expect(isNewVersionAvailable(`v${CURRENT_VERSION}`)).toBe(false);
      expect(isNewVersionAvailable('v0.0.1')).toBe(false);
    });

    it('handles malformed version gracefully', () => {
      expect(isNewVersionAvailable('invalid-tag')).toBe(false);
    });
  });

  describe('checkForAppUpdates', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('fetches release from GitHub and detects new version', async () => {
      const mockRelease = {
        tag_name: 'v99.0.0',
        name: 'AniCS v99.0.0',
        body: 'Notes',
        html_url: 'https://github.com',
        published_at: '2026-09-18',
        assets: [],
      };

      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockRelease,
      });

      const release = await checkForAppUpdates(false);
      expect(release).toEqual(mockRelease);
    });

    it('returns null if response is not ok', async () => {
      globalThis.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const release = await checkForAppUpdates(false);
      expect(release).toBeNull();
    });
  });
});
