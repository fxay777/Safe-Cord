import React, { useEffect, useState } from 'react';
import UserBar from './UserBar';
import VoiceBar from './VoiceBar';
import { TrashIcon, SpeakerIcon, GearIcon, CheckIcon, HashIcon, ChevronDownIcon, UserPlusIcon, ImageIcon, PlusIcon, UsersIcon, TicketIcon, LockIcon } from './Icons';
import SafeCordMark from './SafeCordMark';
import { resolveAssetUrl } from '../api';

function NewChannelForm({ name, setName, type, setType, onConfirm, onCancel, error }) {
  return (
    <div style={styles.newChannelForm}>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onConfirm()}
        placeholder="nome-do-canal"
        style={styles.newChannelInput}
      />
      <div style={styles.newChannelTypeRow}>
        <button type="button" style={styles.typeToggle(type === 'text')} onClick={() => setType('text')}># Texto</button>
        <button type="button" style={styles.typeToggle(type === 'voice')} onClick={() => setType('voice')}>
          <SpeakerIcon size={13} /> Voz
        </button>
      </div>
      {error && <div style={styles.newChannelError}>{error}</div>}
      <div style={styles.newChannelActions}>
        <button type="button" style={styles.newChannelCancel} onClick={onCancel}>Cancelar</button>
        <button type="button" style={styles.newChannelConfirm} onClick={onConfirm}>Criar</button>
      </div>
    </div>
  );
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB — o servidor otimiza/comprime depois
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];

