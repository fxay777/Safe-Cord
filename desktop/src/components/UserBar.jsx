import { ShopIcon } from './Icons';
import React, { useState } from 'react';
import { resolveAssetUrl } from '../api';
import UserProfilePopup, { statusMeta } from './UserProfilePopup';

// Barra de usuário fixa (estilo Discord): avatar + nome, mudo de microfone,
// ensurdecer e acesso rápido às configurações de voz/aparência.
export default function UserBar({
  onOpenShop,
  user, micMuted, deafened, inCall, onToggleMic, onToggleDeafen, onOpenSettings,
  onOpenProfile, onChangeStatus, onOpenAccounts,
}) {
  const [popupOpen, setPopupOpen] = useState(false);
  const name = user?.display_name || user?.username || 'Usuário';
  const initials = (name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const avatarUrl = resolveAssetUrl(user?.avatar_url);
  const currentStatus = statusMeta(user?.status_mode);

  return (
    <div style={styles.wrap}>
      <button type="button" style={styles.identity} onClick={() => setPopupOpen((v) => !v)} title="Seu perfil">
        <div style={styles.avatarWrap}>
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} style={styles.avatarImg} />
          ) : (
            <div style={{ ...styles.avatar, background: user?.avatar_color || 'var(--accent)' }}>{initials || '?'}</div>
          )}
          <div style={{ ...styles.statusDot, background: currentStatus.color }} />
        </div>
        <div style={styles.meta}>
          <div style={styles.name}>{name}</div>
          <div style={styles.tag}>{inCall ? 'Em chamada de voz' : currentStatus.label}</div>
        </div>
      </button>

      <div style={styles.actions}>
        <button
          type="button"
          style={styles.iconBtn(micMuted)}
          onClick={onToggleMic}
          title={micMuted ? 'Ativar microfone' : 'Mutar microfone'}
        >
          <MicIcon muted={micMuted} />
        </button>
        <button
          type="button"
          style={styles.iconBtn(deafened)}
          onClick={onToggleDeafen}
          title={deafened ? 'Parar de ensurdecer' : 'Ensurdecer'}
        >
          <HeadsetIcon deafened={deafened} />
        </button>
        {onOpenShop && (
          <button type="button" style={styles.iconBtn(false)} onClick={onOpenShop} title="Loja e insígnias">
            <ShopIcon size={16} />
          </button>
        )}
        <button type="button" style={styles.iconBtn(false)} onClick={onOpenSettings} title="Configurações de voz e aparência">
          <GearIcon />
        </button>
      </div>

      <UserProfilePopup
        open={popupOpen}
        user={user}
        onClose={() => setPopupOpen(false)}
        onChangeStatus={onChangeStatus}
        onOpenProfileEdit={onOpenProfile}
        onOpenAccounts={onOpenAccounts}
      />
    </div>
  );
}

function MicIcon({ muted }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M19 11a7 7 0 0 1-14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 18v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {muted && <path d="M4 4L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

function HeadsetIcon({ deafened }) {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <rect x="3" y="13" width="4.5" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.8" />
      <rect x="16.5" y="13" width="4.5" height="7" rx="1.6" stroke="currentColor" strokeWidth="1.8" />
      {deafened && <path d="M4 4L20 20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

function GearIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M19.4 13a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V19a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 17.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 13 1.65 1.65 0 0 0 3.17 12H3.1a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 6.99a1.65 1.65 0 0 0-.33-1.82l-.06-.06A2 2 0 1 1 7.04 2.28l.06.06A1.65 1.65 0 0 0 8.92 2.6 1.65 1.65 0 0 0 9.92 1.1V1a2 2 0 1 1 4 0v.09c.03.63.4 1.2.98 1.51.6.28 1.3.2 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82c.28.6.85.98 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const styles = {
  wrap: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: 6,
    margin: '0 8px 8px',
    background: 'var(--bg-elevated)',
    borderRadius: 20,
    flexShrink: 0,
    position: 'relative',
  },
  identity: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-pill)',
    padding: '4px 8px 4px 4px',
    cursor: 'pointer',
    textAlign: 'left',
    transition: 'background 0.12s',
  },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: { width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#fff' },
  avatarImg: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' },
  statusDot: { position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: '50%', border: '3px solid var(--bg-elevated)' },
  meta: { minWidth: 0 },
  name: { fontSize: 13.5, fontWeight: 650, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 118 },
  tag: { fontSize: 11.5, color: 'var(--text-low)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 118 },
  actions: { display: 'flex', gap: 2, flexShrink: 0 },
  iconBtn: (active) => ({
    width: 32,
    height: 32,
    borderRadius: 16,
    border: 'none',
    background: active ? 'color-mix(in srgb, var(--danger) 18%, transparent)' : 'transparent',
    color: active ? 'var(--danger)' : 'var(--text-mid)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    transition: 'background 0.12s, color 0.12s',
  }),
};
