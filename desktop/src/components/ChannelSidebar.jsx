import React, { useEffect, useState } from 'react';
import GroupPanel from './GroupPanel';
import RoleManager from './RoleManager';
import MemberRoleManager from './MemberRoleManager';
import UserBar from './UserBar';
import VoiceBar from './VoiceBar';
import { TrashIcon, SpeakerIcon, GearIcon, CheckIcon, HashIcon } from './Icons';
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
  onOpenProfile,
  voicePresence = {},
  voiceConnected = false,
  voiceChannelName,
  voiceParticipants = [],
  voiceError = '',
  onToggleVoiceMute,
  onLeaveVoice,
}) {
  const [serverSettingsOpen, setServerSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('geral');
  const [collapsedCategories, setCollapsedCategories] = useState(() => new Set());
  const [newChannelFor, setNewChannelFor] = useState(null); // null | 'root' | categoryId
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelType, setNewChannelType] = useState('text');
  const [channelError, setChannelError] = useState('');

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

  function renderChannelBtn(c) {
    const isActive = c.type === 'voice' ? c.id === voiceChannelId : c.id === activeChannelId;
    const unread = c.type === 'text' ? (unreadByChannel[c.id] || 0) : 0;
    const peopleHere = c.type === 'voice' ? (voicePresence[c.id] || []) : [];
    return (
      <React.Fragment key={c.id}>
        <div style={styles.channelRow}>
          <button onClick={() => onSelectChannel(c)} style={styles.channelBtn(isActive)}>
            <span style={styles.hash}>{c.type === 'voice' ? <SpeakerIcon size={13} /> : <HashIcon size={13} />}</span> {c.name}
            {unread > 0 && !isActive && (
              <span style={styles.channelUnreadBadge}>{unread > 99 ? '99+' : unread}</span>
            )}
          </button>
          {canDeleteChannels && (
            <button
              type="button"
              style={styles.channelDeleteBtn}
              title="Excluir canal"
              onClick={(e) => handleDeleteChannel(c.id, e)}
            >
              <TrashIcon size={13} />
            </button>
          )}
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
      <div style={styles.header}>
        <span style={styles.headerName}>{server.name}</span>
        <div style={styles.headerActions}>
          <span style={styles.inviteCode} title="Código de convite">
            #{server.invite_code}
          </span>
          {canOpenSettings && (
            <button type="button" style={styles.serverMenuBtn} onClick={() => setServerSettingsOpen(true)} title="Configurações do servidor">
              <GearIcon size={14} />
            </button>
          )}
        </div>
      </div>

      <div style={styles.channelList}>
        {uncategorized.map(renderChannelBtn)}

        {sortedCategories.map((category) => {
          const collapsed = collapsedCategories.has(category.id);
          const channels = channelsByCategory.get(category.id) || [];
          return (
            <div key={category.id} style={styles.categoryBlock}>
              <button type="button" style={styles.categoryHeader} onClick={() => toggleCategoryCollapsed(category.id)}>
                <span style={styles.categoryChevron}>{collapsed ? '▶' : '▼'}</span>
                <span style={styles.categoryName}>{category.name}</span>
                {canManageChannels && (
                  <span
                    role="button"
                    tabIndex={0}
                    style={styles.categoryAddBtn}
                    onClick={(e) => { e.stopPropagation(); openNewChannelForm(category.id); }}
                    title="Adicionar canal nesta categoria"
                  >
                    +
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
            + Adicionar canal
          </button>
        )}
      </div>

      <div style={{ flex: 1 }} />

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
        onOpenProfile={openProfile}
      />

      {serverSettingsOpen && (
        <div style={styles.modalOverlay} onClick={() => setServerSettingsOpen(false)}>
          <div style={styles.serverSettingsCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Configurações do servidor</h3>
              <button type="button" style={styles.closeBtn} onClick={() => setServerSettingsOpen(false)}>×</button>
            </div>

            <div style={styles.settingsBody}>
              <div style={styles.settingsSidebar}>
                <button type="button" style={settingsTab === 'geral' ? styles.settingsTabActive : styles.settingsTab} onClick={() => setSettingsTab('geral')}>Geral</button>
                <button type="button" style={settingsTab === 'membros' ? styles.settingsTabActive : styles.settingsTab} onClick={() => setSettingsTab('membros')}>Membros</button>
                <button type="button" style={settingsTab === 'cargos' ? styles.settingsTabActive : styles.settingsTab} onClick={() => setSettingsTab('cargos')}>Cargos</button>
                <button type="button" style={settingsTab === 'grupos' ? styles.settingsTabActive : styles.settingsTab} onClick={() => setSettingsTab('grupos')}>Grupos</button>
              </div>

              <div style={styles.settingsContent}>
                {settingsTab === 'geral' && (
                  <GeneralSettingsForm
                    server={server}
                    categories={categories}
                    canManage={canManageServer}
                    onUpdateServer={onUpdateServer}
                    onRegenerateInvite={onRegenerateInvite}
                    themeAccent={themeAccent}
                    isOwner={isServerOwner}
                    onDeleteServer={onDeleteServer}
                    onLeaveServer={onLeaveServer}
                    onCloseSettings={() => setServerSettingsOpen(false)}
                  />
                )}
                {settingsTab === 'membros' && (
                  <MemberRoleManager
                    members={members}
                    roles={roles}
                    canManage={canManageMembers}
                    onAssignRoles={onAssignMemberRoles}
                  />
                )}
                {settingsTab === 'cargos' && (
                  <RoleManager
                    roles={roles}
                    canManage={canManageRoles}
                    onCreateRole={onCreateRole}
                    onUpdateRole={onUpdateRole}
                    onDeleteRole={onDeleteRole}
                  />
                )}
                {settingsTab === 'grupos' && (
                  <GroupPanel
                    categories={categories}
                    canManage={canManageChannels}
                    currentUserId={user?.id}
                    isOwner={isServerOwner}
                    onCreateCategory={onCreateGroup}
                    onRenameCategory={onRenameGroup}
                    onDeleteCategory={onDeleteGroup}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const ACCENT_SWATCHES = ['#16C7B3', '#8C7BFA', '#F0568C', '#F0B429', '#4C9EF0', '#F0654F', '#8BD450'];

// Aba "Geral" das configurações do servidor: nome, descrição, cor de destaque e convite —
// personalização completa do grupo, tudo salvo no backend.
function GeneralSettingsForm({ server, categories, canManage, onUpdateServer, onRegenerateInvite, themeAccent, isOwner, onDeleteServer, onLeaveServer, onCloseSettings }) {
  const [name, setName] = useState(server?.name || '');
  const [description, setDescription] = useState(server?.description || '');
  const [color, setColor] = useState(server?.color || themeAccent);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState('');
  const [confirmDanger, setConfirmDanger] = useState(false);

  useEffect(() => {
    setName(server?.name || '');
    setDescription(server?.description || '');
    setColor(server?.color || themeAccent);
  }, [server?.id]);

  const dirty = name.trim() !== (server?.name || '') || description !== (server?.description || '') || color !== (server?.color || themeAccent);

  async function handleSave() {
    if (!name.trim() || !canManage) return;
    setSaving(true);
    setError('');
    try {
      await onUpdateServer?.({ name: name.trim(), description, color });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err?.response?.data?.error || 'Falha ao salvar as alterações');
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    if (!canManage) return;
    setRegenerating(true);
    try {
      await onRegenerateInvite?.();
    } finally {
      setRegenerating(false);
    }
  }

  function handleCopyInvite() {
    navigator.clipboard?.writeText(server?.invite_code || '');
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div style={styles.generalBox}>
      <div style={styles.svrFieldGroup}>
        <label style={styles.svrFieldLabel}>Nome do servidor</label>
        <input
          type="text"
          style={styles.svrFieldInput}
          value={name}
          onChange={(e) => setName(e.target.value)}
          disabled={!canManage}
          maxLength={60}
        />
      </div>

      <div style={styles.svrFieldGroup}>
        <label style={styles.svrFieldLabel}>Descrição</label>
        <textarea
          style={styles.svrFieldTextarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={!canManage}
          maxLength={300}
          placeholder="Do que é esse servidor?"
          rows={3}
        />
      </div>

      <div style={styles.svrFieldGroup}>
        <label style={styles.svrFieldLabel}>Cor de destaque</label>
        <div style={styles.swatchRow}>
          {ACCENT_SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              disabled={!canManage}
              onClick={() => setColor(c)}
              style={{ ...styles.svrColorSwatch, background: c, ...(color === c ? styles.svrColorSwatchActive : {}) }}
              title={c}
            >
              {color === c && <CheckIcon size={12} />}
            </button>
          ))}
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            disabled={!canManage}
            style={styles.svrColorPicker}
            title="Cor personalizada"
          />
        </div>
        <div style={styles.hintTextStandalone}>Usada no ícone do servidor (quando não há imagem) e no banner de fundo.</div>
      </div>

      {canManage && (
        <div style={styles.saveRow}>
          <button type="button" style={styles.primaryBtn} onClick={handleSave} disabled={!dirty || saving || !name.trim()}>
            {saving ? 'Salvando…' : saved ? <span style={styles.inlineCheck}>Salvo <CheckIcon size={12} /></span> : 'Salvar alterações'}
          </button>
          {error && <span style={styles.errorTextInline}>{error}</span>}
        </div>
      )}

      <div style={styles.divider} />

      <div style={styles.svrFieldGroup}>
        <label style={styles.svrFieldLabel}>Código de convite</label>
        <div style={styles.inviteRow}>
          <code style={styles.inviteCodeBox}>{server?.invite_code}</code>
          <button type="button" style={styles.smallGhostBtn} onClick={handleCopyInvite}>{copied ? <span style={styles.inlineCheck}>Copiado <CheckIcon size={12} /></span> : 'Copiar'}</button>
          {canManage && (
            <button type="button" style={styles.smallGhostBtn} onClick={handleRegenerate} disabled={regenerating}>
              {regenerating ? 'Gerando…' : 'Gerar novo'}
            </button>
          )}
        </div>
      </div>

      <div style={styles.generalRow}><span style={styles.generalLabel}>Canais</span><span style={styles.generalValue}>{server.channels.length}</span></div>
      <div style={styles.generalRow}><span style={styles.generalLabel}>Categorias</span><span style={styles.generalValue}>{categories.length}</span></div>
      <div style={styles.hintTextStandalone}>Ícone e banner do servidor: edite direto no card acima do chat.</div>

      <div style={styles.divider} />

      <div style={styles.dangerZone}>
        <label style={styles.dangerLabel}>Zona de perigo</label>
        {!confirmDanger ? (
          <button type="button" style={styles.dangerBtnOutline} onClick={() => setConfirmDanger(true)}>
            {isOwner ? 'Excluir servidor' : 'Sair do servidor'}
          </button>
        ) : (
          <div style={styles.dangerConfirmBox}>
            <div style={styles.dangerConfirmText}>
              {isOwner
                ? 'Tem certeza? Isso apaga o servidor, canais e mensagens pra sempre — não dá pra desfazer.'
                : `Tem certeza que quer sair de "${server.name}"? Você vai precisar de outro convite pra voltar.`}
            </div>
            <div style={styles.dangerConfirmActions}>
              <button type="button" style={styles.smallGhostBtn} onClick={() => setConfirmDanger(false)}>Cancelar</button>
              <button
                type="button"
                style={styles.dangerBtnSolid}
                onClick={() => {
                  if (isOwner) onDeleteServer?.(server.id);
                  else onLeaveServer?.(server.id);
                  onCloseSettings?.();
                }}
              >
                {isOwner ? 'Excluir de vez' : 'Sair agora'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    width: 270,
    flex: 1,
    minHeight: 0,
    background: 'linear-gradient(180deg, #121821 0%, #10151C 100%)',
    display: 'flex',
    flexDirection: 'column',
    borderRight: '1px solid var(--border)',
  },
  header: {
    height: 56,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 14px',
    borderBottom: '1px solid var(--border)',
    background: 'rgba(18, 22, 28, 0.9)',
    boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.02)',
  },
  headerActions: { display: 'flex', alignItems: 'center', gap: 8 },
  headerName: { fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 15, color: 'var(--text-hi)' },
  inviteCode: { fontSize: 10.5, color: 'var(--text-low)', fontFamily: 'monospace', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 6, padding: '3px 6px' },
  serverMenuBtn: { width: 28, height: 28, borderRadius: 8, border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-mid)', cursor: 'pointer' },
  section: { padding: '14px 10px 4px' },
  featureStack: {
    padding: '0 10px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: 0,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: 800,
    letterSpacing: 0.45,
    color: 'var(--text-low)',
    textTransform: 'uppercase',
    padding: '0 6px 8px',
  },
  channelBtn: (active) => ({
    width: '100%',
    textAlign: 'left',
    background: active ? 'linear-gradient(90deg, rgba(22,199,179,0.18), rgba(22,199,179,0.05))' : 'transparent',
    color: active ? 'var(--text-hi)' : 'var(--text-mid)',
    border: active ? '1px solid rgba(22,199,179,0.25)' : '1px solid transparent',
    borderRadius: 10,
    padding: '8px 10px',
    fontSize: 13.5,
    cursor: 'pointer',
    marginBottom: 2,
    transition: 'all 0.2s ease',
    display: 'flex',
    alignItems: 'center',
    fontWeight: active ? 600 : 400,
  }),
  channelUnreadBadge: {
    marginLeft: 'auto',
    background: 'var(--danger)',
    color: '#fff',
    fontSize: 10,
    fontWeight: 800,
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 4px',
  },
  hash: { color: 'var(--text-low)', marginRight: 4, display: 'inline-flex', verticalAlign: 'middle', position: 'relative', top: -1 },
  inlineCheck: { display: 'inline-flex', alignItems: 'center', gap: 4 },
  channelList: { padding: '10px 10px 4px', flexShrink: 0, maxHeight: '55vh', overflowY: 'auto' },
  channelRow: { display: 'flex', alignItems: 'center', gap: 4 },
  voiceMemberList: { display: 'flex', flexDirection: 'column', gap: 2, padding: '2px 0 6px 30px' },
  voiceMemberRow: { display: 'flex', alignItems: 'center', gap: 7, padding: '2px 4px' },
  voiceMemberAvatar: {
    width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, fontWeight: 800, color: 'var(--accent-contrast)', flexShrink: 0,
  },
  voiceMemberAvatarImg: { width: 18, height: 18, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  voiceMemberName: { fontSize: 12, color: 'var(--text-low)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  channelDeleteBtn: {
    flexShrink: 0, width: 22, height: 22, borderRadius: 6, border: 'none', background: 'transparent',
    color: 'var(--text-low)', fontSize: 10.5, cursor: 'pointer', opacity: 0.7,
  },
  categoryBlock: { marginTop: 10 },
  categoryHeader: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 6, background: 'transparent', border: 'none',
    cursor: 'pointer', padding: '4px 6px', marginBottom: 2,
  },
  categoryChevron: { fontSize: 8, color: 'var(--text-low)' },
  categoryName: { flex: 1, textAlign: 'left', fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-low)' },
  categoryAddBtn: { fontSize: 14, color: 'var(--text-low)', cursor: 'pointer', padding: '0 4px', lineHeight: 1 },
  addChannelLink: {
    width: '100%', textAlign: 'left', background: 'transparent', border: 'none', color: 'var(--text-low)',
    fontSize: 12, padding: '8px 6px', cursor: 'pointer', marginTop: 4,
  },
  newChannelForm: {
    background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10, padding: 10,
    margin: '4px 0 8px', display: 'flex', flexDirection: 'column', gap: 8,
  },
  newChannelInput: {
    width: '100%', background: 'rgba(0,0,0,0.25)', border: '1px solid var(--border)', borderRadius: 8,
    color: 'var(--text-hi)', fontSize: 12.5, padding: '7px 9px',
  },
  newChannelTypeRow: { display: 'flex', gap: 6 },
  typeToggle: (active) => ({
    flex: 1, fontSize: 11.5, padding: '6px 8px', borderRadius: 7, cursor: 'pointer',
    border: active ? '1px solid rgba(22,199,179,0.4)' : '1px solid var(--border)',
    background: active ? 'rgba(22,199,179,0.15)' : 'transparent',
    color: active ? 'var(--text-hi)' : 'var(--text-mid)',
  }),
  newChannelError: { fontSize: 11, color: 'var(--danger)' },
  newChannelActions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  newChannelCancel: { border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-mid)', fontSize: 11.5, padding: '6px 10px', borderRadius: 7, cursor: 'pointer' },
  newChannelConfirm: { border: 'none', background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))', color: '#fff', fontWeight: 700, fontSize: 11.5, padding: '6px 12px', borderRadius: 7, cursor: 'pointer' },
  generalBox: { display: 'flex', flexDirection: 'column', gap: 10 },
  dangerZone: { marginTop: 4 },
  dangerLabel: { display: 'block', fontSize: 11, fontWeight: 800, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 10 },
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
  generalRow: { display: 'flex', justifyContent: 'space-between', padding: '9px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10 },
  generalLabel: { fontSize: 12, color: 'var(--text-low)' },
  generalValue: { fontSize: 12.5, color: 'var(--text-hi)', fontWeight: 600 },
  svrFieldGroup: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 4 },
  svrFieldLabel: { fontSize: 11, fontWeight: 700, color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: 0.3 },
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
  svrColorPicker: { width: 30, height: 28, border: '1px solid var(--border)', borderRadius: 6, background: 'transparent', padding: 2, cursor: 'pointer' },
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
    background: 'rgba(2,5,9,0.6)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 80,
    padding: 20,
  },
  modalCard: {
    width: 440,
    background: 'linear-gradient(180deg, #1B1F2A 0%, #151A22 100%)',
    border: '1px solid var(--border)',
    borderRadius: 22,
    boxShadow: '0 26px 80px rgba(0,0,0,0.5)',
    padding: 18,
  },
  serverSettingsCard: {
    width: 700,
    maxWidth: '92vw',
    background: 'linear-gradient(180deg, #1B1F2A 0%, #151A22 100%)',
    border: '1px solid var(--border)',
    borderRadius: 22,
    boxShadow: '0 26px 80px rgba(0,0,0,0.5)',
    padding: 18,
  },
  modalHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  modalTitle: { margin: 0, fontSize: 22, fontFamily: 'var(--font-display)', color: 'var(--text-hi)' },
  closeBtn: { border: 'none', background: 'transparent', color: 'var(--text-mid)', fontSize: 26, cursor: 'pointer', lineHeight: 1 },
  settingsBody: { display: 'flex', gap: 16, minHeight: 360 },
  settingsSidebar: { width: 180, display: 'flex', flexDirection: 'column', gap: 8 },
  settingsTab: { textAlign: 'left', background: 'transparent', border: '1px solid transparent', borderRadius: 8, color: 'var(--text-mid)', padding: '8px 10px', cursor: 'pointer' },
  settingsTabActive: { textAlign: 'left', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, color: 'var(--text-hi)', padding: '8px 10px', cursor: 'pointer', fontWeight: 700 },
  settingsContent: { flex: 1, display: 'flex', flexDirection: 'column', gap: 12 },
  primaryBtn: { border: 'none', background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))', color: '#fff', fontWeight: 700, padding: '9px 14px', borderRadius: 10, cursor: 'pointer', boxShadow: '0 12px 28px rgba(22,199,179,0.35)' },
};