export default function ChannelSidebar({
  server,
  activeChannelId,
  onSelectChannel,
  user,
  voiceChannelId,
  categories = [],
  members = [],
  myPermissions = { isOwner: false, permissions: [] },
  roles = [],
  onCreateGroup,
  onRenameGroup,
  onDeleteGroup,
  onCreateRole,
  onUpdateRole,
  onDeleteRole,
  onAssignMemberRoles,
  onCreateChannel,
  onDeleteChannel,
  unreadByChannel = {},
  onUpdateServer,
  onRegenerateInvite,
  onDeleteServer,
  onLeaveServer,
  themeAccent = '#4CC2F0',
  micMuted = false,
  deafened = false,
  inCall = false,
  onToggleMic,
  onToggleDeafen,
  onOpenSettings,
  onOpenShop,
  onOpenProfile,
  onChangeStatus,
  onOpenAccounts,
  voicePresence = {},
  voiceConnected = false,
  voiceChannelName,
  voiceParticipants = [],
  voiceError = '',
  onToggleVoiceMute,
  onLeaveVoice,
  onUploadServerImage,
  onRemoveServerImage,
  onOpenServerSettings,
}) {
  const [collapsedCategories, setCollapsedCategories] = useState(() => new Set());
  const [newChannelFor, setNewChannelFor] = useState(null); // null | 'root' | categoryId
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState('text');
  const [channelError, setChannelError] = useState('');
  const [inviteCopied, setInviteCopied] = useState(false);

  const isServerOwner = server?.owner_id === user?.id;
  const perms = myPermissions?.permissions || [];
  const canManageChannels = isServerOwner || myPermissions?.isOwner || perms.includes('criar_canais');
  const canDeleteChannels = isServerOwner || myPermissions?.isOwner || perms.includes('gerenciar_canais');
  const canManageRoles = isServerOwner || myPermissions?.isOwner || perms.includes('gerenciar_cargos');
  const canManageMembers = isServerOwner || myPermissions?.isOwner || perms.includes('gerenciar_membros');
  const canManageServer = isServerOwner || myPermissions?.isOwner || perms.includes('gerenciar_servidor');
  const canOpenSettings = canManageChannels || canDeleteChannels || canManageRoles || canManageMembers || canManageServer;

  if (!server) {
    return <div style={styles.wrap} />;
  }

  const textChannels = server.channels.filter((c) => c.type === 'text');
  const voiceChannels = server.channels.filter((c) => c.type === 'voice');

  const sortedCategories = [...categories].sort((a, b) => a.position - b.position);
  const uncategorized = server.channels
    .filter((c) => !c.category_id || !sortedCategories.some((cat) => cat.id === c.category_id))
    .sort((a, b) => a.position - b.position);
  const channelsByCategory = new Map();
  sortedCategories.forEach((cat) => channelsByCategory.set(cat.id, []));
  server.channels.forEach((c) => {
    if (c.category_id && channelsByCategory.has(c.category_id)) channelsByCategory.get(c.category_id).push(c);
  });
  channelsByCategory.forEach((list) => list.sort((a, b) => a.position - b.position));

  function toggleCategoryCollapsed(id) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openNewChannelForm(target) {
    setNewChannelFor(target);
    setNewChannelName('');
    setNewChannelType('text');
    setChannelError('');
  }

  async function submitNewChannel() {
    const trimmed = newChannelName.trim();
    if (!trimmed) return;
    try {
      await onCreateChannel?.(trimmed, newChannelType, newChannelFor === 'root' ? null : newChannelFor);
      setNewChannelFor(null);
      setNewChannelName('');
    } catch (err) {
      setChannelError(err?.response?.data?.error || 'Não foi possível criar o canal');
    }
  }

  async function handleDeleteChannel(channelId, event) {
    event.stopPropagation();
    if (!onDeleteChannel) return;
    try {
      await onDeleteChannel(channelId);
    } catch (err) {
      // erro silencioso na UI compacta — o servidor já bloqueia o que não pode
    }
  }

  function copyInvite(event) {
    event?.stopPropagation();
    navigator.clipboard?.writeText(server.invite_code || '');
    setInviteCopied(true);
    setTimeout(() => setInviteCopied(false), 1600);
  }

  function renderChannelBtn(c) {
    const isVoice = c.type === 'voice';
    const isActive = isVoice ? c.id === voiceChannelId : c.id === activeChannelId;
    const unread = !isVoice ? (unreadByChannel[c.id] || 0) : 0;
    const peopleHere = isVoice ? (voicePresence[c.id] || []) : [];
    return (
      <React.Fragment key={c.id}>
        <div style={styles.channelRow(isActive)} className={isActive ? "sc-channel-row sc-active" : "sc-channel-row"}>
          <button
            onClick={() => onSelectChannel(c)}
            style={{ ...styles.channelBtn(isActive, unread > 0), ...(c.ticket?.status === 'closed' && !isActive ? { opacity: 0.55 } : {}) }}
            title={c.ticket ? `Ticket #${String(c.ticket.number).padStart(4, '0')} · ${c.ticket.option_label}${c.ticket.status === 'closed' ? ' (fechado)' : ''}` : undefined}
            data-channel-id={c.id}
          >
            <span style={styles.hash}>{isVoice ? <SpeakerIcon size={15} /> : c.ticket ? <TicketIcon size={15} /> : <HashIcon size={15} />}</span>
            <span style={styles.channelName}>{c.name}</span>
            {c.ticket?.status === 'closed' && <LockIcon size={12} style={{ flexShrink: 0, opacity: 0.8 }} />}
            {unread > 0 && !isActive && (
              <span style={styles.channelUnreadBadge}>{unread > 99 ? '99+' : unread}</span>
            )}
            {isVoice && peopleHere.length > 0 && (
              <span style={styles.voiceCount(isActive)}><UsersIcon size={12} /> {peopleHere.length}</span>
            )}
          </button>
          {isActive && !isVoice ? (
            <button type="button" style={styles.channelInlineBtn(true)} title={inviteCopied ? 'Convite copiado!' : `Convidar (copia o código #${server.invite_code})`} onClick={copyInvite}>
              {inviteCopied ? <CheckIcon size={14} /> : <UserPlusIcon size={15} />}
            </button>
          ) : canDeleteChannels ? (
            <button
              type="button"
              className="sc-channel-delete"
              style={styles.channelInlineBtn(false)}
              title="Excluir canal"
              onClick={(e) => handleDeleteChannel(c.id, e)}
            >
              <TrashIcon size={13} />
            </button>
          ) : null}
        </div>

        {peopleHere.length > 0 && (
          <div style={styles.voiceMemberList}>
            {peopleHere.map((p) => {
              const name = p.display_name || p.username;
              const avatarUrl = resolveAssetUrl(p.avatar_url);
              const initials = (name || '?').slice(0, 1).toUpperCase();
              return (
                <div key={p.id} style={styles.voiceMemberRow}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={name} style={styles.voiceMemberAvatarImg} />
                  ) : (
                    <div style={{ ...styles.voiceMemberAvatar, background: p.avatar_color || 'var(--accent)' }}>{initials}</div>
                  )}
                  <span style={styles.voiceMemberName}>{name}</span>
                </div>
              );
            })}
          </div>
        )}
      </React.Fragment>
    );
  }

  function openProfile() {
    onOpenProfile?.();
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.brand}>
        <SafeCordMark size={22} />
        <div style={{ minWidth: 0 }}>
          <div style={styles.brandName}>SafeCord</div>
          <div style={styles.brandTagline}>Conecte. Converse. Compartilhe.</div>
        </div>
      </div>

      <ServerCard
        server={server}
        canManage={canManageServer}
        canOpenSettings={canOpenSettings}
        onOpenSettings={() => onOpenServerSettings?.('overview')}
        onUploadServerImage={onUploadServerImage}
        onRemoveServerImage={onRemoveServerImage}
      />

      <div style={styles.channelList}>
        {uncategorized.map(renderChannelBtn)}

        {sortedCategories.map((category) => {
          const collapsed = collapsedCategories.has(category.id);
          const channels = channelsByCategory.get(category.id) || [];
          // Categoria vazia só aparece pra quem cria canais (ex.: "Tickets" sem nenhum ticket seu)
          if (channels.length === 0 && !canManageChannels) return null;
          return (
            <div key={category.id} style={styles.categoryBlock}>
              <button type="button" style={styles.categoryHeader} onClick={() => toggleCategoryCollapsed(category.id)}>
                <span style={{ ...styles.categoryChevron, transform: collapsed ? 'rotate(-90deg)' : 'none' }}><ChevronDownIcon size={13} /></span>
                <span style={styles.categoryName}>{category.name}</span>
                {canManageChannels && (
                  <span
                    role="button"
                    tabIndex={0}
                    style={styles.categoryAddBtn}
                    onClick={(e) => { e.stopPropagation(); openNewChannelForm(category.id); }}
                    title="Adicionar canal nesta categoria"
                  >
                    <PlusIcon size={14} />
                  </span>
                )}
              </button>
              {!collapsed && channels.map(renderChannelBtn)}
              {!collapsed && newChannelFor === category.id && (
                <NewChannelForm
                  name={newChannelName}
                  setName={setNewChannelName}
                  type={newChannelType}
                  setType={setNewChannelType}
                  onConfirm={submitNewChannel}
                  onCancel={() => setNewChannelFor(null)}
                  error={channelError}
                />
              )}
            </div>
          );
        })}

        {newChannelFor === 'root' && (
          <NewChannelForm
            name={newChannelName}
            setName={setNewChannelName}
            type={newChannelType}
            setType={setNewChannelType}
            onConfirm={submitNewChannel}
            onCancel={() => setNewChannelFor(null)}
            error={channelError}
          />
        )}

        {canManageChannels && newChannelFor === null && (
          <button type="button" style={styles.addChannelLink} onClick={() => openNewChannelForm('root')}>
            <PlusIcon size={14} /> Adicionar canal
          </button>
        )}
      </div>

      {voiceConnected && (
        <VoiceBar
          channelName={voiceChannelName}
          participants={voiceParticipants}
          muted={micMuted}
          error={voiceError}
          onToggleMute={onToggleVoiceMute}
          onLeave={onLeaveVoice}
          myUsername={user?.display_name || user?.username}
        />
      )}

      <UserBar
        user={user}
        micMuted={micMuted}
        deafened={deafened}
        inCall={inCall}
        onToggleMic={onToggleMic}
        onToggleDeafen={onToggleDeafen}
        onOpenSettings={onOpenSettings}
        onOpenShop={onOpenShop}
        onOpenProfile={openProfile}
        onChangeStatus={onChangeStatus}
        onOpenAccounts={onOpenAccounts}
      />

    </div>
  );
}

