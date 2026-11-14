import React from 'react';
import {
  GameControllerIcon, GithubIcon, DiceIcon, TwitchIcon,
  PlayCircleIcon, CameraSquareIcon, TikTokIcon, GlobeIcon,
} from './Icons';

// Plataformas que dá pra conectar no perfil (usado pelo editor e pelo cartão de perfil)
export function XLogoIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M4 4l16 16M20 4 4 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export const PLATFORMS = [
  { id: 'discord', label: 'Discord', Icon: GameControllerIcon, placeholder: 'usuario#0000', color: '#5865F2' },
  { id: 'x', label: 'X / Twitter', Icon: XLogoIcon, placeholder: '@usuario', color: '#8899A6' },
  { id: 'instagram', label: 'Instagram', Icon: CameraSquareIcon, placeholder: '@usuario', color: '#E1306C' },
  { id: 'youtube', label: 'YouTube', Icon: PlayCircleIcon, placeholder: '@canal', color: '#FF3B30' },
  { id: 'twitch', label: 'Twitch', Icon: TwitchIcon, placeholder: 'usuario', color: '#9146FF' },
  { id: 'github', label: 'GitHub', Icon: GithubIcon, placeholder: 'usuario', color: '#8B949E' },
  { id: 'steam', label: 'Steam', Icon: DiceIcon, placeholder: 'usuario', color: '#66C0F4' },
  { id: 'tiktok', label: 'TikTok', Icon: TikTokIcon, placeholder: '@usuario', color: '#25C4BE' },
  { id: 'site', label: 'Site', Icon: GlobeIcon, placeholder: 'https://...', color: '#3A9BFF' },
];

export function platformMeta(id) {
  return PLATFORMS.find((p) => p.id === id) || PLATFORMS[PLATFORMS.length - 1];
}
