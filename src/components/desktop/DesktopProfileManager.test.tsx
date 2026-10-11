import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DesktopProfileManager } from './DesktopProfileManager';
import { useProfileStore } from '@/stores/useProfileStore';
import * as service from '@/services/profileService';
import { importProfileImage } from '@/utils/profileImages';

vi.mock('@/services/profileService', () => ({ getProfileStats: vi.fn(), getAllProfiles: vi.fn(), getActiveProfile: vi.fn(),
  upsertProfile: vi.fn(), setActiveProfile: vi.fn(), deleteProfile: vi.fn() }));
vi.mock('@/stores/useSyncStore', () => ({ useSyncStore: { getState: () => ({ triggerDebouncedSync: vi.fn() }) } }));
vi.mock('@/utils/profileImages', () => ({ importProfileImage: vi.fn(), exportProfileImage: vi.fn(), isProfileImage: (value: string) => value.startsWith('data:image/png;base64,') }));
const profile = { id: 'default', name: 'Principal', avatar: 'sparkles', color: '#3b82f6', isActive: true, createdAt: '2026-01-01T00:00:00Z' };
beforeEach(() => {
  vi.resetAllMocks();
  useProfileStore.setState({ profiles: [profile], activeProfile: profile });
  vi.mocked(service.getAllProfiles).mockResolvedValue([profile]);
  vi.mocked(service.getActiveProfile).mockResolvedValue(profile);
  vi.mocked(service.getProfileStats).mockResolvedValue({ animesCount: 2, episodesCount: 10, hoursWatched: 4 });
});
afterEach(cleanup);

it('edits an existing profile without replacing its identity or history ownership', async () => {
  render(<DesktopProfileManager onClose={vi.fn()} />);
  await screen.findByText('2 animes · 10 episodios · 4 h');
  fireEvent.click(screen.getByRole('button', { name: 'Editar perfil Principal' }));
  fireEvent.change(screen.getByLabelText('Nombre del perfil'), { target: { value: 'Mi perfil' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));
  await waitFor(() => expect(service.upsertProfile).toHaveBeenCalledWith({ ...profile, name: 'Mi perfil' }));
  expect(await screen.findByRole('status')).toHaveTextContent('Perfil guardado');
});

it('saves imported images in the same avatar field and displays the preview', async () => {
  const png = 'data:image/png;base64,AQID';
  vi.mocked(importProfileImage).mockResolvedValue(png);
  render(<DesktopProfileManager onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Editar perfil Principal' }));
  fireEvent.change(screen.getByLabelText(/Cargar imagen/), { target: { files: [new File(['png'], 'photo.png', { type: 'image/png' })] } });
  await waitFor(() => expect(screen.getByAltText('Imagen del perfil')).toHaveAttribute('src', png));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));
  await waitFor(() => expect(service.upsertProfile).toHaveBeenCalledWith({ ...profile, avatar: png }));
});

it('reports a failed save and keeps the editor open for retrying', async () => {
  vi.mocked(service.upsertProfile).mockRejectedValue(new Error('Base de datos ocupada'));
  render(<DesktopProfileManager onClose={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Editar perfil Principal' }));
  fireEvent.click(screen.getByRole('button', { name: 'Guardar perfil' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Base de datos ocupada');
  expect(screen.getByLabelText('Nombre del perfil')).toHaveValue('Principal');
});
