import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { advancedSearch, getDetails, resolveStream, searchAnime } from '../animeService';
import type { SearchFilters, VideoServer } from '@/types';
import fixtureJson from '../../../docs/android-native/fixtures/catalog-v1.json?raw';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

// The same golden JSON is consumed by Rust and can be reused by Kotlin in P3.
const fixtures = JSON.parse(fixtureJson);

describe('catalog wire fixtures used by the current frontend', () => {
  beforeEach(() => vi.clearAllMocks());

  it('passes defaulted and full Unicode search results through unchanged', async () => {
    const results = fixtures.animeResults.map((item: { expected: unknown }) => item.expected);
    vi.mocked(invoke).mockResolvedValueOnce(results);
    expect(await searchAnime('dragón 龍', 'custom_0')).toEqual(results);
    expect(invoke).toHaveBeenCalledWith('search_anime', { query: 'dragón 龍', source: 'custom_0' });
  });

  it('retains nullable details, episode order and fractional progress from Rust', async () => {
    const details = fixtures.details[0].expected;
    vi.mocked(invoke).mockResolvedValueOnce(details);
    const result = await getDetails(details.url, details.source);
    expect(result).toEqual(details);
    expect(result.episodes.map(episode => episode.number)).toEqual([1, 2]);
    expect(result.episodes[0].watchProgress).toBe(0.375);
    expect(result.studio).toBeNull();
  });

  it('retains HLS signed URLs, referer, user agent and nullable bandwidth', async () => {
    const server: VideoServer = fixtures.servers[1].input;
    const media = fixtures.media[0].expected;
    vi.mocked(invoke).mockResolvedValueOnce(media);
    expect(await resolveStream(server, 'jkanime')).toEqual(media);
    expect(invoke).toHaveBeenCalledWith('resolve_stream', { server, source: 'jkanime' });
  });

  it('preserves the existing direct MP4 shortcut and referer', async () => {
    const server: VideoServer = fixtures.servers[0].input;
    const result = await resolveStream(server, 'custom');
    expect(result).toEqual({
      directUrl: server.url, mediaType: 'mp4', referer: server.referer, qualities: [],
    });
    expect(invoke).not.toHaveBeenCalled();
  });

  it('passes pagination and empty results through without replacing null totals', async () => {
    const filters: SearchFilters = fixtures.filters[0].input;
    const page = fixtures.pages[0].expected;
    vi.mocked(invoke).mockResolvedValueOnce(page);
    expect(await advancedSearch(filters, 'otakustv')).toEqual(page);
    expect(invoke).toHaveBeenCalledWith('advanced_search', { filters, source: 'otakustv' });
  });
});
