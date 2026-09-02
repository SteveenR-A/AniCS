import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PlayCircle, Clock, CheckCircle2, Heart, ChevronDown } from 'lucide-react';
import type { FavoriteStatus } from '@/types';

export const FAVORITE_STATUSES: { key: FavoriteStatus; label: string; color: string; bg: string; icon: React.FC<{ size: number; color?: string }> }[] = [
  { key: 'watching', label: 'Viendo', color: '#3b82f6', bg: 'rgba(59, 130, 246, 0.15)', icon: PlayCircle },
  { key: 'plan_to_watch', label: 'Pendiente', color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.15)', icon: Clock },
  { key: 'completed', label: 'Completado', color: '#10b981', bg: 'rgba(16, 185, 129, 0.15)', icon: CheckCircle2 },
  { key: 'favorite', label: 'Favorito', color: '#ec4899', bg: 'rgba(236, 72, 153, 0.15)', icon: Heart },
];

interface FavoriteStatusDropdownProps {
  currentStatus: string;
  onSelectStatus: (status: FavoriteStatus) => void;
  size?: 'sm' | 'md';
}

export const FavoriteStatusDropdown: React.FC<FavoriteStatusDropdownProps> = ({
  currentStatus,
  onSelectStatus,
  size = 'md',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const matched = FAVORITE_STATUSES.find(s => s.key === currentStatus) || FAVORITE_STATUSES[3];
  const IconComponent = matched.icon;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const isSmall = size === 'sm';

  return (
    <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: isSmall ? 4 : 6,
          padding: isSmall ? '3px 8px' : '6px 12px',
          borderRadius: isSmall ? 6 : 'var(--radius-md)',
          background: matched.bg,
          color: matched.color,
          border: `1px solid ${matched.color}40`,
          fontSize: isSmall ? 11 : 12,
          fontWeight: 700,
          cursor: 'pointer',
          transition: 'all 0.15s ease',
        }}
      >
        <IconComponent size={isSmall ? 12 : 14} color={matched.color} />
        <span>{matched.label}</span>
        <ChevronDown size={isSmall ? 12 : 14} style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease' }} />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 4 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.12 }}
            style={{
              position: 'absolute',
              top: '100%',
              left: 0,
              zIndex: 100,
              background: 'var(--bg-surface)',
              border: '1px solid var(--border-moderate)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 10px 25px rgba(0,0,0,0.4)',
              minWidth: 140,
              overflow: 'hidden',
              padding: 4,
            }}
          >
            {FAVORITE_STATUSES.map(item => {
              const ItemIcon = item.icon;
              const isSelected = item.key === currentStatus;
              return (
                <button
                  key={item.key}
                  onClick={() => {
                    onSelectStatus(item.key);
                    setIsOpen(false);
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: isSelected ? item.bg : 'transparent',
                    color: isSelected ? item.color : 'var(--text-secondary)',
                    fontSize: 12,
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.1s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'var(--bg-elevated)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) {
                      e.currentTarget.style.background = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  <ItemIcon size={14} color={item.color} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
