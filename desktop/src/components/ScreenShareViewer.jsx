import React, { useEffect, useRef, useState } from 'react';
import { ScreenShareIcon, CloseIcon, MaximizeIcon } from './Icons';

// Mostra a MediaStream que chegou pelo WebRTC de quem está compartilhando a tela.
export default function ScreenShareViewer({ stream, viewerName, onClose }) {
  const videoRef = useRef(null);
  const boxRef = useRef(null);
  const [res, setRes] = useState('');

  useEffect(() => {
    const v = videoRef.current;
    if (!v || !stream) return undefined;
    // O som da tela já toca pelo <audio> da chamada: o vídeo fica mudo pra não dobrar o som
    v.muted = true;
    v.srcObject = stream;
    v.play().catch(() => {});
    const onSize = () => setRes(v.videoWidth ? `${v.videoWidth}×${v.videoHeight}` : '');
    v.addEventListener('resize', onSize);
    return () => v.removeEventListener('resize', onSize);
  }, [stream]);

  useEffect(() => {
    if (!stream) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !document.fullscreenElement) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stream, onClose]);

  function fullscreen() {
    const el = boxRef.current;
    if (document.fullscreenElement) document.exitFullscreen?.();
    else el?.requestFullscreen?.().catch(() => {});
  }

  if (!stream) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()} data-screen-viewer>
        <div style={styles.header}>
          <span style={styles.title}><ScreenShareIcon size={15} /> Tela de {viewerName || 'alguém'}{res && <span style={styles.res}>{res}</span>}</span>
          <span style={{ display: 'flex', gap: 4 }}>
            <button style={styles.closeBtn} onClick={fullscreen} aria-label="Tela cheia" title="Tela cheia"><MaximizeIcon size={16} /></button>
            <button style={styles.closeBtn} onClick={onClose} aria-label="Fechar"><CloseIcon size={16} /></button>
          </span>
        </div>
        <div ref={boxRef} style={styles.videoBox} onDoubleClick={fullscreen}>
          <video ref={videoRef} autoPlay playsInline muted style={styles.video} />
        </div>
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
  closeBtn: { background: 'transparent', border: 'none', color: 'var(--text-mid)', cursor: 'pointer', fontSize: 16, width: 32, height: 32, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  videoBox: { background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  video: { width: '100%', maxHeight: '78vh', height: '100%', objectFit: 'contain', display: 'block', background: '#000' },
  res: { fontSize: 11, fontWeight: 600, color: 'var(--text-low)', marginLeft: 6 },
};
