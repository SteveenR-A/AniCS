import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User, Sparkles, Swords, Bot, Star, Heart, Zap,
  Skull, Crown, Cat, Tv, Moon, Feather, Gamepad2, Smile,
  X, Plus, Check, Trash2, Edit3
} from 'lucide-react';
import { useProfileStore } from '@/stores/useProfileStore';
import { useSyncStore } from '@/stores/useSyncStore';
import type { UserProfile } from '@/types';

export const AVATAR_OPTIONS = [
  { id: 'swords', label: 'Shonen', Icon: Swords },
  { id: 'sparkles', label: 'Mágico', Icon: Sparkles },
  { id: 'gamepad', label: 'Gamer', Icon: Gamepad2 },
  { id: 'chibi', label: 'Chibi', Icon: Smile },
  { id: 'bot', label: 'Mecha', Icon: Bot },
  { id: 'heart', label: 'Waifu', Icon: Heart },
  { id: 'zap', label: 'Rayo', Icon: Zap },
  { id: 'skull', label: 'Shinigami', Icon: Skull },
  { id: 'crown', label: 'Senpai', Icon: Crown },
  { id: 'cat', label: 'Neko', Icon: Cat },
  { id: 'tv', label: 'Otaku', Icon: Tv },
  { id: 'star', label: 'Idol', Icon: Star },
  { id: 'moon', label: 'Tsukuyomi', Icon: Moon },
  { id: 'feather', label: 'Sensei', Icon: Feather },
  { id: 'user', label: 'Clásico', Icon: User },
];

export const COLOR_OPTIONS = [
  '#3b82f6', // Azul Shonen
  '#8b5cf6', // Púrpura Místico
  '#ec4899', // Rosa Sakura
  '#f59e0b', // Dorado Ki
  '#10b981', // Verde Esmeralda
  '#06b6d4', // Cian Mecha
  '#ef4444', // Rojo Carmesí
  '#f97316', // Naranja Ninja
  '#a855f7', // Lavanda Idol
  '#64748b', // Gris Sombra
];

