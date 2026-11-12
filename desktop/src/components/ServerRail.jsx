import React, { useEffect, useState } from 'react';
import { resolveAssetUrl } from '../api';
import logoSquare from '../assets/logo-square.png';
import { CompassIcon, PlusIcon } from './Icons';

export default function ServerRail({ servers, activeId, onSelect, onCreate, onJoin, friendsActive, onOpenFriends, pendingFriendRequests = 0, currentUserId, onLeaveServer, onDeleteServer, unreadByServer = {} }) {
  const [showModal, setShowModal] = useState(null); // 'create' | 'join' | null
  const [value, setValue] = useState('');
  const [contextMenuFor, setContextMenuFor] = useState(null);
  const [confirmDeleteFor, setConfirmDeleteFor] = useState(null);
  const [addMenuOpen, setAddMenuOpen] = useState(null); // null | {x, y}
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [brokenIcons, setBrokenIcons] = useState(() => new Set()); // ícones que falharam ao carregar

  // Fecha os menus (+ e clique direito) ao clicar em qualquer outro lugar ou apertar Esc
  useEffect(() => {
    if (!addMenuOpen && !contextMenuFor) return undefined;
    const close = (e) => {
      if (e.type === 'keydown' && e.key !== 'Escape') return;
      if (e.target?.closest?.('[data-rail-menu]')) return;
      setAddMenuOpen(null);
      setContextMenuFor(null);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [addMenuOpen, contextMenuFor]);

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
      {/* Logo = início (Amigos e conversas), igual à referência */}
      <div style={styles.pillWrap}>
        {friendsActive && <span style={styles.activeBar} />}
        <button type="button" style={styles.logoBtn} title="Início — amigos e conversas" onClick={onOpenFriends}>
          <img src={logoSquare} alt="SafeCord" style={styles.logoImg} draggable={false} />
          {pendingFriendRequests > 0 && <span style={styles.badge}>{pendingFriendRequests}</span>}
        </button>
      </div>

      <div style={styles.divider} />

      {/* Servidores logo abaixo, e o "+" colado no último — tudo no topo */}
      <div style={styles.serverList}>
        {servers.map((s) => {
          const rawIcon = resolveAssetUrl(s.icon_url);
          const iconUrl = rawIcon && !brokenIcons.has(s.id) ? rawIcon : null;
          const isOwner = s.owner_id === currentUserId;
          const unread = unreadByServer[s.id] || 0;
          const isActive = s.id === activeId && !friendsActive;
          const color = s.color || '#1E7BFF';
          return (
            <div key={s.id} style={styles.pillWrap}>
              {isActive ? <span style={styles.activeBar} /> : unread > 0 ? <span style={styles.unreadDot} /> : null}
              <button
                onClick={() => onSelect(s.id)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  setMenuPos({ x: r.right + 10, y: r.top });
                  setContextMenuFor((prev) => (prev === s.id ? null : s.id));
                }}
                style={{
                  ...styles.serverIcon(isActive),
                  background: iconUrl ? 'var(--bg-elevated)' : `radial-gradient(circle at 30% 25%, color-mix(in srgb, ${color} 55%, #ffffff), ${color} 55%, color-mix(in srgb, ${color} 70%, #000000))`,
                }}
                title={s.name}
              >
                {iconUrl ? (
                  <img
                    src={iconUrl}
                    alt={s.name}
                    style={styles.serverIconImg}
                    draggable={false}
                    onError={() => setBrokenIcons((prev) => new Set(prev).add(s.id))}
                  />
                ) : (
                  <span style={styles.serverInitials}>{initials(s.name)}</span>
                )}
              </button>
              {unread > 0 && !isActive && <span style={styles.badge}>{unread > 99 ? '99+' : unread}</span>}

              {contextMenuFor === s.id && (
                <div data-rail-menu style={{ ...styles.contextMenu, left: menuPos.x, top: menuPos.y }}>
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

        <div style={styles.pillWrap}>
          <button
            type="button"
            className="sc-icon-btn"
            data-rail-menu
            style={{ ...styles.addBtn, ...(addMenuOpen ? { background: 'var(--bg-hover)', color: 'var(--text-hi)' } : {}) }}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setAddMenuOpen((v) => (v ? null : { x: r.right + 10, y: r.top }));
            }}
            title="Criar ou entrar em um servidor"
          >
            <PlusIcon size={18} />
          </button>
          {addMenuOpen && (
            <div data-rail-menu style={{ ...styles.contextMenu, left: addMenuOpen.x, top: addMenuOpen.y }}>
              <button type="button" style={styles.menuItem} onClick={() => { setShowModal('create'); setAddMenuOpen(null); }}>
                <PlusIcon size={15} /> Criar servidor
              </button>
              <button type="button" style={styles.menuItem} onClick={() => { setShowModal('join'); setAddMenuOpen(null); }}>
                <CompassIcon size={15} /> Entrar com convite
              </button>
            </div>
          )}
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
    gap: 10,
    height: '100%',
    minHeight: 0,
  },
  divider: { height: 2, width: 28, borderRadius: 2, background: 'var(--border)', alignSelf: 'center', flexShrink: 0 },
  // A lista só ocupa o espaço que precisa (o "+" fica logo embaixo do último servidor);
  // com muitos servidores, ela rola.
  serverList: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 10,
    overflowY: 'auto',
    overflowX: 'visible',
    minHeight: 0,
    flex: '0 1 auto',
    padding: '4px 0 8px',
    scrollbarWidth: 'none',
  },
  pillWrap: { position: 'relative', width: '100%', display: 'flex', justifyContent: 'center', flexShrink: 0 },
  logoBtn: {
    position: 'relative',
    width: 46,
    height: 46,
    padding: 0,
    border: 'none',
    borderRadius: 14,
    background: '#016FFC',
    cursor: 'pointer',
    boxShadow: '0 8px 22px rgba(30, 123, 255, 0.35)',
  },
  logoImg: { width: '100%', height: '100%', display: 'block', borderRadius: 14, objectFit: 'cover' },
  // Servidor: círculo com a imagem preenchendo tudo; o selecionado ganha anel azul com brilho
  serverIcon: (active) => ({
    width: 46,
    height: 46,
    padding: 0,
    borderRadius: '50%',
    border: 'none',
    cursor: 'pointer',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    boxShadow: active
      ? '0 0 0 2px var(--bg-void), 0 0 0 4px var(--accent), 0 0 20px var(--accent-glow)'
      : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
    transition: 'box-shadow 0.18s ease, transform 0.12s ease',
  }),
  serverIconImg: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  serverInitials: { color: '#fff', fontWeight: 700, fontSize: 15, letterSpacing: -0.3, textShadow: '0 1px 4px rgba(0,0,0,0.3)' },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: '50%',
    transform: 'translateY(-50%)',
    width: 4,
    height: 34,
    borderRadius: '0 4px 4px 0',
    background: 'var(--text-hi)',
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
    pointerEvents: 'none',
  },
  addBtn: {
    width: 46,
    height: 46,
    borderRadius: '50%',
    background: 'var(--bg-base)',
    color: 'var(--text-mid)',
    border: '1px solid var(--border)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItem: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 9, border: 'none', background: 'transparent',
    color: 'var(--text-hi)', textAlign: 'left', padding: '9px 10px', cursor: 'pointer', fontSize: 13, borderRadius: 10,
  },
  contextMenu: {
    position: 'fixed', width: 200, background: 'var(--bg-elevated)',
    border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-lg)',
    zIndex: 60, overflow: 'hidden', padding: 6,
  },
  contextMenuTitle: { fontSize: 11.5, fontWeight: 650, color: 'var(--text-low)', padding: '6px 10px 6px' },
  contextBtnDanger: { width: '100%', border: 'none', background: 'transparent', color: 'var(--danger)', textAlign: 'left', padding: '9px 10px', cursor: 'pointer', fontSize: 13, borderRadius: 10 },
  modalWarning: { fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.55, margin: '0 0 18px' },
  modalActionsRow: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  modalCancelBtn: { border: 'none', background: 'transparent', color: 'var(--text-mid)', padding: '10px 16px', borderRadius: 'var(--radius-pill)', cursor: 'pointer', fontWeight: 600 },
  modalDangerBtn: { border: 'none', background: 'var(--danger)', color: '#fff', fontWeight: 650, padding: '10px 18px', borderRadius: 'var(--radius-pill)', cursor: 'pointer' },
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
