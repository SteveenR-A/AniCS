import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tv2, Heart, Settings, User, Crown } from 'lucide-react';
import { motion } from 'framer-motion';
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

        {/* Switcher Anime / Donghua en Móvil */}
        <div
          style={{
            display: 'flex',
            background: 'var(--bg-elevated)',
            padding: 3,
            borderRadius: 'var(--radius-full)',
            border: '1px solid var(--border-subtle)',
            position: 'relative',
          }}
        >
          <button
            onClick={() => setActiveSource('jkanime')}
            style={{
              position: 'relative',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: 'transparent',
              color: activeSource === 'jkanime' ? '#ffffff' : 'var(--text-muted)',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              zIndex: 2,
              transition: 'color var(--transition-fast)',
            }}
          >
            {activeSource === 'jkanime' && (
              <motion.div
                layoutId="mobile-source-pill"
                transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'var(--accent-primary)',
                  borderRadius: 'var(--radius-full)',
                  zIndex: -1,
                  boxShadow: '0 2px 8px rgba(124, 58, 237, 0.4)',
                }}
              />
            )}
            Anime
          </button>

          <button
            onClick={() => setActiveSource('mundodonghua')}
            style={{
              position: 'relative',
              padding: '4px 12px',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: 'transparent',
              color: activeSource === 'mundodonghua' ? '#ffffff' : 'var(--text-muted)',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              zIndex: 2,
              transition: 'color var(--transition-fast)',
            }}
          >
            {activeSource === 'mundodonghua' && (
              <motion.div
                layoutId="mobile-source-pill"
                transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'var(--accent-secondary)',
                  borderRadius: 'var(--radius-full)',
                  zIndex: -1,
                  boxShadow: '0 2px 8px rgba(236, 72, 153, 0.4)',
                }}
              />
            )}
            Donghua
          </button>

          <button
            onClick={() => setActiveSource('otakustv')}
            style={{
              position: 'relative',
              padding: '4px 10px',
              borderRadius: 'var(--radius-full)',
              border: 'none',
              background: 'transparent',
              color: activeSource === 'otakustv' ? '#ffffff' : 'var(--text-muted)',
              fontSize: 11,
              fontWeight: 700,
              cursor: 'pointer',
              zIndex: 2,
              transition: 'color var(--transition-fast)',
            }}
          >
            {activeSource === 'otakustv' && (
              <motion.div
                layoutId="mobile-source-pill"
                transition={{ type: 'spring', stiffness: 450, damping: 30 }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  borderRadius: 'var(--radius-full)',
                  zIndex: -1,
                  boxShadow: '0 2px 8px rgba(16, 185, 129, 0.4)',
                }}
              />
            )}
            Respaldo
          </button>
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
