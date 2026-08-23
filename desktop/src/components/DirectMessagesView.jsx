import React, { useCallback, useEffect, useState } from 'react';
import { resolveAssetUrl } from '../api';
import FriendsPanel from './FriendsPanel';
import ChatView from './ChatView';
import UserBar from './UserBar';
import VoiceBar from './VoiceBar';
import friendsIcon from '../assets/friends-icon.png';

export default function DirectMessagesView({
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
  voiceConnected = false,
  voiceChannelName,
  voiceParticipants = [],
  voiceError = '',
  onToggleVoiceMute,
  onLeaveVoice,
}) {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null); // { id, user }
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [unreadByConversation, setUnreadByConversation] = useState({});

  const loadConversations = useCallback(async () => {
    const { data } = await api.get('/dms');
    setConversations(data.conversations);
  }, [api]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Mensagem em tempo real — atualiza o chat aberto e a prévia da lista de conversas
  useEffect(() => {
    if (!socket) return;
    const onNew = (msg) => {
      const isOpen = msg.conversationId === activeConversation?.id;
      setMessages((prev) => (isOpen ? [...prev, msg] : prev));
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
    socket.on('dm:new', onNew);
    socket.on('dm:typing', onTyping);
    return () => {
      socket.off('dm:new', onNew);
      socket.off('dm:typing', onTyping);
    };
  }, [socket, activeConversation, loadConversations]);

  async function openWithFriend(friendId) {
    const { data } = await api.post(`/dms/${friendId}`);
    await openConversation(data.conversation);
  }

  async function openConversation(conversation) {
    setActiveConversation(conversation);
    setMessages([]);
    setUnreadByConversation((prev) => ({ ...prev, [conversation.id]: 0 }));
    const { data } = await api.get(`/dms/${conversation.id}/messages`);
    setMessages(data.messages);
  }

  function sendMessage(content) {
    if (!activeConversation) return;
    socket.emit('dm:send', { conversationId: activeConversation.id, content });
  }

  const chatChannel = activeConversation
    ? { id: activeConversation.id, name: activeConversation.user?.display_name || activeConversation.user?.username }
    : null;

  return (
    <div style={styles.wrap}>
      <div style={styles.list}>
        <div style={styles.listScroll}>
          <button
            type="button"
            style={{ ...styles.navItem, ...(activeConversation === null ? styles.navItemActive : {}) }}
            onClick={() => setActiveConversation(null)}
          >
            <span style={styles.navIcon}><img src={friendsIcon} alt="" style={styles.navIconImg} /></span> Amigos
          </button>

          <div style={styles.listLabel}>Mensagens diretas</div>

          {conversations.length === 0 && <div style={styles.emptyHint}>Nenhuma conversa ainda. Adicione um amigo e chame de "Mensagem".</div>}

          {conversations.map((c) => {
            const name = c.user?.display_name || c.user?.username || 'Usuário';
            const avatarUrl = resolveAssetUrl(c.user?.avatar_url);
            const initials = (name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
            const isActive = activeConversation?.id === c.id;
            const unread = unreadByConversation[c.id] || 0;
            const preview = c.lastMessage
              ? (c.lastMessage.author_id === user.id ? 'Você: ' : '') + c.lastMessage.content
              : 'Nenhuma mensagem ainda';

            return (
              <button
                key={c.id}
                type="button"
                style={{ ...styles.convRow, ...(isActive ? styles.convRowActive : {}) }}
                onClick={() => openConversation(c)}
              >
                <div style={styles.avatarWrap}>
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={name} style={styles.avatarImg} />
                  ) : (
                    <div style={{ ...styles.avatar, background: c.user?.avatar_color || 'var(--accent)' }}>{initials || '?'}</div>
                  )}
                  <div style={{ ...styles.dot, background: c.user?.status === 'online' ? 'var(--success)' : 'var(--text-low)' }} />
                </div>
                <div style={styles.convMeta}>
                  <div style={styles.convName}>{name}</div>
                  <div style={{ ...styles.convPreview, ...(unread > 0 ? styles.convPreviewUnread : {}) }}>{preview}</div>
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
        />
      </div>

      <div style={styles.main}>
        {activeConversation ? (
          <ChatView channel={chatChannel} messages={messages} onSend={sendMessage} typingUsers={typingUsers} isDM />
        ) : (
          <FriendsPanel api={api} socket={socket} currentUserId={user.id} onOpenDM={openWithFriend} />
        )}
      </div>
    </div>
  );
}

const styles = {
  wrap: { flex: 1, minWidth: 0, display: 'flex', height: '100%' },
  list: {
    width: 270,
    flexShrink: 0,
    background: 'linear-gradient(180deg, #121821 0%, #10151C 100%)',
    borderRight: '1px solid var(--border)',
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
  },
  listScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '14px 10px',
  },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'transparent',
    border: '1px solid transparent', borderRadius: 10, padding: '9px 10px', color: 'var(--text-mid)',
    fontSize: 13.5, fontWeight: 600, cursor: 'pointer', marginBottom: 10,
  },
  navItemActive: { background: 'rgba(22,199,179,0.14)', border: '1px solid rgba(22,199,179,0.25)', color: 'var(--text-hi)' },
  navIcon: { fontSize: 15, display: 'flex', alignItems: 'center' },
  navIconImg: { width: 15, height: 15, filter: 'brightness(0) invert(1)' },
  listLabel: { fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-low)', padding: '6px 8px 8px' },
  emptyHint: { fontSize: 12, color: 'var(--text-low)', padding: '4px 8px', lineHeight: 1.5 },
  convRow: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', background: 'transparent',
    border: '1px solid transparent', borderRadius: 10, padding: '8px 8px', cursor: 'pointer', marginBottom: 2,
  },
  convRowActive: { background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)' },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: { width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 12, color: '#fff' },
  avatarImg: { width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.12)' },
  dot: { position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', border: '2px solid var(--bg-base)' },
  convMeta: { minWidth: 0, flex: 1 },
  convName: { fontSize: 13.5, fontWeight: 700, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  convPreview: { fontSize: 11.5, color: 'var(--text-low)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  convPreviewUnread: { color: 'var(--text-hi)', fontWeight: 600 },
  convUnreadBadge: {
    flexShrink: 0,
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
  main: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
};
