import React from 'react';
import { MicIcon, VideoIcon, CameraOffIcon } from './Icons';

export default function CallPanel({
  active = true,
  participants = [],
  muted = false,
  cameraOn = true,
  onToggleMute,
  onToggleCamera,
  onShareScreen,
  onLeave,
}) {
  if (!active) return null;

  return (
    <div style={styles.wrap}>
      <div style={styles.headerRow}>
        <div>
          <div style={styles.title}>Chamada ativa</div>
          <div style={styles.subtitle}>{participants.length} participantes</div>
        </div>
        <button type="button" style={styles.leaveBtn} onClick={onLeave}>Sair</button>
      </div>

      <div style={styles.list}>
        {participants.map((person) => (
          <div key={person.id} style={styles.memberRow}>
            <div style={{ ...styles.avatar, background: person.color || 'var(--accent)' }}>
              {(person.name || 'U').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?'}
            </div>
            <div style={styles.memberMeta}>
              <div style={styles.memberName}>{person.name}</div>
              <div style={styles.memberStatus}>{person.status || 'online'}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={styles.actions}>
        <button type="button" style={{ ...styles.actionBtn, ...(muted ? styles.actionBtnAlt : {}) }} onClick={onToggleMute}>
          <MicIcon size={16} muted={muted} />
        </button>
        <button type="button" style={{ ...styles.actionBtn, ...(cameraOn ? {} : styles.actionBtnAlt) }} onClick={onToggleCamera}>
          {cameraOn ? <VideoIcon size={16} /> : <CameraOffIcon size={16} />}
        </button>
        <button type="button" style={styles.actionBtnPrimary} onClick={onShareScreen}>Compartilhar tela</button>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 16,
    padding: 14,
    margin: '12px 0',
    boxShadow: '0 12px 32px rgba(0,0,0,0.16)',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  title: { fontSize: 13, fontWeight: 800, color: 'var(--text-hi)' },
  subtitle: { color: 'var(--text-low)', fontSize: 11, marginTop: 2 },
  leaveBtn: {
    border: '1px solid rgba(240,101,79,0.45)',
    background: 'rgba(240,101,79,0.1)',
    color: '#F8B4A8',
    borderRadius: 10,
    padding: '6px 10px',
    fontWeight: 700,
    cursor: 'pointer',
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  memberRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 8px',
    borderRadius: 10,
    background: 'rgba(255,255,255,0.02)',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 10,
    fontWeight: 800,
    color: 'var(--accent-contrast)',
  },
  memberMeta: { flex: 1 },
  memberName: { fontSize: 12, fontWeight: 700, color: 'var(--text-hi)' },
  memberStatus: { fontSize: 10, color: 'var(--text-low)', textTransform: 'lowercase' },
  actions: { display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' },
  actionBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    border: '1px solid var(--border)',
    background: 'var(--bg-base)',
    color: 'var(--text-hi)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBtnAlt: {
    background: 'rgba(240,101,79,0.12)',
    borderColor: 'rgba(240,101,79,0.5)',
  },
  actionBtnPrimary: {
    flex: 1,
    border: 'none',
    borderRadius: 12,
    cursor: 'pointer',
    background: 'var(--accent)',
    color: 'var(--accent-contrast)',
    fontWeight: 800,
    padding: '11px 12px',
  },
};
