import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { resolveAssetUrl, createGroupConversation, renameGroupConversation, leaveGroupConversation } from '../api';
import FriendsPanel from './FriendsPanel';
import ChatView from './ChatView';
import UserBar from './UserBar';
import VoiceBar from './VoiceBar';
import CreateGroupModal from './CreateGroupModal';
import { statusMeta } from './UserProfilePopup';
import { EmptyDMArt } from './EmptyStateArt';
import { ShopIcon, UsersIcon, StoreIcon } from './Icons';
import MarketView from './market/MarketView';
import friendsIcon from '../assets/friends-icon.png';

export default function DirectMessagesView({
  dmCalls = {},
  currentVoiceRoom = null,
  onStartCall,
  onOpenUserProfile,
  api,
  socket,
  user,
  micMuted = false,
  deafened = false,
  inCall = false,
  onToggleMic,
  onToggleDeafen,
  onOpenSettings,
  onOpenProfile,
  onChangeStatus,
  onOpenAccounts,
  onOpenShop,
  voiceConnected = false,
  voiceChannelName,
  voiceParticipants = [],
  voiceError = '',
  onToggleVoiceMute,
  onLeaveVoice,
  onUploadAttachment,
  screenSharing = false,
  onToggleScreenShare,
  remoteScreenShares,
  onViewScreenShare,
  initialPanel = 'friends',
  focusConversation = null, // { id, nonce } — abre essa conversa (ex.: atendeu uma chamada)
}) {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [homePanel, setHomePanel] = useState(initialPanel); // 'friends' | 'market' (quando nenhuma conversa está aberta)
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [unreadByConversation, setUnreadByConversation] = useState({});
  const [groupModalOpen, setGroupModalOpen] = useState(false);

  const loadConversations = useCallback(async () => {
    const { data } = await api.get('/dms');
    setConversations(data.conversations);
    return data.conversations;
  }, [api]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  useEffect(() => {
    if (!focusConversation?.id) return;
    let alive = true;
    (async () => {
      let list = conversations;
      if (!list.some((c) => c.id === focusConversation.id)) list = await loadConversations();
      const conv = list.find((c) => c.id === focusConversation.id);
      if (alive && conv && activeConversation?.id !== conv.id) openConversation(conv);
    })();
    return () => { alive = false; };
  }, [focusConversation?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mensagens e avisos em tempo real
  useEffect(() => {
    if (!socket) return;

    const onNew = (msg) => {
      const message = { ...msg, attachments: msg.attachments || [] };
      const isOpen = msg.conversationId === activeConversation?.id;
      setMessages((prev) => (isOpen ? [...prev, message] : prev));
      if (!isOpen) {
        setUnreadByConversation((prev) => ({
          ...prev,
          [msg.conversationId]: (prev[msg.conversationId] || 0) + 1,
        }));
      }
      loadConversations();
    };

    const onTyping = ({ conversationId, username }) => {
      if (conversationId !== activeConversation?.id) return;
      setTypingUsers((prev) => (prev.includes(username) ? prev : [...prev, username]));
      setTimeout(() => setTypingUsers((prev) => prev.filter((u) => u !== username)), 3000);
    };

    // Alguém te colocou num grupo: aparece na lista na hora
    const onGroupCreated = () => { loadConversations(); };

    socket.on('dm:new', onNew);
    socket.on('dm:typing', onTyping);
    socket.on('dm:group-created', onGroupCreated);

    return () => {
      socket.off('dm:new', onNew);
      socket.off('dm:typing', onTyping);
      socket.off('dm:group-created', onGroupCreated);
    };
  }, [socket, activeConversation, loadConversations]);

  async function openWithFriend(friendId) {
    const { data } = await api.post(`/dms/${friendId}`);
    await openConversation(data.conversation);
    loadConversations();
  }

  async function openConversation(conversation) {
    setActiveConversation(conversation);
    setMessages([]);
    setTypingUsers([]);
    setUnreadByConversation((prev) => ({ ...prev, [conversation.id]: 0 }));
    const { data } = await api.get(`/dms/${conversation.id}/messages`);
    setMessages(data.messages);
  }

  // Os anexos já chegam prontos do ChatView (ele sobe o arquivo antes de chamar isso)
  function sendMessage(content, attachments = []) {
    if (!activeConversation) return;
    socket.emit('dm:send', { conversationId: activeConversation.id, content, attachments });
  }

  function notifyTyping() {
    if (activeConversation) socket.emit('dm:typing', { conversationId: activeConversation.id });
  }

  async function handleCreateGroup(memberIds, name) {
    const conversation = await createGroupConversation(api, memberIds, name);
    setGroupModalOpen(false);
    await loadConversations();
    await openConversation(conversation);
  }

  async function handleRenameGroup(name) {
    if (!activeConversation?.isGroup) return;
    const updated = await renameGroupConversation(api, activeConversation.id, name);
    setActiveConversation(updated);
    loadConversations();
  }

  async function handleLeaveGroup() {
    if (!activeConversation?.isGroup) return;
    await leaveGroupConversation(api, activeConversation.id);
    setActiveConversation(null);
    loadConversations();
  }

  const chatChannel = useMemo(() => {
    if (!activeConversation) return null;
    return {
      id: activeConversation.id,
      name: conversationName(activeConversation, user.id),
      user: activeConversation.user,
      isGroup: activeConversation.isGroup,
      memberCount: activeConversation.memberCount,
      participants: activeConversation.participants,
    };
  }, [activeConversation, user.id]);

  return (
    <div style={styles.wrap}>
      <div style={styles.list}>
        <div style={styles.listScroll}>
          <button
            type="button"
            style={{ ...styles.navItem, ...(activeConversation === null && homePanel === 'friends' ? styles.navItemActive : {}) }}
            onClick={() => { setActiveConversation(null); setHomePanel('friends'); }}
          >
            <span style={styles.navIcon}>
              <img src={friendsIcon} alt="" style={styles.navIconImg} />
            </span>
            Amigos
          </button>

          <button
            type="button"
            style={{ ...styles.navItem, ...(activeConversation === null && homePanel === 'market' ? styles.navItemActive : {}) }}
            onClick={() => { setActiveConversation(null); setHomePanel('market'); }}
          >
            <span style={styles.navIcon}><StoreIcon size={16} /></span>
            Mercado
          </button>

          {onOpenShop && (
            <button type="button" style={styles.navItem} onClick={onOpenShop}>
              <span style={styles.navIcon}><ShopIcon size={16} /></span>
              Insígnias e Pro
            </button>
          )}

          <div style={styles.listHeaderRow}>
            <span style={styles.listLabel}>Mensagens diretas</span>
            <button
              type="button"
              style={styles.newGroupBtn}
              onClick={() => setGroupModalOpen(true)}
              title="Criar grupo"
            >
              +
            </button>
          </div>

          {conversations.length === 0 && (
            <div style={styles.emptyDmState}>
              <EmptyDMArt size={92} />
              <div style={styles.emptyHint}>
                Nenhuma conversa ainda. Adicione um amigo e chame de "Mensagem", ou crie um grupo no +.
              </div>
            </div>
          )}

          {conversations.map((c) => {
            const name = conversationName(c, user.id);
            const isActive = activeConversation?.id === c.id;
            const unread = unreadByConversation[c.id] || 0;
            const preview = previewOf(c, user.id);

            return (
              <button
                key={c.id}
                type="button"
                style={{ ...styles.convRow, ...(isActive ? styles.convRowActive : {}) }}
                onClick={() => openConversation(c)}
              >
                <ConversationAvatar conversation={c} viewerId={user.id} />
                <div style={styles.convMeta}>
                  <div style={styles.convName}>{name}</div>
                  <div style={{ ...styles.convPreview, ...(unread > 0 ? styles.convPreviewUnread : {}) }}>
                    {c.isGroup && !c.lastMessage ? `${c.memberCount} membros` : preview}
                  </div>
                </div>
                {unread > 0 && !isActive && (
                  <span style={styles.convUnreadBadge}>{unread > 99 ? '99+' : unread}</span>
                )}
              </button>
            );
          })}
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
            screenSharing={screenSharing}
            onToggleScreenShare={onToggleScreenShare}
            remoteScreenShares={remoteScreenShares}
            onViewScreenShare={onViewScreenShare}
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
          onOpenProfile={onOpenProfile}
          onChangeStatus={onChangeStatus}
          onOpenAccounts={onOpenAccounts}
        />
      </div>

      <div style={styles.main}>
        {activeConversation ? (
          <ChatView
            channel={chatChannel}
            messages={messages}
            onSend={sendMessage}
            onTyping={notifyTyping}
            onUploadAttachment={onUploadAttachment}
            typingUsers={typingUsers}
            isDM
            user={user}
            onOpenProfile={onOpenUserProfile}
            callTools={{
              participants: dmCalls[activeConversation.id] || [],
              inThisCall: currentVoiceRoom === `dm:${activeConversation.id}`,
              onCall: () => onStartCall?.(activeConversation, chatChannel?.name),
            }}
            onRenameGroup={activeConversation.isGroup ? handleRenameGroup : null}
            onLeaveGroup={activeConversation.isGroup ? handleLeaveGroup : null}
          />
        ) : homePanel === 'market' ? (
          <MarketView api={api} socket={socket} user={user} />
        ) : (
          <FriendsPanel
            api={api}
            socket={socket}
            currentUserId={user.id}
            onOpenDM={openWithFriend}
          />
        )}
      </div>

      {groupModalOpen && (
        <CreateGroupModal
          api={api}
          onClose={() => setGroupModalOpen(false)}
          onCreate={handleCreateGroup}
        />
      )}
    </div>
  );
}

/** Nome exibido: o do grupo, ou o da outra pessoa numa DM 1:1. */
function conversationName(conversation, viewerId) {
  if (conversation.isGroup) {
    if (conversation.name) return conversation.name;
    const others = (conversation.participants || []).filter((p) => p.id !== viewerId);
    return others.map((p) => p.display_name || p.username).join(', ') || 'Grupo';
  }
  return conversation.user?.display_name || conversation.user?.username || 'Conversa';
}

function previewOf(conversation, viewerId) {
  const last = conversation.lastMessage;
  if (!last) return 'Nenhuma mensagem ainda';
  const prefix = last.author_id === viewerId ? 'Você: ' : '';
  if (!last.content) return `${prefix}enviou um anexo`;
  return prefix + last.content;
}

/** Avatar da conversa: foto da pessoa, ou um mosaico com os membros do grupo. */
function ConversationAvatar({ conversation, viewerId }) {
  if (conversation.isGroup) {
    const others = (conversation.participants || []).filter((p) => p.id !== viewerId).slice(0, 3);
    return (
      <div style={styles.avatarWrap}>
        <div style={styles.groupAvatar}>
          {others.length === 0 ? <UsersIcon size={16} /> : others.map((p, i) => {
            const url = resolveAssetUrl(p.avatar_url);
            return url ? (
              <img key={p.id} src={url} alt="" style={{ ...styles.groupAvatarPiece, zIndex: 3 - i }} />
            ) : (
              <span
                key={p.id}
                style={{ ...styles.groupAvatarPiece, background: p.avatar_color || 'var(--accent)', zIndex: 3 - i }}
              >
                {(p.display_name || p.username || '?')[0].toUpperCase()}
              </span>
            );
          })}
        </div>
      </div>
    );
  }

  const name = conversation.user?.display_name || conversation.user?.username || '?';
  const avatarUrl = resolveAssetUrl(conversation.user?.avatar_url);
  const initials = name.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div style={styles.avatarWrap}>
      {avatarUrl ? (
        <img src={avatarUrl} alt={name} style={styles.avatarImg} />
      ) : (
        <div style={{ ...styles.avatar, background: conversation.user?.avatar_color || 'var(--accent)' }}>
          {initials || '?'}
        </div>
      )}
      <div style={{ ...styles.dot, background: statusMeta(conversation.user?.status).color }} />
    </div>
  );
}

const styles = {
  wrap: { display: 'flex', height: '100%', width: '100%', gap: 'var(--panel-gap)', minWidth: 0 },
  list: {
    width: 264, minWidth: 264, background: 'var(--bg-base)', borderRadius: 'var(--radius-lg)',
    overflow: 'hidden', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column',
  },
  listScroll: { flex: 1, overflowY: 'auto', padding: '10px 8px' },
  navItem: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    background: 'transparent', border: 'none', color: 'var(--text-mid)',
    borderRadius: 'var(--radius-pill)', padding: '10px 14px', fontSize: 14, fontWeight: 550,
    cursor: 'pointer', marginBottom: 2, textAlign: 'left',
  },
  navItemActive: { background: 'var(--accent-soft)', color: 'var(--text-hi)' },
  navIcon: { fontSize: 15, display: 'flex', alignItems: 'center' },
  navIconImg: { width: 15, height: 15, filter: 'var(--mono-icon-filter)' },
  listHeaderRow: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '14px 8px 6px 14px',
  },
  listLabel: {
    fontSize: 12, fontWeight: 650, letterSpacing: 0.1,
    color: 'var(--text-low)',
  },
  newGroupBtn: {
    width: 26, height: 26, borderRadius: 13, border: 'none',
    background: 'transparent', color: 'var(--text-mid)', fontSize: 16, lineHeight: 1,
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  emptyDmState: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    textAlign: 'center', padding: '24px 14px', gap: 14,
  },
  emptyHint: { fontSize: 12.5, color: 'var(--text-low)', lineHeight: 1.5 },
  convRow: {
    width: '100%', display: 'flex', alignItems: 'center', gap: 10,
    background: 'transparent', border: 'none', borderRadius: 'var(--radius-pill)',
    padding: '6px 10px 6px 6px', cursor: 'pointer', textAlign: 'left', marginBottom: 2,
  },
  convRowActive: { background: 'var(--accent-soft)' },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: {
    width: 36, height: 36, borderRadius: '50%', display: 'flex',
    alignItems: 'center', justifyContent: 'center', fontWeight: 650,
    fontSize: 12.5, color: 'var(--on-color)',
  },
  avatarImg: { width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', display: 'block' },
  groupAvatar: {
    width: 36, height: 36, borderRadius: '50%', background: 'var(--bg-elevated)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden', fontSize: 14, position: 'relative',
  },
  groupAvatarPiece: {
    width: 20, height: 20, borderRadius: '50%', objectFit: 'cover',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 9, fontWeight: 800, color: 'var(--on-color)',
    border: '2px solid var(--bg-base)', marginLeft: -8,
  },
  dot: {
    position: 'absolute', bottom: -2, right: -2, width: 12, height: 12,
    borderRadius: '50%', border: '3px solid var(--bg-base)',
  },
  convMeta: { flex: 1, minWidth: 0 },
  convName: {
    fontSize: 14, fontWeight: 550, color: 'var(--text-hi)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  convPreview: {
    fontSize: 11.5, color: 'var(--text-low)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  convPreviewUnread: { color: 'var(--text-hi)', fontWeight: 600 },
  convUnreadBadge: {
    flexShrink: 0, background: 'var(--danger)', color: '#fff',
    fontSize: 10, fontWeight: 800, minWidth: 17, height: 17, borderRadius: 9,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px',
  },
  main: {
    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column',
    background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
    border: '1px solid var(--border)',
  },
};
