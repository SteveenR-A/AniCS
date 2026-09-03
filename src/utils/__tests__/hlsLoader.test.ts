import { describe, it, expect, vi } from 'vitest';
import Hls from 'hls.js';
import { rewriteDeadCdnUrl, createRobustHlsLoader } from '../hlsLoader';

describe('hlsLoader - CDN Sanitization and Robust Loader', () => {
  it('reescribe URLs de cdn2 y cdn5 de ducvomes a cdn1 saludable', () => {
    const deadCdn2 = 'https://cdn2.ducvomes.com/ja/segs/2/v1x/abc/21v2x.ts';
    const deadCdn5 = 'https://cdn5.ducvomes.com/ja/segs/2/v1x/abc/20v2x.ts';
    const healthyCdn1 = 'https://cdn1.ducvomes.com/ja/segs/2/v1x/abc/24v2x.ts';

    expect(rewriteDeadCdnUrl(deadCdn2)).toBe('https://cdn1.ducvomes.com/ja/segs/2/v1x/abc/21v2x.ts');
    expect(rewriteDeadCdnUrl(deadCdn5)).toBe('https://cdn1.ducvomes.com/ja/segs/2/v1x/abc/20v2x.ts');
    expect(rewriteDeadCdnUrl(healthyCdn1)).toBe(healthyCdn1);
  });

  it('reescribe contenido completo de un manifiesto .m3u8 reemplazando todos los segmentos de cdn2 y cdn5', () => {
    const m3u8Playlist = `#EXTM3U
#EXT-X-VERSION:3
#EXTINF:1.042711,
https://cdn5.ducvomes.com/ja/segs/20.ts
#EXTINF:1.001000,
https://cdn2.ducvomes.com/ja/segs/21.ts
#EXTINF:2.502500,
https://cdn1.ducvomes.com/ja/segs/24.ts
#EXTINF:3.003000,
https://cdn4.ducvomes.com/ja/segs/28.ts`;

    const sanitized = rewriteDeadCdnUrl(m3u8Playlist);

    expect(sanitized).not.toContain('cdn5.ducvomes.com');
    expect(sanitized).not.toContain('cdn2.ducvomes.com');
    expect(sanitized).toContain('https://cdn1.ducvomes.com/ja/segs/20.ts');
    expect(sanitized).toContain('https://cdn1.ducvomes.com/ja/segs/21.ts');
    expect(sanitized).toContain('https://cdn1.ducvomes.com/ja/segs/24.ts');
    expect(sanitized).toContain('https://cdn4.ducvomes.com/ja/segs/28.ts');
  });

  it('el cargador personalizado intercepta y reescribe la URL de contexto y el cuerpo de respuesta', () => {
    const RobustLoaderClass = createRobustHlsLoader(Hls);
    const loader = new RobustLoaderClass({} as any);

    const mockContext = {
      url: 'https://cdn2.ducvomes.com/ja/segs/21.ts',
    };

    const mockResponse = {
      data: 'https://cdn5.ducvomes.com/ja/segs/20.ts',
    };

    const onSuccess = vi.fn();
    const callbacks = {
      onSuccess,
      onError: vi.fn(),
      onProgress: vi.fn(),
      onTimeout: vi.fn(),
    };

    // Espiar super.load
    const superLoadSpy = vi.spyOn(Hls.DefaultConfig.loader.prototype, 'load').mockImplementation(function (
      this: any,
      ctx: any,
      _cfg: any,
      cbs: any
    ) {
      cbs.onSuccess(mockResponse, {}, ctx, {});
    });

    loader.load(mockContext, {}, callbacks);

    // Debe haber transformado context.url a cdn1
    expect(mockContext.url).toBe('https://cdn1.ducvomes.com/ja/segs/21.ts');
    // Debe haber llamado onSuccess con response.data transformado a cdn1
    expect(onSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        data: 'https://cdn1.ducvomes.com/ja/segs/20.ts',
      }),
      expect.anything(),
      expect.anything(),
      expect.anything()
    );

    superLoadSpy.mockRestore();
  });
});