export function getProfileAvatarIcon(avatarId: string) {
  const found = AVATAR_OPTIONS.find(a => a.id === avatarId);
  return found ? found.Icon : Sparkles;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ProfileSelectorModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { profiles, activeProfile, switchProfile, createProfile, updateProfile, deleteProfile } = useProfileStore();

  const [mode, setMode] = useState<'list' | 'create' | 'edit'>('list');
  const [editingProfile, setEditingProfile] = useState<UserProfile | null>(null);

  const [formName, setFormName] = useState('');
  const [formAvatar, setFormAvatar] = useState('swords');
  const [formColor, setFormColor] = useState('#3b82f6');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setMode('list');
      setEditingProfile(null);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectProfile = async (id: string) => {
    if (activeProfile?.id === id) {
      onClose();
      return;
    }
    await switchProfile(id);
    onClose();
  };

  const handleStartCreate = () => {
    setFormName('');
    setFormAvatar('swords');
    setFormColor('#3b82f6');
    setError(null);
    setMode('create');
  };

  const handleStartEdit = (e: React.MouseEvent, p: UserProfile) => {
    e.stopPropagation();
    setEditingProfile(p);
    setFormName(p.name);
    setFormAvatar(p.avatar || 'swords');
    setFormColor(p.color || '#3b82f6');
    setError(null);
    setMode('edit');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setError('Por favor ingresa un nombre para el perfil');
      return;
    }

    try {
      if (mode === 'create') {
        const created = await createProfile(formName.trim(), formAvatar, formColor);
        await switchProfile(created.id);
        useSyncStore.getState().triggerDebouncedSync();
        onClose();
      } else if (mode === 'edit' && editingProfile) {
        await updateProfile({
          ...editingProfile,
          name: formName.trim(),
          avatar: formAvatar,
          color: formColor,
        });
        useSyncStore.getState().triggerDebouncedSync();
        setMode('list');
        setEditingProfile(null);
      }
    } catch (err: any) {
      setError(err?.message || 'Error guardando perfil');
    }
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (id === 'default') return;
    if (confirm('¿Eliminar este perfil y todos sus datos locales?')) {
      await deleteProfile(id);
      useSyncStore.getState().triggerDebouncedSync();
    }
  };

  return (
    <AnimatePresence>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: 'rgba(0, 0, 0, 0.75)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          style={{
            width: '100%',
            maxWidth: '480px',
            background: 'var(--bg-card, #16181f)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            borderRadius: '20px',
            boxShadow: '0 20px 40px rgba(0, 0, 0, 0.6)',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '18px 20px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: '10px',
                  background: 'rgba(59, 130, 246, 0.15)',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--accent-primary, #3b82f6)',
                }}
              >
                {mode === 'edit' ? <Edit3 size={18} /> : <User size={20} />}
              </div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: 'white' }}>
                {mode === 'create'
                  ? 'Nuevo Perfil de Usuario'
                  : mode === 'edit'
                  ? (editingProfile?.id === 'default' ? 'Personalizar Perfil Principal' : 'Editar Perfil')
                  : 'Perfiles de Usuario'}
              </h3>
            </div>
            <button
              onClick={() => {
                if (mode !== 'list') {
                  setMode('list');
                  setEditingProfile(null);
                } else {
                  onClose();
                }
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: 'rgba(255, 255, 255, 0.6)',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div style={{ padding: '20px' }}>
            {mode === 'list' ? (
              <>
                <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'rgba(255, 255, 255, 0.6)' }}>
                  {profiles.length <= 1
                    ? 'Personaliza tu perfil o crea perfiles adicionales para separar historiales y favoritos.'
                    : 'Selecciona tu perfil activo o edita sus opciones para mantener tu historial personalizado.'}
                </p>

                {/* Profiles List */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '320px', overflowY: 'auto' }}>
                  {profiles.map(p => {
                    const IconComponent = getProfileAvatarIcon(p.avatar);
                    const isActive = activeProfile?.id === p.id;

                    return (
                      <div
                        key={p.id}
                        onClick={() => handleSelectProfile(p.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '12px 14px',
                          borderRadius: '14px',
                          background: isActive ? 'rgba(59, 130, 246, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                          border: isActive ? `1.5px solid ${p.color || '#3b82f6'}` : '1px solid rgba(255, 255, 255, 0.08)',
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div
                            style={{
                              width: 42,
                              height: 42,
                              borderRadius: '50%',
                              background: p.color || '#3b82f6',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              boxShadow: `0 4px 12px ${p.color}55`,
                              flexShrink: 0,
                            }}
                          >
                            <IconComponent size={22} />
                          </div>
                          <div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: 'white', display: 'flex', alignItems: 'center', gap: 6 }}>
                              {p.name}
                              {isActive && (
                                <span
                                  style={{
                                    fontSize: 10,
                                    padding: '2px 6px',
                                    borderRadius: '10px',
                                    background: 'rgba(59, 130, 246, 0.25)',
                                    color: 'var(--accent-primary, #3b82f6)',
                                    fontWeight: 700,
                                  }}
                                >
                                  Activo
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(255, 255, 255, 0.4)', marginTop: 2 }}>
                              {p.id === 'default' ? 'Perfil Principal' : `Creado ${new Date(p.createdAt).toLocaleDateString()}`}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons on card */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {isActive && <Check size={18} color={p.color || '#3b82f6'} />}

                          {/* Edit Button */}
                          <button
                            onClick={e => handleStartEdit(e, p)}
                            title="Editar perfil"
                            style={{
                              background: 'rgba(255, 255, 255, 0.08)',
                              border: '1px solid rgba(255, 255, 255, 0.15)',
                              color: 'rgba(255, 255, 255, 0.85)',
                              cursor: 'pointer',
                              padding: '6px 8px',
                              borderRadius: '8px',
                              display: 'flex',
                              alignItems: 'center',
                              gap: 4,
                              fontSize: 11,
                              fontWeight: 600,
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <Edit3 size={13} />
                            <span>Editar</span>
                          </button>

                          {/* Delete Button (Only for non-default profiles) */}
                          {p.id !== 'default' && (
                            <button
                              onClick={e => handleDelete(e, p.id)}
                              title="Eliminar perfil"
                              style={{
                                background: 'rgba(239, 68, 68, 0.1)',
                                border: '1px solid rgba(239, 68, 68, 0.2)',
                                color: 'rgba(239, 68, 68, 0.9)',
                                cursor: 'pointer',
                                padding: '6px',
                                borderRadius: '8px',
                                display: 'flex',
                                alignItems: 'center',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add Profile Button */}
                <button
                  onClick={handleStartCreate}
                  style={{
                    marginTop: 16,
                    width: '100%',
                    padding: '11px',
                    borderRadius: '12px',
                    background: 'rgba(255, 255, 255, 0.06)',
                    border: '1px dashed rgba(255, 255, 255, 0.25)',
                    color: 'white',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                  }}
                >
                  <Plus size={16} />
                  <span>Crear Nuevo Perfil</span>
                </button>
              </>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {error && (
                  <div
                    style={{
                      padding: '8px 12px',
                      background: 'rgba(239, 68, 68, 0.15)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                      borderRadius: '8px',
                      color: '#f87171',
                      fontSize: 12,
                      fontWeight: 600,
                    }}
                  >
                    {error}
                  </div>
                )}

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)', marginBottom: 6 }}>
                    Nombre del Perfil
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    placeholder="Ej. ShonenFan, Hermano, Noche..."
                    autoFocus
                    style={{
                      width: '100%',
                      background: 'rgba(0, 0, 0, 0.3)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '10px',
                      padding: '10px 12px',
                      color: 'white',
                      fontSize: 14,
                      outline: 'none',
                    }}
                  />
                </div>

                {/* Avatar Picker */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)', marginBottom: 8 }}>
                    Avatar Temático de Anime
                  </label>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 8,
                      maxHeight: '180px',
                      overflowY: 'auto',
                      paddingRight: '4px',
                    }}
                  >
                    {AVATAR_OPTIONS.map(a => {
                      const Icon = a.Icon;
                      const isSelected = formAvatar === a.id;
                      return (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => setFormAvatar(a.id)}
                          style={{
                            padding: '8px 4px',
                            borderRadius: '10px',
                            background: isSelected ? 'rgba(59, 130, 246, 0.2)' : 'rgba(255, 255, 255, 0.04)',
                            border: isSelected ? `2px solid ${formColor}` : '1px solid rgba(255, 255, 255, 0.08)',
                            color: isSelected ? formColor : 'rgba(255, 255, 255, 0.7)',
                            cursor: 'pointer',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4,
                            transition: 'all 0.15s ease',
                          }}
                        >
                          <Icon size={20} />
                          <span style={{ fontSize: 10, fontWeight: 600 }}>{a.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Color Picker */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'rgba(255, 255, 255, 0.8)', marginBottom: 8 }}>
                    Color Distintivo
                  </label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {COLOR_OPTIONS.map(c => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => setFormColor(c)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: c,
                          border: formColor === c ? '3px solid white' : '1px solid rgba(255, 255, 255, 0.2)',
                          cursor: 'pointer',
                          boxShadow: formColor === c ? `0 0 10px ${c}` : 'none',
                          transition: 'all 0.15s ease',
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('list');
                      setEditingProfile(null);
                    }}
                    style={{
                      background: 'rgba(255, 255, 255, 0.08)',
                      border: '1px solid rgba(255, 255, 255, 0.15)',
                      borderRadius: '10px',
                      padding: '9px 16px',
                      color: 'white',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Volver
                  </button>
                  <button
                    type="submit"
                    style={{
                      background: 'var(--accent-primary, #3b82f6)',
                      border: 'none',
                      borderRadius: '10px',
                      padding: '9px 20px',
                      color: 'white',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(59, 130, 246, 0.4)',
                    }}
                  >
                    {mode === 'create' ? 'Crear Perfil' : 'Guardar Cambios'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
