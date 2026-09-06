import React from 'react';

// Ilustrações originais e leves (SVG puro, sem dependências) pra estados vazios —
// usam a cor do tema, então acompanham qualquer tema escolhido pelo usuário.

// "Nenhum canal selecionado" — bússola apontando pra um balão de conversa
export function EmptyChannelArt({ size = 148 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <circle cx="100" cy="100" r="92" fill="var(--bg-elevated)" />
      <circle cx="100" cy="100" r="92" stroke="var(--border)" strokeWidth="1.5" />
      <g opacity="0.9">
        <path d="M60 78h58a10 10 0 0 1 10 10v28a10 10 0 0 1-10 10H92l-16 14v-14H60a10 10 0 0 1-10-10V88a10 10 0 0 1 10-10Z" fill="var(--bg-surface)" stroke="var(--border)" strokeWidth="2" />
        <circle cx="76" cy="102" r="4" fill="var(--accent)" />
        <circle cx="93" cy="102" r="4" fill="var(--accent)" />
        <circle cx="110" cy="102" r="4" fill="var(--accent)" />
      </g>
      <g transform="translate(122,54)">
        <circle cx="20" cy="20" r="22" fill="var(--accent-gradient)" opacity="0.15" />
        <circle cx="20" cy="20" r="15" fill="none" stroke="var(--accent)" strokeWidth="2.5" />
        <path d="M20 11v4M20 25v4M11 20h4M25 20h4" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" />
        <path d="m25 15-7 10 10-7-3-3Z" fill="var(--accent)" />
      </g>
    </svg>
  );
}

// "Nenhuma conversa ainda" — dois balões de conversa se cumprimentando
export function EmptyDMArt({ size = 140 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <circle cx="100" cy="100" r="92" fill="var(--bg-elevated)" />
      <circle cx="100" cy="100" r="92" stroke="var(--border)" strokeWidth="1.5" />
      <path
        d="M46 70h56a12 12 0 0 1 12 12v22a12 12 0 0 1-12 12H80l-18 16v-16h-16a12 12 0 0 1-12-12V82a12 12 0 0 1 12-12Z"
        fill="var(--accent-gradient)" opacity="0.9"
      />
      <path
        d="M108 96h44a10 10 0 0 1 10 10v18a10 10 0 0 1-10 10h-8v13l-15-13h-21a10 10 0 0 1-10-10v-18a10 10 0 0 1 10-10Z"
        fill="var(--bg-surface)" stroke="var(--border)" strokeWidth="2"
      />
      <circle cx="126" cy="115" r="3.4" fill="var(--text-low)" />
      <circle cx="140" cy="115" r="3.4" fill="var(--text-low)" />
      <circle cx="154" cy="115" r="3.4" fill="var(--text-low)" />
    </svg>
  );
}

// "Você ainda não tem amigos" — mão acenando dentro de um coração-conexão
export function EmptyFriendsArt({ size = 140 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
      <circle cx="100" cy="100" r="92" fill="var(--bg-elevated)" />
      <circle cx="100" cy="100" r="92" stroke="var(--border)" strokeWidth="1.5" />
      <circle cx="72" cy="92" r="26" fill="var(--bg-surface)" stroke="var(--accent)" strokeWidth="2.5" />
      <circle cx="128" cy="92" r="26" fill="var(--accent-gradient)" opacity="0.85" />
      <circle cx="72" cy="84" r="9" fill="var(--accent)" opacity="0.5" />
      <path d="M58 108c4 6 10 9 14 9s10-3 14-9" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <circle cx="128" cy="84" r="9" fill="var(--bg-void)" opacity="0.7" />
      <path d="M114 108c4 6 10 9 14 9s10-3 14-9" stroke="var(--bg-void)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7" />
      <path d="M92 96q8-10 16 0" stroke="var(--text-hi)" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.5" />
    </svg>
  );
}

// "Sem mensagens ainda neste canal" — pena de pato/pluma escrevendo, pra usar no chat vazio
export function EmptyMessagesArt({ size = 96 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" fill="none">
      <circle cx="60" cy="60" r="56" fill="var(--bg-elevated)" />
      <path d="M40 74 78 36a8 8 0 0 1 11 11L51 85l-16 5 5-16Z" fill="var(--accent-gradient)" opacity="0.9" />
      <path d="M70 44l6 6" stroke="var(--bg-void)" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
    </svg>
  );
}
