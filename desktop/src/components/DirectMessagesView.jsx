import React, { useCallback, useEffect, useState } from 'react';
import { resolveAssetUrl } from '../api';
import FriendsPanel from './FriendsPanel';
import ChatView from './ChatView';
import UserBar from './UserBar';
import VoiceBar from './VoiceBar';
import { statusMeta } from './UserProfilePopup';
import { EmptyDMArt } from './EmptyStateArt';
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
  onChangeStatus,
  onOpenAccounts,
  voiceConnected = false,
  voiceChannelName,
  voiceParticipants = [],
  voiceError = '',
  onToggleVoiceMute,
  onLeaveVoice,
}) {
  const [conversations, setConversations] = useState([]);
  const [activeConversation, setActiveConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [unreadByConversation, setUnreadByConversation] = useState({});
  const [pendingAttachments, setPendingAttachments] = useState([]); // Novos anexos

  const loadConversations = useCallback(async () => {
    const { data } = await api.get('/dms');
    setConversations(data.conversations);
  }, [api]);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  // Mensagem em tempo real
  useEffect(() => {
    if (!socket) return;
    
    const onNew = (msg) => {
      // Processa mensagens com anexos
      const messageWithAttachments = {
        ...msg,
        attachments: msg.attachments || []
      };
      
      const isOpen = msg.conversationId === activeConversation?.id;
      setMessages((prev) => (isOpen ? [...prev, messageWithAttachments] : prev));
      
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

  // Função de envio com suporte a anexos
  async function sendMessage(content) {
    if (!activeConversation) return;
    
    const attachments = pendingAttachments.map(att => ({
      data: att.data,
      type: att.type,
      name: att.name,
      size: att.size
    }));

    // Emite a mensagem com os anexos
    socket.emit('dm:send', { 
      conversationId: activeConversation.id, 
      content,
      attachments
    });

    // Limpa os anexos pendentes
    setPendingAttachments([]);
  }

  // Função para adicionar anexos
  const handleFileUpload = useCallback((fileData) => {
    setPendingAttachments(prev => [...prev, fileData]);
  }, []);

  // Função para remover anexo pendente
  const removeAttachment = useCallback((index) => {
    setPendingAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const chatChannel = activeConversation
    ? { 
        id: activeConversation.id, 
        name: activeConversation.user?.display_name || activeConversation.user?.username,
        user: activeConversation.user
      }
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
            <span style={styles.navIcon}>
              <img src={friendsIcon} alt="" style={styles.navIconImg} />
            </span> 
            Amigos
          </button>

          <div style={styles.listLabel}>Mensagens diretas</div>

          {conversations.length === 0 && (
            <div style={styles.emptyDmState}>
              <EmptyDMArt size={92} />
              <div style={styles.emptyHint}>
                Nenhuma conversa ainda. Adicione um amigo e chame de "Mensagem".
              </div>
            </div>
          )}

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
                    <div style={{ ...styles.avatar, background: c.user?.avatar_color || 'var(--accent)' }}>
                      {initials || '?'}
                    </div>
                  )}
                  <div style={{ ...styles.dot, background: statusMeta(c.user?.status).color }} />
                </div>
                <div style={styles.convMeta}>
                  <div style={styles.convName}>{name}</div>
                  <div style={{ ...styles.convPreview, ...(unread > 0 ? styles.convPreviewUnread : {}) }}>
                    {preview}
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
            onFileUpload={handleFileUpload}
            pendingAttachments={pendingAttachments}
            removeAttachment={removeAttachment}
            typingUsers={typingUsers} 
            isDM 
            user={user}
          />
        ) : (
          <FriendsPanel 
            api={api} 
            socket={socket} 
            currentUserId={user.id} 
            onOpenDM={openWithFriend} 
          />
        )}
      </div>
    </div>
  );
}

// ... (estilos mantidos os mesmos)