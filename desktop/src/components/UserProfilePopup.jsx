import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditIcon, UserIcon, CheckIcon, ChevronDownIcon } from './Icons';
import ProfileCard from './ProfileCard';

export const STATUS_OPTIONS = [
  { id: 'online', label: 'Ativo', color: 'var(--success)' },
  { id: 'idle', label: 'Ausente', color: '#F0B429' },
  { id: 'dnd', label: 'Não incomodar', color: 'var(--danger)' },
  { id: 'invisible', label: 'Invisível', color: 'var(--text-low)' },
];

export function statusMeta(statusMode) {
  if (statusMode === 'offline') return { id: 'offline', label: 'Offline', color: 'var(--text-low)' };
  return STATUS_OPTIONS.find((s) => s.id === statusMode) || STATUS_OPTIONS[0];
}

// Seu cartão ao clicar no próprio avatar: perfil completo + status, editar perfil e trocar de conta.
// Renderizado num portal com posição fixa, ancorado na barra de usuário — assim não é cortado
// pelas colunas com overflow escondido.
export default function UserProfilePopup({ open, user, anchorRef, onClose, onChangeStatus, onOpenProfileEdit, onOpenAccounts }) {
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  useLayoutEffect(() => {
    if (!open) return undefined;
    function place() {
      const r = anchorRef?.current?.getBoundingClientRect();
      if (!r) { setPos({ left: 12, bottom: 80 }); return; }
      const width = 300;
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos({ left, bottom: Math.max(8, window.innerHeight - r.top + 8) });
    }
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [open, anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    function handleClickOutside(e) {
      if (ref.current?.contains(e.target)) return;
      if (anchorRef?.current?.contains(e.target)) return; // o próprio botão alterna
      onClose();
    }
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  useEffect(() => { if (!open) setStatusMenuOpen(false); }, [open]);

  if (!open || !pos) return null;
  const currentStatus = statusMeta(user?.status_mode);

  function pickStatus(id) {
    onChangeStatus?.(id);
    setStatusMenuOpen(false);
  }

  return createPortal(
    <div
      ref={ref}
      data-own-profile-popup
      style={{ position: 'fixed', left: pos.left, bottom: pos.bottom, zIndex: 400, maxHeight: `calc(100vh - ${pos.bottom + 12}px)`, overflowY: 'auto', borderRadius: 20 }}
      onClick={(e) => e.stopPropagation()}
    >
      <ProfileCard user={user} width={300}>
        <div style={styles.divider} />
        <div style={styles.statusPickerWrap}>
          <button type="button" style={styles.statusPickerBtn} onClick={() => setStatusMenuOpen((v) => !v)}>
            <span style={{ ...styles.statusDotSm, background: currentStatus.color }} />
            <span style={{ flex: 1, textAlign: 'left' }}>{currentStatus.label}</span>
            <ChevronDownIcon size={12} style={{ transform: statusMenuOpen ? 'rotate(180deg)' : 'none', color: 'var(--text-low)' }} />
          </button>
          {statusMenuOpen && (
            <div style={styles.statusMenu}>
              {STATUS_OPTIONS.map((s) => (
                <button key={s.id} type="button" style={styles.statusMenuItem} onClick={() => pickStatus(s.id)}>
                  <span style={{ ...styles.statusDotSm, background: s.color }} />
                  <span style={{ flex: 1, textAlign: 'left' }}>{s.label}</span>
                  {user?.status_mode === s.id && <CheckIcon size={12} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <button type="button" style={styles.actionBtn} onClick={() => { onOpenProfileEdit?.(); onClose(); }}>
          <EditIcon size={13} /> Editar perfil
        </button>
        <button type="button" style={styles.actionBtn} onClick={() => { onOpenAccounts?.(); onClose(); }}>
          <UserIcon size={13} /> Mudar de conta
        </button>
      </ProfileCard>
    </div>,
    document.body,
  );
}

export function SpotifyMiniCard({ track, compact = false }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);

  if (!track) return null;

  function togglePreview(e) {
    e.stopPropagation();
    if (!track.preview_url) return;
    if (!audioRef.current) {
      audioRef.current = new Audio(track.preview_url);
      audioRef.current.addEventListener('ended', () => setPlaying(false));
    }
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  }

  return (
    <div style={{ ...styles.spotifyCard, ...(compact ? styles.spotifyCardCompact : {}) }}>
      {track.image && <img src={track.image} alt="" style={styles.spotifyArt} />}
      <div style={styles.spotifyMeta}>
        <div style={styles.spotifyTitle}>{track.name}</div>
        <div style={styles.spotifyArtist}>{track.artists}</div>
      </div>
      {track.preview_url && (
        <button type="button" style={styles.spotifyPlayBtn} onClick={togglePreview} title={playing ? 'Pausar prévia' : 'Tocar prévia (30s)'}>
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
      )}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M8 5v14l11-7L8 5Z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
      <path d="M7 5h4v14H7zM13 5h4v14h-4z" />
    </svg>
  );
}

const styles = {
  popup: {
    position: 'absolute', bottom: '100%', left: 8, marginBottom: 8, width: 280,
    background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
    boxShadow: 'var(--shadow-lg)', overflow: 'hidden', zIndex: 60,
  },
  hero: { height: 64, position: 'relative' },
  avatarWrap: { position: 'absolute', left: 14, bottom: -26 },
  avatarImg: { width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '4px solid var(--bg-surface)', display: 'block' },
  avatarFallback: {
    width: 56, height: 56, borderRadius: '50%', border: '4px solid var(--bg-surface)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', color: 'var(--accent-contrast)', fontWeight: 800, fontSize: 18,
  },
  statusDot: {
    position: 'absolute', bottom: 2, right: 2, width: 15, height: 15, borderRadius: '50%',
    border: '3px solid var(--bg-surface)',
  },
  body: { padding: '34px 14px 14px' },
  name: { fontSize: 15, fontWeight: 800, color: 'var(--text-hi)' },
  tagRow: { display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 2 },
  tag: { fontSize: 11.5, color: 'var(--text-low)', marginBottom: 8 },
  bio: { fontSize: 12, color: 'var(--text-mid)', lineHeight: 1.5, marginBottom: 8 },
  quickRow: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 4 },
  spotifyCard: {
    display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: 8, marginBottom: 8,
  },
  spotifyCardCompact: { padding: 6, marginBottom: 0 },
  spotifyArt: { width: 34, height: 34, borderRadius: 9, objectFit: 'cover', flexShrink: 0 },
  spotifyMeta: { flex: 1, minWidth: 0 },
  spotifyTitle: { fontSize: 11.5, fontWeight: 700, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  spotifyArtist: { fontSize: 10.5, color: 'var(--text-low)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  spotifyPlayBtn: {
    width: 26, height: 26, borderRadius: '50%', border: 'none', background: '#1DB954', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  },
  quickChip: {
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 600, color: 'var(--text-mid)',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 8px',
  },
  divider: { height: 1, background: 'var(--border)', margin: '10px 0' },
  statusPickerWrap: { position: 'relative', marginBottom: 8 },
  statusPickerBtn: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 10px',
    color: 'var(--text-hi)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  },
  chevron: { fontSize: 8, color: 'var(--text-low)' },
  statusDotSm: { width: 9, height: 9, borderRadius: '50%', flexShrink: 0 },
  statusMenu: {
    position: 'absolute', bottom: '100%', left: 0, right: 0, marginBottom: 4, background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', overflow: 'hidden', boxShadow: 'var(--shadow-lg)',
  },
  statusMenuItem: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'transparent', border: 'none',
    padding: '9px 10px', color: 'var(--text-hi)', fontSize: 12.5, cursor: 'pointer',
  },
  actionBtn: {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'transparent',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '9px 10px',
    color: 'var(--text-mid)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', marginBottom: 6,
  },
};
