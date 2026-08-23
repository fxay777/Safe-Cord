import React from 'react';
import { SpeakerIcon, MicIcon } from './Icons';

export default function VoiceBar({ channelName, participants, muted, error, onToggleMute, onLeave, myUsername }) {
  return (
    <div style={styles.wrap}>
      <div style={styles.info}>
        <span style={styles.liveDot} />
        <div>
          <div style={styles.title}>Voz conectada</div>
          <div style={styles.channel}><SpeakerIcon size={12} /> {channelName}</div>
        </div>
      </div>

      {error && <div style={styles.errorLine}>{error}</div>}

      <div style={styles.participants}>
        <Chip name={myUsername} muted={muted} you />
        {participants.map((p) => (
          <Chip key={p.socketId} name={p.user?.username || '...'} />
        ))}
      </div>

      <div style={styles.actions}>
        <button style={styles.btn(muted)} onClick={onToggleMute} title={muted ? 'Ativar microfone' : 'Mutar microfone'}>
          <MicIcon size={15} muted={muted} />
        </button>
        <button style={styles.leaveBtn} onClick={onLeave}>
          Sair
        </button>
      </div>
    </div>
  );
}

function Chip({ name, muted, you }) {
  return (
    <div style={styles.chip}>
      <span style={styles.chipDot} />
      {name}
      {you ? ' (você)' : ''}
      {muted && <MicIcon size={11} muted style={{ marginLeft: 3 }} />}
    </div>
  );
}

const styles = {
  wrap: {
    background: 'var(--bg-elevated)',
    borderTop: '1px solid var(--border)',
    padding: '10px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  info: { display: 'flex', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' },
  title: { fontSize: 11, color: 'var(--success)', fontWeight: 700 },
  channel: { fontSize: 12.5, color: 'var(--text-hi)', display: 'flex', alignItems: 'center', gap: 5 },
  errorLine: { fontSize: 11, color: 'var(--danger)', background: 'rgba(240,101,79,0.1)', borderRadius: 6, padding: '5px 8px' },
  participants: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: {
    fontSize: 11.5,
    background: 'var(--bg-hover)',
    borderRadius: 20,
    padding: '3px 9px',
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    color: 'var(--text-mid)',
  },
  chipDot: { width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)' },
  actions: { display: 'flex', gap: 8 },
  btn: (active) => ({
    flex: 1,
    background: active ? 'var(--danger)' : 'var(--bg-hover)',
    color: active ? '#fff' : 'var(--text-hi)',
    border: 'none',
    borderRadius: 8,
    padding: '7px 0',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  leaveBtn: {
    flex: 1,
    background: 'transparent',
    border: '1px solid var(--danger)',
    color: 'var(--danger)',
    borderRadius: 8,
    padding: '7px 0',
    cursor: 'pointer',
    fontSize: 12.5,
    fontWeight: 600,
  },
};
