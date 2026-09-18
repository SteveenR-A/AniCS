import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isNewVersionAvailable, checkForAppUpdates, CURRENT_VERSION } from '../updateService';

vi.mock('@/services/downloadService', () => ({
  showUpdateNotification: vi.fn(),
}));

describe('updateService', () => {
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
