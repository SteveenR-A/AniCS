import { useEffect, useRef, useState } from 'react';
import { Check, Download, Edit3, Plus, Trash2, Upload, X } from 'lucide-react';
import { AVATAR_OPTIONS, COLOR_OPTIONS } from '@/components/ProfileSelectorModal';
import { DesktopProfileAvatar } from './DesktopProfileAvatar';
import { useProfileStore } from '@/stores/useProfileStore';
import { useSyncStore } from '@/stores/useSyncStore';
import { getProfileStats } from '@/services/profileService';
import { exportProfileImage, importProfileImage } from '@/utils/profileImages';
import type { ProfileStats, UserProfile } from '@/types';
import './DesktopProfileManager.css';

export function DesktopProfileManager({ onClose }: { onClose: () => void }) {
  const { profiles, activeProfile, createProfile, updateProfile, switchProfile, deleteProfile } = useProfileStore();
  const [editing, setEditing] = useState<UserProfile | 'new' | null>(null);
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState('sparkles');
  const [color, setColor] = useState('#3b82f6');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [statsSnapshot, setStatsSnapshot] = useState<{ profiles: UserProfile[]; values: Record<string, ProfileStats> } | null>(null);
  const stats = statsSnapshot?.values ?? {};
  const loadingStats = statsSnapshot?.profiles !== profiles;
  const preview = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.querySelector('button')?.focus();
    return () => { previous?.focus(); };
  }, []);

  useEffect(() => {
    let disposed = false;
    void Promise.all(profiles.map(async profile => {
      try { return [profile.id, await getProfileStats(profile.id)] as const; }
      catch { return [profile.id, null] as const; }
    })).then(entries => {
      if (disposed) return;
      setStatsSnapshot({ profiles, values: Object.fromEntries(entries.filter((entry): entry is readonly [string, ProfileStats] => entry[1] !== null)) });
    });
    return () => { disposed = true; };
  }, [profiles]);

  const edit = (profile: UserProfile | 'new') => {
    setEditing(profile); setError(''); setMessage('');
    setName(profile === 'new' ? '' : profile.name);
    setAvatar(profile === 'new' ? 'sparkles' : profile.avatar);
    setColor(profile === 'new' ? '#3b82f6' : profile.color);
  };
  const run = async (action: () => Promise<void>) => {
    if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  };
  const select = (id: string) => run(async () => {
    await switchProfile(id);
    if (useProfileStore.getState().activeProfile?.id !== id) throw new Error(useProfileStore.getState().error || 'No se pudo activar el perfil.');
    onClose();
  });
  const save = () => run(async () => {
    if (!name.trim()) throw new Error('Introduce un nombre para el perfil.');
    if (editing === 'new') await createProfile(name.trim(), avatar, color);
    else if (editing) await updateProfile({ ...editing, name: name.trim(), avatar, color });
    useSyncStore.getState().triggerDebouncedSync();
    setEditing(null); setMessage('Perfil guardado.');
  });

  return <div className="desktop-profile-backdrop">
    <section ref={dialog} className="desktop-profile-manager" role="dialog" aria-modal="true" aria-labelledby="desktop-profile-title" onKeyDown={event => {
      if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') {
        const nodes = event.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)');
        const first = nodes[0]; const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }}>
      <header><h2 id="desktop-profile-title">{editing ? editing === 'new' ? 'Crear perfil' : 'Editar perfil' : 'Perfiles'}</h2>
        <button type="button" aria-label="Cerrar perfiles" disabled={busy} onClick={onClose}><X size={20} /></button></header>
      <p className="desktop-profile-hint">Cada perfil mantiene su historial y favoritos independientes.</p>
      {error && <p role="alert" className="desktop-profile-error">{error}</p>}
      {message && <p role="status">{message}</p>}
      {editing ? <form onSubmit={event => { event.preventDefault(); void save(); }}>
        <div ref={preview} className="desktop-profile-preview" style={{ background: color }}><DesktopProfileAvatar avatar={avatar} size={40} /></div>
        <label>Nombre del perfil<input value={name} onChange={event => setName(event.target.value)} maxLength={60} autoFocus disabled={busy} /></label>
        <div className="desktop-profile-image-actions">
          <label className="desktop-profile-upload"><Upload size={16} /> Cargar imagen
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" disabled={busy} onChange={event => {
              const file = event.target.files?.[0]; event.target.value = '';
              if (file) void run(async () => setAvatar(await importProfileImage(file)));
            }} /></label>
          <button type="button" disabled={busy} onClick={() => void run(async () => {
            if (await exportProfileImage(avatar, name, color, preview.current?.querySelector('svg') ?? null)) setMessage('Imagen de perfil exportada.');
          })}><Download size={16} /> Exportar PNG</button>
        </div>
        <p className="desktop-profile-hint">La foto se recorta al centro y se guarda como PNG de 256 × 256.</p>
        <div className="desktop-profile-avatar-options" aria-label="Avatares">
          {AVATAR_OPTIONS.map(option => <button type="button" key={option.id} disabled={busy} aria-label={option.label}
            aria-pressed={avatar === option.id} onClick={() => setAvatar(option.id)}><option.Icon size={22} /></button>)}
        </div>
        <div className="desktop-profile-colors" aria-label="Color del perfil">
          {COLOR_OPTIONS.map(option => <button type="button" key={option} disabled={busy} aria-label={`Color ${option}`}
            aria-pressed={color === option} style={{ background: option }} onClick={() => setColor(option)} />)}
        </div>
        <footer><button type="button" disabled={busy} onClick={() => setEditing(null)}>Volver</button>
          <button type="submit" disabled={busy}>{busy ? 'Guardando…' : 'Guardar perfil'}</button></footer>
      </form> : <>
        <div className="desktop-profile-list">
          {profiles.map(profile => <article key={profile.id}>
            <button className="desktop-profile-select" type="button" disabled={busy} onClick={() => void select(profile.id)}>
              <span className="desktop-profile-avatar" style={{ background: profile.color }}><DesktopProfileAvatar avatar={profile.avatar} /></span>
              <span><strong>{profile.name}</strong><small>{activeProfile?.id === profile.id ? 'Perfil activo' : 'Perfil disponible'}{profile.id === 'default' ? ' · Principal' : ''}</small>
                <small>{loadingStats ? 'Cargando estadísticas…' : stats[profile.id]
                  ? `${stats[profile.id].animesCount} animes · ${stats[profile.id].episodesCount} episodios · ${stats[profile.id].hoursWatched} h`
                  : 'Estadísticas no disponibles'}</small>
                <small>{Number.isNaN(Date.parse(profile.createdAt)) ? 'Fecha de creación no disponible' : `Creado el ${new Date(profile.createdAt).toLocaleDateString()}`}</small></span>
              {activeProfile?.id === profile.id && <Check size={18} />}
            </button>
            <div className="desktop-profile-actions">
              <button type="button" disabled={busy} aria-label={`Editar perfil ${profile.name}`} onClick={() => edit(profile)}><Edit3 size={15} /> Editar</button>
              {profile.id !== 'default' && <button type="button" disabled={busy} aria-label={`Eliminar perfil ${profile.name}`} onClick={() => {
                if (window.confirm(`¿Eliminar el perfil ${profile.name} y sus datos locales?`)) void run(async () => {
                  await deleteProfile(profile.id); useSyncStore.getState().triggerDebouncedSync();
                });
              }}><Trash2 size={15} /></button>}
            </div>
          </article>)}
        </div>
        <button type="button" disabled={busy} className="desktop-profile-create" onClick={() => edit('new')}><Plus size={16} /> Crear perfil</button>
      </>}
    </section>
  </div>;
}
