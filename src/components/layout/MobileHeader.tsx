import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tv2, Heart, Settings, User, Crown, ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAnimeStore } from '@/stores/useAnimeStore';
import { useProfileStore } from '@/stores/useProfileStore';
import { useSubscriptionStore } from '@/stores/useSubscriptionStore';
import { FEATURE_FLAGS } from '@/config/features';
import { ProfileSelectorModal, getProfileAvatarIcon } from '@/components/ProfileSelectorModal';
import { SubscriptionModal } from '@/components/SubscriptionModal';

export function MobileHeader() {
  const navigate = useNavigate();
  const { activeSource, setActiveSource } = useAnimeStore();
  const { activeProfile } = useProfileStore();
  const { isVip, openModal: openVipModal } = useSubscriptionStore();
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isSourceMenuOpen, setIsSourceMenuOpen] = useState(false);
  const sourceMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent | TouchEvent) {
      if (sourceMenuRef.current && !sourceMenuRef.current.contains(event.target as Node)) {
        setIsSourceMenuOpen(false);
      }
    }
    if (isSourceMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('touchstart', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isSourceMenuOpen]);

  const sourcesList = [
    { id: 'jkanime', name: 'Anime', subtitle: 'Servidor Principal', color: 'var(--accent-primary)' },
    { id: 'mundodonghua', name: 'Donghua', subtitle: 'Animación China', color: 'var(--accent-secondary)' },
    { id: 'otakustv', name: 'Respaldo', subtitle: 'Servidor Alternativo', color: '#10b981' },
  ];

  const currentSourceInfo = sourcesList.find(s => s.id === activeSource) || sourcesList[0];
  const ProfileIcon = activeProfile ? getProfileAvatarIcon(activeProfile.avatar) : User;

  return (
    <>
      <header
        style={{
          height: 'calc(54px + env(safe-area-inset-top, 0px))',
          paddingTop: 'env(safe-area-inset-top, 0px)',
          background: 'rgba(15, 16, 22, 0.85)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderBottom: '1px solid var(--border-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingLeft: 14,
          paddingRight: 14,
          position: 'sticky',
          top: 0,
          zIndex: 90,
          flexShrink: 0,
        }}
      >
        {/* Logo & Marca */}
        <div
          onClick={() => navigate('/')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            cursor: 'pointer',
          }}
        >
          <div
            style={{
              width: 28,
              height: 28,
              borderRadius: 'var(--radius-sm)',
              background: 'linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--shadow-glow)',
            }}
          >
            <Tv2 size={16} color="white" />
          </div>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Ani<span style={{ color: 'var(--accent-primary)' }}>CS</span>
          </span>
        </div>

        {/* Selector de Fuentes Desplegable en Móvil */}
        <div ref={sourceMenuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setIsSourceMenuOpen(!isSourceMenuOpen)}
            aria-expanded={isSourceMenuOpen}
            aria-label="Seleccionar catálogo o fuente de animación"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: 'var(--bg-elevated)',
              padding: '5px 11px',
              borderRadius: 'var(--radius-full)',
              border: '1px solid var(--border-subtle)',
              color: 'var(--text-primary)',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'background var(--transition-fast), border-color var(--transition-fast)',
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                backgroundColor: currentSourceInfo.color,
                boxShadow: `0 0 6px ${currentSourceInfo.color}`,
                flexShrink: 0,
              }}
            />
            <span>{currentSourceInfo.name}</span>
            <ChevronDown
              size={13}
              color="var(--text-muted)"
              style={{
                transform: isSourceMenuOpen ? 'rotate(180deg)' : 'none',
                transition: 'transform 0.2s ease',
              }}
            />
          </button>

          <AnimatePresence>
            {isSourceMenuOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.95 }}
                transition={{ duration: 0.15 }}
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 8px)',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  background: 'var(--bg-card)',
                  backdropFilter: 'blur(20px)',
                  WebkitBackdropFilter: 'blur(20px)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: 6,
                  minWidth: 165,
                  boxShadow: '0 12px 30px rgba(0, 0, 0, 0.55)',
                  zIndex: 100,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}
              >
                {sourcesList.map((src) => {
                  const isSelected = activeSource === src.id;
                  return (
                    <button
                      key={src.id}
                      onClick={() => {
                        setActiveSource(src.id as any);
                        setIsSourceMenuOpen(false);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        background: isSelected ? 'var(--bg-elevated)' : 'transparent',
                        border: 'none',
                        color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background var(--transition-fast)',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: '50%',
                            backgroundColor: src.color,
                            boxShadow: isSelected ? `0 0 8px ${src.color}` : 'none',
                            flexShrink: 0,
                          }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                          <span style={{ fontSize: 12, fontWeight: isSelected ? 700 : 500, color: isSelected ? 'white' : 'var(--text-primary)' }}>
                            {src.name}
                          </span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {src.subtitle}
                          </span>
                        </div>
                      </div>
                      {isSelected && <Check size={14} color="var(--accent-primary)" style={{ marginLeft: 6 }} />}
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Acciones directas: Perfil, Favoritos, VIP y Ajustes */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {FEATURE_FLAGS.SHOW_SUBSCRIPTION && (
            <button
              onClick={openVipModal}
              title={isVip ? 'Yumework VIP Activo' : 'Obtener Yumework VIP'}
              style={{
                background: isVip ? 'linear-gradient(135deg, #f59e0b, #d97706)' : 'rgba(245, 158, 11, 0.15)',
                border: isVip ? 'none' : '1px solid rgba(245, 158, 11, 0.3)',
                color: isVip ? '#ffffff' : '#fbbf24',
                padding: '5px 7px',
                borderRadius: 'var(--radius-full)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: isVip ? '0 2px 8px rgba(245, 158, 11, 0.4)' : 'none',
              }}
            >
              <Crown size={15} />
            </button>
          )}

          <button
            onClick={() => setIsProfileModalOpen(true)}
            title={activeProfile ? `Perfil: ${activeProfile.name}` : 'Perfil'}
            style={{
              background: activeProfile?.color || 'var(--accent-primary)',
              border: 'none',
              color: 'white',
              width: 28,
              height: 28,
              borderRadius: '50%',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: `0 2px 6px ${(activeProfile?.color || '#3b82f6')}66`,
            }}
          >
            <ProfileIcon size={14} />
          </button>

          <button
            onClick={() => navigate('/favorites')}
            title="Favoritos"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              padding: 6,
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Heart size={18} />
          </button>

          <button
            onClick={() => navigate('/settings')}
            title="Ajustes"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-secondary)',
              padding: 6,
              borderRadius: 'var(--radius-full)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Settings size={18} />
          </button>
        </div>
      </header>

      <ProfileSelectorModal
        isOpen={isProfileModalOpen}
        onClose={() => setIsProfileModalOpen(false)}
      />
      <SubscriptionModal />
    </>
  );
}