// Card do servidor no topo da barra (banner + nome + descrição), como no layout de referência.
// Dono/gerente troca o banner e o ícone direto aqui.
function ServerCard({ server, canManage, canOpenSettings, onOpenSettings, onUploadServerImage, onRemoveServerImage }) {
  const [uploading, setUploading] = useState(null);
  const [error, setError] = useState('');
  const bannerUrl = resolveAssetUrl(server.banner_url);
  const iconUrl = resolveAssetUrl(server.icon_url);
  const color = server.color || 'var(--accent)';

  async function pick(kind, event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onUploadServerImage) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return setError('Use PNG, JPG, WEBP ou GIF.');
    if (file.size > 8 * 1024 * 1024) return setError('Imagem muito grande (máx. 8MB).');
    setError('');
    setUploading(kind);
    try {
      await onUploadServerImage(kind, file);
    } catch (err) {
      setError(err?.response?.data?.error || 'Falha ao enviar a imagem');
    } finally {
      setUploading(null);
    }
  }

  return (
    <div style={styles.serverCardWrap}>
      <div
        className="sc-server-card"
        style={{
          ...styles.serverCard,
          ...(bannerUrl
            ? { backgroundImage: `linear-gradient(180deg, rgba(5,10,22,0.05) 30%, rgba(5,10,22,0.82) 100%), url(${bannerUrl})` }
            : { backgroundImage: `radial-gradient(circle at 85% 20%, rgba(255,255,255,0.22), transparent 38%), radial-gradient(circle at 18% 30%, rgba(255,255,255,0.10) 0 1.5px, transparent 2px), linear-gradient(140deg, color-mix(in srgb, ${color} 85%, #050A16), #0A1430 95%)` }),
          opacity: uploading === 'banner' ? 0.6 : 1,
        }}
      >
        <div style={styles.serverCardTop}>
          {iconUrl && <img src={iconUrl} alt="" style={styles.serverCardIcon} />}
          <div style={{ flex: 1 }} />
          {canManage && onUploadServerImage && (
            <label className="sc-card-action" style={styles.serverCardBtn} title={bannerUrl ? 'Trocar banner' : 'Adicionar banner'}>
              <ImageIcon size={14} />
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={(e) => pick('banner', e)} />
            </label>
          )}
          {canOpenSettings && (
            <button type="button" style={styles.serverCardBtn} onClick={onOpenSettings} title="Configurações do servidor">
              <GearIcon size={14} />
            </button>
          )}
        </div>
        <div style={styles.serverCardName}>{server.name}</div>
        <div style={styles.serverCardDesc}>{server.description || 'Bem-vindo ao servidor!'}</div>
      </div>
      {canManage && onUploadServerImage && (
        <div style={styles.serverCardLinks}>
          <label style={styles.serverCardLink}>
            {uploading === 'icon' ? 'Enviando ícone…' : iconUrl ? 'Trocar ícone' : 'Adicionar ícone'}
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={(e) => pick('icon', e)} />
          </label>
          {bannerUrl && (
            <button type="button" style={styles.serverCardLink} onClick={() => onRemoveServerImage?.('banner')}>Remover banner</button>
          )}
        </div>
      )}
      {error && <div style={styles.serverCardError}>{error}</div>}
    </div>
  );
}


