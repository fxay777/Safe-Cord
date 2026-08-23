import React, { useState } from 'react';
import { resolveAssetUrl } from '../api';
import friendsIcon from '../assets/friends-icon.png';
import { CompassIcon } from './Icons';
import SafeCordMark from './SafeCordMark';

export default function ServerRail({ servers, activeId, onSelect, onCreate, onJoin, friendsActive, onOpenFriends, pendingFriendRequests = 0, currentUserId, onLeaveServer, onDeleteServer, unreadByServer = {} }) {
  const [showModal, setShowModal] = useState(null); // 'create' | 'join' | null
  const [value, setValue] = useState('');
  const [contextMenuFor, setContextMenuFor] = useState(null);
  const [confirmDeleteFor, setConfirmDeleteFor] = useState(null);

  function initials(name) {
    return name
      .split(' ')
      .map((w) => w[0])
      .slice(0, 2)
      .join('')
      .toUpperCase();
  }

  async function confirm() {
    if (!value.trim()) return;
    if (showModal === 'create') await onCreate(value.trim());
    else await onJoin(value.trim());
    setValue('');
    setShowModal(null);
  }

  return (
    <div style={styles.rail}>
      {/* TRAY 1 — hub pessoal: marca + Amigos, sempre visível e destacado num cartão próprio */}
      <div style={styles.homeTray}>
        <button
          type="button"
          style={{ ...styles.pill(false), ...styles.logoBtn, border: 'none' }}
          title="Voltar para o início"
          onClick={onOpenFriends}
        >
          <SafeCordMark />
        </button>

        <div style={styles.pillWrap}>
          {friendsActive && <span style={styles.activeBar} />}
          <button
            type="button"
            style={{ ...styles.pill(friendsActive), ...styles.friendsPill(friendsActive), position: 'relative' }}
            title="Amigos"
            onClick={onOpenFriends}
          >
            <img
              src={friendsIcon}
              alt="Amigos"
              style={{
                width: 22,
                height: 22,
                filter: friendsActive ? 'brightness(0) saturate(100%)' : 'brightness(0) invert(1)',
              }}
            />
            {pendingFriendRequests > 0 && <span style={styles.badge}>{pendingFriendRequests}</span>}
          </button>
        </div>
      </div>

      {/* TRAY 2 — servidores: cartão separado, com rótulo próprio e rolagem independente */}
      <div style={styles.serverTray}>
        {servers.length > 0 && <div style={styles.trayLabel}>Servidores</div>}
        <div style={styles.serverList}>
          {servers.map((s) => {
            const iconUrl = resolveAssetUrl(s.icon_url);
            const isOwner = s.owner_id === currentUserId;
            const unread = unreadByServer[s.id] || 0;
            const isActive = s.id === activeId;
            return (
              <div key={s.id} style={styles.pillWrap}>
                {isActive && <span style={styles.activeBar} />}
                <button
                  onClick={() => onSelect(s.id)}
                  onContextMenu={(e) => { e.preventDefault(); setContextMenuFor((prev) => (prev === s.id ? null : s.id)); }}
                  style={{
                    ...styles.pill(isActive),
                    padding: 0,
                    overflow: 'hidden',
                    background: iconUrl ? styles.pill(isActive).background : (s.color || 'var(--accent)'),
                    color: iconUrl ? styles.pill(isActive).color : 'var(--accent-contrast)',
                  }}
                  title={s.name}
                >
                  {iconUrl ? (
                    <img src={iconUrl} alt={s.name} style={styles.pillIcon} />
                  ) : (
                    initials(s.name)
                  )}
                </button>
                {unread > 0 && !isActive && <span style={styles.unreadDot} />}

                {contextMenuFor === s.id && (
                  <div style={styles.contextMenu} onMouseLeave={() => setContextMenuFor(null)}>
                    <div style={styles.contextMenuTitle}>{s.name}</div>
                    {isOwner ? (
                      <button
                        type="button"
                        style={styles.contextBtnDanger}
                        onClick={() => { setConfirmDeleteFor(s.id); setContextMenuFor(null); }}
                      >
                        Excluir servidor
                      </button>
                    ) : (
                      <button
                        type="button"
                        style={styles.contextBtnDanger}
                        onClick={() => { onLeaveServer?.(s.id); setContextMenuFor(null); }}
                      >
                        Sair do servidor
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div style={styles.trayActions}>
          <button style={styles.addBtn} onClick={() => setShowModal('create')} title="Criar servidor">
            +
          </button>
          <button style={styles.addBtn} onClick={() => setShowModal('join')} title="Entrar com convite">
            <CompassIcon size={17} />
          </button>
        </div>
      </div>

      {confirmDeleteFor && (
        <div style={styles.overlay} onClick={() => setConfirmDeleteFor(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Excluir "{servers.find((s) => s.id === confirmDeleteFor)?.name}"?</h3>
            <p style={styles.modalWarning}>
              Isso apaga o servidor pra sempre — canais, mensagens, cargos e categorias juntos. Não dá pra desfazer.
            </p>
            <div style={styles.modalActionsRow}>
              <button style={styles.modalCancelBtn} onClick={() => setConfirmDeleteFor(null)}>Cancelar</button>
              <button
                style={styles.modalDangerBtn}
                onClick={() => { onDeleteServer?.(confirmDeleteFor); setConfirmDeleteFor(null); }}
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div style={styles.overlay} onClick={() => setShowModal(null)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>
              {showModal === 'create' ? 'Criar um servidor' : 'Entrar com convite'}
            </h3>
            <input
              autoFocus
              style={styles.modalInput}
              placeholder={showModal === 'create' ? 'Nome do servidor' : 'Código do convite'}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && confirm()}
            />
            <button style={styles.modalBtn} onClick={confirm}>
              {showModal === 'create' ? 'Criar' : 'Entrar'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Mascote original do SafeCord — uma coruja estilizada (vigilância/proteção, combina
// com o "Safe" do nome). Traço geométrico próprio, sem relação com nenhuma marca de terceiros.

const styles = {
  rail: {
    width: 72,
    background: 'var(--bg-void)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: '14px 0',
    gap: 10,
    borderRight: '1px solid var(--border)',
    height: '100%',
    minHeight: 0,
  },
  homeTray: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
    padding: '8px 0 14px',
    margin: '0 10px',
    borderBottom: '1px solid var(--border)',
  },
  serverTray: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minHeight: 0,
    padding: '2px 0',
  },
  trayLabel: {
    fontSize: 8.5,
    fontWeight: 800,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: 'var(--text-low)',
    marginBottom: 2,
  },
  serverList: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    overflowY: 'auto',
    flex: 1,
    minHeight: 0,
    width: '100%',
    paddingBottom: 4,
  },
  trayActions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
    paddingTop: 4,
  },
  pill: (active) => ({
    width: 46,
    height: 46,
    borderRadius: active ? 14 : 23,
    background: active ? 'var(--accent-gradient)' : 'var(--bg-surface)',
    color: active ? 'var(--accent-contrast)' : 'var(--text-mid)',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 700,
    fontSize: 13,
    cursor: 'pointer',
    boxShadow: active ? '0 4px 18px var(--accent-glow)' : 'none',
    transition: 'border-radius 0.15s, background 0.15s, box-shadow 0.15s',
  }),
  friendsPill: (active) => ({
    boxShadow: active ? '0 0 0 1px var(--accent)' : 'none',
  }),
  logoBtn: {
    transition: 'border-radius 0.15s, transform 0.12s',
  },
  activeBar: {
    position: 'absolute',
    bottom: -6,
    left: '50%',
    transform: 'translateX(-50%)',
    width: 18,
    height: 3,
    borderRadius: 3,
    background: 'var(--accent)',
  },
  pillIcon: { width: '100%', height: '100%', objectFit: 'cover' },
  pillWrap: { position: 'relative' },
  contextMenu: {
    position: 'absolute', left: 'calc(100% + 8px)', top: 0, width: 190, background: '#171D27',
    border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, boxShadow: 'var(--shadow-lg)',
    zIndex: 60, overflow: 'hidden', padding: '4px 0',
  },
  contextMenuTitle: { fontSize: 10.5, fontWeight: 700, color: 'var(--text-low)', padding: '8px 12px 4px', textTransform: 'uppercase', letterSpacing: 0.4 },
  contextBtnDanger: { width: '100%', border: 'none', background: 'transparent', color: '#FCA5A5', textAlign: 'left', padding: '10px 12px', cursor: 'pointer', fontSize: 12.5 },
  modalWarning: { fontSize: 12.5, color: 'var(--text-mid)', lineHeight: 1.5, margin: '0 0 16px' },
  modalActionsRow: { display: 'flex', justifyContent: 'flex-end', gap: 10 },
  modalCancelBtn: { border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-mid)', padding: '9px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' },
  modalDangerBtn: { border: 'none', background: 'var(--danger)', color: '#fff', fontWeight: 700, padding: '9px 14px', borderRadius: 'var(--radius-sm)', cursor: 'pointer' },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    background: 'var(--danger)',
    color: '#fff',
    fontSize: 10,
    fontWeight: 800,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 3px',
    border: '2px solid var(--bg-void)',
  },
  unreadDot: {
    position: 'absolute',
    left: -4,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 8,
    height: 8,
    borderRadius: '50%',
    background: '#fff',
    boxShadow: '0 0 0 2px var(--bg-void)',
  },
  addBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    background: 'var(--bg-surface)',
    color: 'var(--accent)',
    border: '1px dashed var(--border)',
    fontSize: 18,
    cursor: 'pointer',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(6,10,14,0.5)',
    backdropFilter: 'blur(5px)',
    WebkitBackdropFilter: 'blur(5px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  modal: {
    width: 320,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)',
    padding: 20,
  },
  modalTitle: { fontFamily: 'var(--font-display)', fontSize: 16, margin: '0 0 14px' },
  modalInput: {
    width: '100%',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)',
    padding: '9px 10px',
    color: 'var(--text-hi)',
    fontSize: 13.5,
  },
  modalBtn: {
    marginTop: 14,
    width: '100%',
    background: 'var(--accent)',
    color: 'var(--accent-contrast)',
    fontWeight: 700,
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    padding: '9px 0',
    cursor: 'pointer',
  },
};
