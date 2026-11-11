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
          <SafeCordMark size={46} />
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
                filter: friendsActive ? 'brightness(0) invert(1)' : 'var(--mono-icon-filter)', opacity: friendsActive ? 1 : 0.75,
              }}
            />
            {pendingFriendRequests > 0 && <span style={styles.badge}>{pendingFriendRequests}</span>}
          </button>
        </div>
      </div>

      <div style={styles.divider} />

      {/* TRAY 2 — servidores: cartão separado, com rótulo próprio e rolagem independente */}
      <div style={styles.serverTray}>
        {servers.length > 0 && <div style={styles.trayLabel}>Servidores</div>}
        <div style={styles.serverList}>
          {servers.map((s) => {
            const iconUrl = resolveAssetUrl(s.icon_url);
            const isOwner = s.owner_id === currentUserId;
            const unread = unreadByServer[s.id] || 0;
            const isActive = s.id === activeId && !friendsActive;
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

const styles = {
  // Barra de servidores direto na moldura do app (sem fundo/borda próprios), como no Stoat
  rail: {
    width: 72,
    flexShrink: 0,
    background: 'transparent',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    padding: '6px 0 0',
    gap: 8,
    height: '100%',
    minHeight: 0,
  },
  homeTray: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  divider: { height: 2, width: 32, borderRadius: 2, background: 'var(--bg-elevated)', alignSelf: 'center', flexShrink: 0 },
  serverTray: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minHeight: 0,
  },
  trayLabel: { display: 'none' },
  serverList: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    overflowY: 'auto',
    flex: 1,
    minHeight: 0,
    width: '100%',
    padding: '2px 0 4px',
  },
  trayActions: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
    padding: '4px 0 2px',
  },
  // Ícone redondo que vira "squircle" quando selecionado
  pill: (active) => ({
    width: 46,
    height: 46,
    borderRadius: active ? 16 : 23,
    background: active ? 'var(--accent)' : 'var(--bg-base)',
    color: active ? 'var(--accent-contrast)' : 'var(--text-mid)',
    border: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 650,
    fontSize: 14,
    cursor: 'pointer',
    transition: 'border-radius 0.18s ease, background 0.15s ease',
  }),
  friendsPill: () => ({}),
  logoBtn: {
    background: 'transparent',
    padding: 0,
    transition: 'transform 0.12s ease',
  },
  // Indicador em pílula na borda esquerda (seleção)
  activeBar: {
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 4,
    height: 36,
    borderRadius: '0 4px 4px 0',
    background: 'var(--text-hi)',
  },
  pillIcon: { width: '100%', height: '100%', objectFit: 'cover' },
  pillWrap: { position: 'relative', width: '100%', display: 'flex', justifyContent: 'center' },
  contextMenu: {
    position: 'absolute', left: 'calc(100% - 6px)', top: 0, width: 200, background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-lg)',
    zIndex: 60, overflow: 'hidden', padding: 6,
  },
  contextMenuTitle: { fontSize: 11.5, fontWeight: 650, color: 'var(--text-low)', padding: '6px 10px 6px' },
  contextBtnDanger: { width: '100%', border: 'none', background: 'transparent', color: 'var(--danger)', textAlign: 'left', padding: '9px 10px', cursor: 'pointer', fontSize: 13, borderRadius: 10 },
  modalWarning: { fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.55, margin: '0 0 18px' },
  modalActionsRow: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  modalCancelBtn: { border: 'none', background: 'transparent', color: 'var(--text-mid)', padding: '10px 16px', borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontWeight: 600 },
  modalDangerBtn: { border: 'none', background: 'var(--danger)', color: '#fff', fontWeight: 650, padding: '10px 18px', borderRadius: 'var(--radius-pill)', cursor: 'pointer' },
  badge: {
    position: 'absolute',
    bottom: -3,
    right: 9,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    background: 'var(--danger)',
    color: '#fff',
    fontSize: 10.5,
    fontWeight: 750,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
    border: '3px solid var(--bg-void)',
  },
  unreadDot: {
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 4,
    height: 8,
    borderRadius: '0 4px 4px 0',
    background: 'var(--text-hi)',
  },
  addBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    background: 'var(--bg-base)',
    color: 'var(--success)',
    border: 'none',
    fontSize: 22,
    fontWeight: 400,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--scrim)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  modal: {
    width: 380,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xl)',
    padding: 24,
    boxShadow: 'var(--shadow-lg)',
  },
  modalTitle: { fontFamily: 'var(--font-display)', fontSize: 18, fontWeight: 700, margin: '0 0 16px' },
  modalInput: {
    width: '100%',
    background: 'var(--bg-elevated)',
    border: '1px solid transparent',
    borderRadius: 14,
    padding: '12px 14px',
    color: 'var(--text-hi)',
    fontSize: 14,
    outline: 'none',
  },
  modalBtn: {
    marginTop: 16,
    width: '100%',
    background: 'var(--accent)',
    color: 'var(--accent-contrast)',
    fontWeight: 650,
    border: 'none',
    borderRadius: 'var(--radius-pill)',
    padding: '11px 0',
    cursor: 'pointer',
    fontSize: 14,
  },
};