// Aba "Geral" das configurações do servidor: nome, descrição, cor de destaque e convite —
// personalização completa do grupo, tudo salvo no backend.

const styles = {
  wrap: {
    width: '100%',
    flex: 1,
    minHeight: 0,
    background: 'var(--bg-base)',
    display: 'flex',
    flexDirection: 'column',
  },
  header: {
    height: 56,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 12px 0 18px',
    flexShrink: 0,
  },
  headerActions: { display: 'flex', alignItems: 'center', gap: 8 },
  headerName: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 15.5, color: 'var(--text-hi)' },
  inviteCode: { fontSize: 11, color: 'var(--text-mid)', fontFamily: 'ui-monospace, monospace', background: 'var(--bg-elevated)', border: 'none', borderRadius: 'var(--radius-pill)', padding: '4px 9px' },
  serverMenuBtn: { width: 30, height: 30, borderRadius: 15, border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  section: { padding: '14px 10px 4px' },
  featureStack: {
    padding: '0 10px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: 650,
    letterSpacing: 0.1,
    color: 'var(--text-low)',
    padding: '0 10px 8px',
  },
  // Linha do canal: o selecionado fica com o fundo azul sólido (texto branco), igual à referência
  channelRow: (active) => ({
    display: 'flex', alignItems: 'center', gap: 2, marginBottom: 2, borderRadius: 12,
    background: active ? 'var(--accent)' : 'transparent',
    boxShadow: active ? '0 6px 18px var(--accent-glow)' : 'none',
  }),
  channelBtn: (active, unread) => ({
    flex: 1,
    minWidth: 0,
    textAlign: 'left',
    background: 'transparent',
    color: active ? 'var(--accent-contrast)' : unread ? 'var(--text-hi)' : 'var(--text-mid)',
    border: 'none',
    borderRadius: 12,
    padding: '8px 10px',
    fontSize: 14,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    fontWeight: active || unread ? 600 : 450,
  }),
  channelName: { flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  channelUnreadBadge: {
    background: 'var(--accent)',
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 6px',
    flexShrink: 0,
  },
  voiceCount: (active) => ({
    display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, flexShrink: 0,
    color: active ? 'var(--accent-contrast)' : 'var(--text-low)',
  }),
  channelInlineBtn: (onAccent) => ({
    width: 30, height: 30, flexShrink: 0, marginRight: 3, border: 'none', borderRadius: 10, background: 'transparent',
    color: onAccent ? 'var(--accent-contrast)' : 'var(--text-low)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }),
  hash: { color: 'inherit', opacity: 0.75, display: 'inline-flex', flexShrink: 0 },
  brand: { display: 'flex', alignItems: 'center', gap: 10, padding: '16px 16px 12px', flexShrink: 0 },
  brandName: { fontSize: 15, fontWeight: 750, color: 'var(--text-hi)', letterSpacing: -0.2 },
  brandTagline: { fontSize: 11, color: 'var(--text-low)', marginTop: 1 },
  serverCardWrap: { padding: '0 10px 10px', flexShrink: 0 },
  serverCard: {
    position: 'relative', height: 112, borderRadius: 16, padding: '10px 12px 12px',
    backgroundSize: 'cover', backgroundPosition: 'center', display: 'flex', flexDirection: 'column',
    border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)', overflow: 'hidden',
    boxShadow: 'inset 0 0 40px rgba(30,123,255,0.15)',
  },
  serverCardTop: { display: 'flex', alignItems: 'center', gap: 6, flex: 1, alignSelf: 'stretch' },
  serverCardIcon: { width: 26, height: 26, borderRadius: 8, objectFit: 'cover', alignSelf: 'flex-start' },
  serverCardBtn: {
    width: 28, height: 28, borderRadius: 9, border: 'none', background: 'rgba(5,10,22,0.35)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', alignSelf: 'flex-start',
  },
  serverCardName: { fontSize: 17, fontWeight: 750, color: '#fff', letterSpacing: -0.2, textShadow: '0 1px 8px rgba(0,0,0,0.35)' },
  serverCardDesc: {
    fontSize: 11.5, color: 'rgba(235,242,255,0.82)', lineHeight: 1.35, marginTop: 2,
    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
  },
  serverCardLinks: { display: 'flex', gap: 12, padding: '6px 4px 0' },
  serverCardLink: { border: 'none', background: 'transparent', color: 'var(--text-low)', fontSize: 11.5, cursor: 'pointer', padding: 0 },
  serverCardError: { fontSize: 11.5, color: 'var(--danger)', padding: '4px 4px 0' },
  inlineCheck: { display: 'inline-flex', alignItems: 'center', gap: 4 },
  channelList: { padding: '4px 8px 4px', flex: 1, minHeight: 0, overflowY: 'auto' },
  voiceMemberList: { display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0 6px 30px' },
  voiceMemberRow: { display: 'flex', alignItems: 'center', gap: 7, padding: '2px 4px' },
  voiceMemberAvatar: {
    width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, fontWeight: 800, color: 'var(--accent-contrast)', flexShrink: 0,
  },
  voiceMemberAvatarImg: { width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  voiceMemberName: { fontSize: 12, color: 'var(--text-low)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  channelDeleteBtn: {
    flexShrink: 0, width: 26, height: 26, borderRadius: 13, border: 'none', background: 'transparent',
    color: 'var(--text-low)', fontSize: 10.5, cursor: 'pointer', opacity: 0.7,
  },
  categoryBlock: { marginTop: 10 },
  categoryHeader: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none',
    cursor: 'pointer', padding: '6px 10px', marginBottom: 2,
  },
  categoryChevron: { color: 'var(--text-low)', display: 'inline-flex', transition: 'transform 0.15s ease' },
  categoryName: { flex: 1, textAlign: 'left', fontSize: 12, fontWeight: 650, letterSpacing: 0.1, color: 'var(--text-low)' },
  categoryAddBtn: { color: 'var(--text-low)', cursor: 'pointer', padding: '0 4px', display: 'inline-flex' },
  addChannelLink: {
    width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-low)',
    fontSize: 13, padding: '9px 14px', cursor: 'pointer', marginTop: 4, borderRadius: 'var(--radius-pill)',
  },
  newChannelForm: {
    background: 'var(--bg-elevated)', border: 'none', borderRadius: 18, padding: 12,
    margin: '4px 0 8px', display: 'flex', flexDirection: 'column', gap: 8,
  },
  newChannelInput: {
    width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12,
    color: 'var(--text-hi)', fontSize: 12.5, padding: '7px 9px',
  },
  newChannelTypeRow: { display: 'flex', gap: 6 },
  typeToggle: (active) => ({
    flex: 1, fontSize: 11.5, padding: '6px 8px', borderRadius: 10, cursor: 'pointer',
    border: active ? '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' : '1px solid var(--border)',
    background: active ? 'color-mix(in srgb, var(--accent) 15%, transparent)' : 'transparent',
    color: active ? 'var(--text-hi)' : 'var(--text-mid)',
  }),
  newChannelError: { fontSize: 11, color: 'var(--danger)' },
  newChannelActions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  newChannelCancel: { border: 'none', background: 'transparent', color: 'var(--text-mid)', fontSize: 12, padding: '7px 12px', borderRadius: 'var(--radius-pill)', cursor: 'pointer' },
  newChannelConfirm: { border: 'none', background: 'var(--accent)', color: 'var(--accent-contrast)', fontWeight: 650, fontSize: 12, padding: '7px 14px', borderRadius: 'var(--radius-pill)', cursor: 'pointer' },
  generalBox: { display: 'flex', flexDirection: 'column', gap: 10 },
  dangerZone: { marginTop: 4 },
  dangerLabel: { display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--danger)', letterSpacing: 0.4, marginBottom: 10 },
  dangerBtnOutline: {
    background: 'rgba(240,101,79,0.08)', border: '1px solid rgba(240,101,79,0.4)', color: 'var(--danger)',
    borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', width: '100%',
  },
  dangerConfirmBox: {
    background: 'rgba(240,101,79,0.08)', border: '1px solid rgba(240,101,79,0.4)', borderRadius: 'var(--radius-sm)', padding: 14,
  },
  dangerConfirmText: { fontSize: 12.5, color: 'var(--text-mid)', lineHeight: 1.5, marginBottom: 12 },
  dangerConfirmActions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  dangerBtnSolid: {
    background: 'var(--danger)', border: 'none', color: '#fff', borderRadius: 'var(--radius-sm)',
    padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  },
  generalRow: { display: 'flex', justifyContent: 'space-between', padding: '9px 12px', background: 'color-mix(in srgb, var(--text-hi) 2%, transparent)', border: '1px solid color-mix(in srgb, var(--text-hi) 5%, transparent)', borderRadius: 10 },
  generalLabel: { fontSize: 12, color: 'var(--text-low)' },
  generalValue: { fontSize: 12.5, color: 'var(--text-hi)', fontWeight: 600 },
  svrFieldGroup: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 },
  svrFieldLabel: { fontSize: 11, fontWeight: 700, color: 'var(--text-low)', letterSpacing: 0.3 },
  svrFieldInput: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    padding: '9px 10px', color: 'var(--text-hi)', fontSize: 13,
  },
  svrFieldTextarea: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    padding: '9px 10px', color: 'var(--text-hi)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit',
  },
  swatchRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  svrColorSwatch: {
    width: 28, height: 28, borderRadius: '50%', border: '2px solid transparent', cursor: 'pointer',
    color: 'var(--accent-contrast)', fontWeight: 900, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  svrColorSwatchActive: { border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(255,255,255,0.3)' },
  svrColorPicker: { width: 30, height: 28, border: '1px solid var(--border)', borderRadius: 9, background: 'transparent', padding: 2, cursor: 'pointer' },
  saveRow: { display: 'flex', alignItems: 'center', gap: 12, marginTop: 2 },
  errorTextInline: { fontSize: 11.5, color: 'var(--danger)' },
  divider: { height: 1, background: 'var(--border)', margin: '6px 0' },
  inviteRow: { display: 'flex', alignItems: 'center', gap: 8 },
  inviteCodeBox: {
    flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    padding: '9px 10px', color: 'var(--text-hi)', fontSize: 13, fontFamily: 'monospace',
  },
  smallGhostBtn: {
    background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-hi)', borderRadius: 'var(--radius-sm)',
    padding: '8px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  hintTextStandalone: { fontSize: 11.5, color: 'var(--text-low)', marginTop: 4 },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'var(--scrim)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 80,
    padding: 20,
  },
  modalCard: {
    width: 440,
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xl)',
    boxShadow: 'var(--shadow-lg)',
    padding: 18,
  },
  serverSettingsCard: {
    width: 700,
    maxWidth: '92vw',
    background: 'var(--bg-surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius-xl)',
    boxShadow: 'var(--shadow-lg)',
    padding: 18,
  },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { margin: 0, fontSize: 22, fontFamily: 'var(--font-display)', color: 'var(--text-hi)' },
  closeBtn: { border: 'none', background: 'transparent', color: 'var(--text-mid)', fontSize: 26, cursor: 'pointer', lineHeight: 1 },
  settingsBody: { display: 'flex', gap: 16, minHeight: 360 },
  settingsSidebar: { width: 180, display: 'flex', flexDirection: 'column', gap: 8 },
  settingsTab: { textAlign: 'left', background: 'transparent', border: 'none', borderRadius: 'var(--radius-pill)', color: 'var(--text-mid)', padding: '9px 14px', cursor: 'pointer' },
  settingsTabActive: { textAlign: 'left', background: 'var(--accent-soft)', border: 'none', borderRadius: 'var(--radius-pill)', color: 'var(--text-hi)', padding: '9px 14px', cursor: 'pointer', fontWeight: 650 },
  settingsContent: { flex: 1, display: 'flex', flexDirection: 'column', gap: 12 },
  primaryBtn: { border: 'none', background: 'var(--accent)', color: 'var(--accent-contrast)', fontWeight: 650, padding: '10px 18px', borderRadius: 'var(--radius-pill)', cursor: 'pointer' },
};
