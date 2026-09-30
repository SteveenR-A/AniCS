import { describe, expect, it } from 'vitest';
import { isDirectMediaUrl, mergePlaybackServers } from './usePlaybackServers';

describe('playback server membership', () => {
  it('filters episode-specific URLs and keeps the extractor entry when a URL is duplicated', () => {
    const builtIn = { name: 'Original', url: 'https://example.com/embed', isDirect: false };
    const result = mergePlaybackServers([builtIn], [
      { ...builtIn, name: 'Duplicado', episodeUrl: 'ep1', source: 'jkanime' },
      { name: 'Correcto', url: 'https://example.com/1.mp4', isDirect: true, episodeUrl: 'ep1', source: 'jkanime' },
      { name: 'Otro episodio', url: 'https://example.com/2.mp4', isDirect: true, episodeUrl: 'ep2', source: 'jkanime' },
      { name: 'Otra fuente', url: 'https://example.com/3.mp4', isDirect: true, episodeUrl: 'ep1', source: 'otakustv' },
    ], 'ep1', 'jkanime');
    expect(result.map(entry => entry.name)).toEqual(['Original', 'Correcto']);
  });

  it('distinguishes direct media with signed query parameters from catalog pages', () => {
    expect(isDirectMediaUrl('https://example.com/master.m3u8?signature=abc')).toBe(true);
    expect(isDirectMediaUrl('https://example.com/catalog?next=file.mp4')).toBe(false);
  });
});
