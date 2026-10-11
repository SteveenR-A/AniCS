import { getProfileAvatarIcon } from '@/components/ProfileSelectorModal';
import { isProfileImage } from '@/utils/profileImages';

export function DesktopProfileAvatar({ avatar, size = 24 }: { avatar: string; size?: number }) {
  return isProfileImage(avatar)
    ? <img src={avatar} alt="Imagen del perfil" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
    : createElement(getProfileAvatarIcon(avatar), { size });
}
import { createElement } from 'react';
