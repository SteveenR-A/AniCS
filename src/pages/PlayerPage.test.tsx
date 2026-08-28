import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { PlayerPage } from './PlayerPage';
import { invoke } from '@tauri-apps/api/core';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('PlayerPage fullscreen error handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles enterFullscreen errors gracefully without crashing', async () => {
    // Mock invoke to throw
    (invoke as any).mockRejectedValue(new Error('Tauri invoke failed'));

    // Mock requestFullscreen to throw
    const originalRequestFullscreen = document.documentElement.requestFullscreen;
    document.documentElement.requestFullscreen = vi.fn().mockRejectedValue(new Error('DOM requestFullscreen failed'));

    // Mock wakeLock
    Object.defineProperty(navigator, 'wakeLock', {
      value: {
        request: vi.fn().mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) })
      },
      writable: true
    });

    render(
      <MemoryRouter>
        <PlayerPage />
      </MemoryRouter>
    );

    // It should render without crashing, showing the default "no content" state
    expect(screen.getByText('No hay contenido seleccionado')).toBeInTheDocument();

    // Verify invoke was called
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('set_fullscreen', { fullscreen: true });
    });

    // Verify requestFullscreen was called
    expect(document.documentElement.requestFullscreen).toHaveBeenCalled();

    // Restore requestFullscreen
    document.documentElement.requestFullscreen = originalRequestFullscreen;
  });
});
