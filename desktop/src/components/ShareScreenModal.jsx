import React from 'react';
import { MonitorIcon, WindowIcon, MicIcon } from './Icons';

export default function ShareScreenModal({ open, onClose, onShare }) {
  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <h3 style={styles.title}>Compartilhar tela</h3>
          <button type="button" style={styles.close} onClick={onClose}>×</button>
        </div>

        <div style={styles.grid}>
          <div style={styles.option}>
            <div style={styles.icon}><MonitorIcon size={26} /></div>
            <div style={styles.optionText}>Tela inteira</div>
          </div>
          <div style={styles.option}>
            <div style={styles.icon}><WindowIcon size={26} /></div>
            <div style={styles.optionText}>Janela</div>
          </div>
          <div style={styles.option}>
            <div style={styles.icon}><MicIcon size={24} /></div>
            <div style={styles.optionText}>Áudio do sistema</div>
          </div>
        </div>

        <button type="button" style={styles.primary} onClick={() => { onShare?.(); onClose(); }}>
          Começar compartilhamento
        </button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(6,10,14,0.55)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
    padding: 20,
  },
  modal: {
    width: 420,
    background: 'var(--bg-surface)',
    borderRadius: 20,
    border: '1px solid var(--border)',
    boxShadow: '0 18px 60px rgba(0,0,0,0.45)',
    padding: 18,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  title: { margin: 0, fontSize: 20, fontFamily: 'var(--font-display)' },
  close: {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-mid)',
    fontSize: 26,
    cursor: 'pointer',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: 12,
    marginBottom: 16,
  },
  option: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    background: 'var(--bg-base)',
    border: '1px solid var(--border)',
    borderRadius: 14,
    padding: '16px 12px',
    minHeight: 110,
  },
  icon: { color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  optionText: { fontSize: 12, color: 'var(--text-mid)', textAlign: 'center' },
  primary: {
    width: '100%',
    border: 'none',
    borderRadius: 12,
    background: 'var(--accent)',
    color: 'var(--accent-contrast)',
    fontWeight: 800,
    padding: '11px 14px',
    cursor: 'pointer',
  },
};
