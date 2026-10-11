import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { exportProfileImage, importProfileImage } from '../profileImages';
import { save } from '@tauri-apps/plugin-dialog';
import { writeFile } from '@tauri-apps/plugin-fs';

vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true }));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: vi.fn() }));
beforeEach(() => vi.resetAllMocks());
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it('exports the portable PNG bytes only to the chosen path', async () => {
  vi.mocked(save).mockResolvedValue('/tmp/avatar.png');
  vi.mocked(writeFile).mockResolvedValue(undefined);
  expect(await exportProfileImage('data:image/png;base64,AQID', 'Perfil', '#3b82f6', null)).toBe(true);
  expect(writeFile).toHaveBeenCalledWith('/tmp/avatar.png', new Uint8Array([1, 2, 3]));
});

it('does not write a file when export is canceled', async () => {
  vi.mocked(save).mockResolvedValue(null);
  expect(await exportProfileImage('data:image/png;base64,AQID', 'Perfil', '#3b82f6', null)).toBe(false);
  expect(writeFile).not.toHaveBeenCalled();
});

it('rejects unsupported files and oversized images before decoding', async () => {
  await expect(importProfileImage(new File(['text'], 'file.txt', { type: 'text/plain' }))).rejects.toThrow('PNG');
  await expect(importProfileImage(new File([new Uint8Array(11 * 1024 * 1024)], 'big.png', { type: 'image/png' }))).rejects.toThrow('10 MB');
});

it('center-crops and scales imported photos to the PNG format used by Kotlin', async () => {
  const revoke = vi.fn();
  vi.stubGlobal('URL', { createObjectURL: () => 'blob:test', revokeObjectURL: revoke });
  vi.stubGlobal('Image', class {
    naturalWidth = 400; naturalHeight = 200;
    onload: (() => void) | undefined;
    set src(_value: string) { queueMicrotask(() => this.onload?.()); }
  });
  const draw = vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage: draw } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,AQID');
  expect(await importProfileImage(new File(['png'], 'photo.png', { type: 'image/png' }))).toBe('data:image/png;base64,AQID');
  expect(draw).toHaveBeenCalledWith(expect.anything(), 100, 0, 200, 200, 0, 0, 256, 256);
  expect(revoke).toHaveBeenCalledWith('blob:test');
});
