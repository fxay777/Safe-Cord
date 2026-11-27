import React, { useEffect, useRef, useState } from 'react';
import { SpeakerIcon, MicIcon, ScreenShareIcon, StopShareIcon, MusicIcon } from './Icons';
import Soundboard from './Soundboard';

export default function VoiceBar({
  channelName, participants, muted, error, onToggleMute, onLeave, myUsername,
  screenSharing, onToggleScreenShare, remoteScreenShares, onViewScreenShare, soundboard = null,
}) {
  const sharingPeers = (participants || []).filter((p) => remoteScreenShares?.has(p.socketId));
  const [boardOpen, setBoardOpen] = useState(false);
  const boardBtnRef = useRef(null);
  // "Fulano tocou Buzina" por uns segundos
  const [flash, setFlash] = useState(null);
  useEffect(() => {
    const ls = soundboard?.lastSound;
    if (!ls) return undefined;
    setFlash(ls);
    const t = setTimeout(() => setFlash(null), 3200);
    return () => clearTimeout(t);
  }, [soundboard?.lastSound?.at]); // eslint-disable-line react-hooks/exhaustive-deps

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
        <Chip name={myUsername} muted={muted} you sharing={screenSharing} />
        {participants.map((p) => (
          <Chip
            key={p.socketId}
            name={p.user?.username || '...'}
            sharing={remoteScreenShares?.has(p.socketId)}
            onClickShare={() => onViewScreenShare?.(p.socketId)}
          />
        ))}
      </div>

      {flash && (
        <div style={styles.soundFlash} data-sound-flash>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: flash.color, flexShrink: 0 }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><strong>{flash.by?.username}</strong> tocou {flash.name}</span>
        </div>
      )}
      {boardOpen && soundboard && (
        <Soundboard api={soundboard.api} serverId={soundboard.serverId} anchorRef={boardBtnRef} onPlay={soundboard.play} onClose={() => setBoardOpen(false)} />
      )}

      {sharingPeers.length > 0 && (
        <div style={styles.shareHint}>
          <ScreenShareIcon size={13} style={{ flexShrink: 0 }} /> {sharingPeers.map((p) => p.user?.username).join(', ')} compartilhando —
          <button style={styles.shareHintBtn} onClick={() => onViewScreenShare?.(sharingPeers[0].socketId)}>
            assistir
          </button>
        </div>
      )}

      <div style={styles.actions}>
        <button style={styles.btn(muted)} onClick={onToggleMute} title={muted ? 'Ativar microfone' : 'Mutar microfone'}>
          <MicIcon size={15} muted={muted} />
        </button>
        <button
          style={styles.shareBtn(screenSharing)}
          onClick={onToggleScreenShare}
          title={screenSharing ? 'Parar de compartilhar' : 'Compartilhar tela'}
        >
          {screenSharing ? <StopShareIcon size={15} /> : <ScreenShareIcon size={15} />}
        </button>
        {soundboard && (
          <button ref={boardBtnRef} style={styles.btn(false)} onClick={() => setBoardOpen((v) => !v)} title="Soundboard" data-soundboard-btn>
            <MusicIcon size={15} />
          </button>
        )}
        <button style={styles.leaveBtn} onClick={onLeave}>
          Sair
        </button>
      </div>
    </div>
  );
}

function Chip({ name, muted, you, sharing, onClickShare }) {
  return (
    <div
      style={{ ...styles.chip, ...(sharing ? styles.chipSharing : {}) }}
      onClick={sharing && !you ? onClickShare : undefined}
    >
      <span style={styles.chipDot} />
      {name}
      {you ? ' (você)' : ''}
      {muted && <MicIcon size={11} muted style={{ marginLeft: 3 }} />}
      {sharing && <ScreenShareIcon size={12} style={{ marginLeft: 4, color: 'var(--accent)' }} />}
    </div>
  );
}

const styles = {
  soundFlash: { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, color: 'var(--text-mid)', background: 'var(--bg-elevated)', borderRadius: 10, padding: '6px 9px', margin: '0 0 8px', animation: 'scFadeIn 120ms ease-out' },
  wrap: {
    background: 'var(--bg-elevated)',
    margin: '0 8px 8px',
    borderRadius: 20,
    padding: '12px 12px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
  },
  info: { display: 'flex', alignItems: 'center', gap: 8 },
  liveDot: { width: 8, height: 8, borderRadius: '50%', background: 'var(--success)' },
  title: { fontSize: 11, color: 'var(--success)', fontWeight: 700 },
  channel: { fontSize: 12.5, color: 'var(--text-hi)', display: 'flex', alignItems: 'center', gap: 5 },
  errorLine: { fontSize: 11, color: 'var(--danger)', background: 'rgba(240,101,79,0.1)', borderRadius: 9, padding: '5px 8px' },
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
  chipSharing: { background: 'color-mix(in srgb, var(--accent) 18%, transparent)', color: 'var(--text-hi)', cursor: 'pointer' },
  shareHint: {
    fontSize: 11.5, color: 'var(--text-mid)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)',
    borderRadius: 12, padding: '6px 9px', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
  },
  shareHintBtn: {
    background: 'transparent', border: 'none', color: 'var(--accent)',
    fontWeight: 700, cursor: 'pointer', fontSize: 11.5, padding: 0,
  },
  shareBtn: (active) => ({
    flex: 1,
    background: active ? 'var(--accent)' : 'var(--bg-hover)',
    color: active ? 'var(--accent-contrast)' : 'var(--text-hi)',
    border: 'none', borderRadius: 'var(--radius-pill)', padding: '8px 0', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14,
  }),
  actions: { display: 'flex', gap: 8 },
  btn: (active) => ({
    flex: 1,
    background: active ? 'var(--danger)' : 'var(--bg-hover)',
    color: active ? '#fff' : 'var(--text-hi)',
    border: 'none',
    borderRadius: 'var(--radius-pill)',
    padding: '8px 0',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  }),
  leaveBtn: {
    flex: 1,
    background: 'var(--danger)',
    border: 'none',
    color: '#fff',
    borderRadius: 'var(--radius-pill)',
    padding: '8px 0',
    cursor: 'pointer',
    fontSize: 12.5,
    fontWeight: 600,
  },
};
