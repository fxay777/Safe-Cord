import React, { useEffect, useRef } from 'react';
import { ScreenShareIcon, CloseIcon } from './Icons';

// Mostra a MediaStream que chegou pelo WebRTC de quem está compartilhando a tela.
export default function ScreenShareViewer({ stream, viewerName, onClose }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current && stream) videoRef.current.srcObject = stream;
  }, [stream]);

  if (!stream) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <span style={styles.title}><ScreenShareIcon size={15} /> Tela de {viewerName || 'alguém'}</span>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Fechar"><CloseIcon size={16} /></button>
        </div>
        <video ref={videoRef} autoPlay playsInline style={styles.video} />
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.82)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 150, padding: 24,
  },
  modal: {
    width: '100%', maxWidth: 1040, background: '#000', borderRadius: 20,
    border: '1px solid var(--border)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '10px 16px', background: 'var(--bg-surface)',
  },
  title: { fontSize: 13, fontWeight: 700, color: 'var(--text-hi)', display: 'flex', alignItems: 'center', gap: 7 },
  closeBtn: { background: 'transparent', border: 'none', color: 'var(--text-mid)', cursor: 'pointer', fontSize: 16 },
  video: { width: '100%', maxHeight: '72vh', display: 'block', background: '#000' },
};
