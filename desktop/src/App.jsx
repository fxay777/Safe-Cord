import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { createApiClient, createSocket, uploadProfileImage, removeProfileImage, uploadServerImage, removeServerImage, updateServer, regenerateInviteCode, updateStatus, uploadMessageAttachment } from './api';
import { useVoiceChannel } from './useVoiceChannel';
import { useSettings } from './useSettings';
import { useAccounts } from './useAccounts';
import { playMuteSound, playUnmuteSound, playDeafenSound, playUndeafenSound } from './sounds';

import AuthScreen from './components/AuthScreen';
import ServerRail from './components/ServerRail';
import ChannelSidebar from './components/ChannelSidebar';
import ChatView from './components/ChatView';
import MemberList from './components/MemberList';
import ScreenShareViewer from './components/ScreenShareViewer';
import ScreenSharePicker from './components/ScreenSharePicker';
import ServerSettingsModal from './components/ServerSettingsModal';
import ErrorBoundary from './components/ErrorBoundary';
import VerifyEmailScreen from './components/VerifyEmailScreen';
import ShopModal from './components/ShopModal';
import DirectMessagesView from './components/DirectMessagesView';
import SettingsModal from './components/SettingsModal';
import ProfileEditModal from './components/ProfileEditModal';
import ProfileViewer from './components/ProfileViewer';
import IncomingCallModal from './components/IncomingCallModal';
import { startRingtone, startDialTone } from './sounds';

export default function App() {
  const accountsHook = useAccounts();
  const { token, user, accounts, addOrSwitchAccount, switchAccount, removeAccount, updateActiveUser } = accountsHook;
  const [addingAccount, setAddingAccount] = useState(false);

  const [view, setView] = useState('server'); // 'server' | 'friends'
  const [pendingFriendRequests, setPendingFriendRequests] = useState(0);
  const [unreadByChannel, setUnreadByChannel] = useState({}); // { channelId: count } — acumula até o canal ser aberto

  const [servers, setServers] = useState([]);
  const [activeServerId, setActiveServerId] = useState(null);
  const [activeChannel, setActiveChannel] = useState(null);
  const [messages, setMessages] = useState([]);
  const [members, setMembers] = useState([]);
  const [serverSettingsSection, setServerSettingsSection] = useState(null); // null = fechado
  const [panelsVersion, setPanelsVersion] = useState(0); // muda quando um painel de tickets é editado
  const [profileTarget, setProfileTarget] = useState(null); // cartão de perfil de alguém aberto
  const closeProfileViewer = useCallback(() => setProfileTarget(null), []);
  const [notice, setNotice] = useState(null); // aviso rápido no rodapé (ex.: você foi expulso)
  const [typingUsers, setTypingUsers] = useState([]);
  const [voiceChannelId, setVoiceChannelId] = useState(null);
  const [categories, setCategories] = useState([]);
  const [roles, setRoles] = useState([]);
  const [viewingScreenShare, setViewingScreenShare] = useState(null); // socketId | null
  const [screenPickerOpen, setScreenPickerOpen] = useState(false);
  // Chamadas privadas: quem está em chamada em cada conversa, a chamada tocando agora e o nome da sala
  const [dmCalls, setDmCalls] = useState({}); // conversationId -> participants[]
  const [incomingCall, setIncomingCall] = useState(null); // { conversationId, caller, isGroup }
  const [voiceRoomLabel, setVoiceRoomLabel] = useState('');
  const [focusConversation, setFocusConversation] = useState(null); // { id, nonce }
  const [shopOpen, setShopOpen] = useState(false);
  const [pendingVerification, setPendingVerification] = useState(null); // {devCode} logo após o cadastro
  const [skippedVerification, setSkippedVerification] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState('voz');
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [voicePresence, setVoicePresence] = useState({}); // { [channelId]: [user, ...] }

  const api = useMemo(() => createApiClient(token), [token]);
  const socket = useMemo(() => (token ? createSocket(token) : null), [token]);
  const voice = useVoiceChannel(socket);
  const settingsHook = useSettings();
  const { settings, setAudio } = settingsHook;

  function openSettings(tab = 'voz') {
    setSettingsTab(tab);
    setSettingsOpen(true);
  }

  function openServerProfile(userId, rect, preview) {
    // membros já trazem o status atual; o resto (cargos, servidores em comum) vem da API
    setProfileTarget({ userId, rect, preview: preview && { ...preview, status_mode: preview.status_mode || preview.status }, serverId: activeServerId });
  }

  function openProfileEdit() {
    setSettingsOpen(false);
    setProfileEditOpen(true);
  }

  function openAccountsPicker() {
    openSettings('conta');
  }

  async function handleChangeStatus(statusMode) {
    try {
      const updatedUser = await updateStatus(api, statusMode);
      updateActiveUser(updatedUser);
    } catch (err) {
      console.error('Erro ao mudar status:', err);
    }
  }

  // Preferências de mic/headset exibidas na barra de usuário: refletem a chamada
  // ativa quando conectado, ou a preferência salva pra próxima vez que entrar numa call.
  const micMuted = voice.connected ? voice.muted : settings.audio.joinMuted;
  const deafened = voice.connected ? voice.deafened : settings.audio.joinDeafened;
  const voiceChannelName = voiceChannelId?.startsWith('dm:')
    ? voiceRoomLabel || 'Chamada privada'
    : servers.flatMap((s) => s.channels || []).find((c) => c.id === voiceChannelId)?.name;

  async function joinVoiceRoom(roomId, label = '') {
    if (voice.connected) voice.leave();
    try {
      await voice.join(roomId, {
        inputDeviceId: settings.audio.inputDeviceId,
        outputDeviceId: settings.audio.outputDeviceId,
        outputVolume: settings.audio.outputVolume / 100,
        startMuted: settings.audio.joinMuted || settings.audio.joinDeafened,
      });
    } catch (err) {
      console.error('Falha ao entrar na chamada:', err);
      return false; // o erro já fica visível via voice.error / aviso
    }
    if (settings.audio.joinDeafened) voice.toggleDeafen();
    setVoiceChannelId(roomId);
    setVoiceRoomLabel(label);
    return true;
  }

  function leaveVoiceRoom() {
    voice.leave();
    setVoiceChannelId(null);
    setVoiceRoomLabel('');
  }

  // ─── Chamadas privadas ──────────────────────────────────────────────────
  async function startDmCall(conversation, label) {
    const roomId = `dm:${conversation.id}`;
    if (voiceChannelId === roomId) return;
    const alreadyRunning = (dmCalls[conversation.id] || []).length > 0;
    const ok = await joinVoiceRoom(roomId, label);
    if (ok && !alreadyRunning) socket.emit('dm:call:ring', { conversationId: conversation.id });
  }

  async function acceptIncomingCall() {
    const call = incomingCall;
    setIncomingCall(null);
    if (!call) return;
    // Leva pra conversa: é lá que fica a barra da chamada (tela compartilhada, sair…)
    setView('friends');
    setFocusConversation({ id: call.conversationId, nonce: Date.now() });
    await joinVoiceRoom(`dm:${call.conversationId}`, call.isGroup ? 'Chamada em grupo' : (call.caller?.display_name || call.caller?.username || 'Chamada'));
  }

  function declineIncomingCall() {
    if (incomingCall) socket.emit('dm:call:decline', { conversationId: incomingCall.conversationId });
    setIncomingCall(null);
  }

  // Toque enquanto a chamada chega; "chamando…" enquanto eu ligo e ninguém entrou
  useEffect(() => {
    if (!incomingCall) return undefined;
    const stop = startRingtone();
    const timeout = setTimeout(() => setIncomingCall(null), 30000);
    return () => { stop(); clearTimeout(timeout); };
  }, [incomingCall]);

  const dialing = Boolean(voice.connected && voiceChannelId?.startsWith('dm:') && voice.participants.length === 0);
  useEffect(() => {
    if (!dialing) return undefined;
    const stop = startDialTone();
    const giveUp = setTimeout(() => { stop(); setNotice('Ninguém atendeu ainda — você continua na chamada esperando.'); }, 30000);
    return () => { stop(); clearTimeout(giveUp); };
  }, [dialing]);

  useEffect(() => {
    if (!socket) return undefined;
    const onState = ({ conversationId, participants }) => setDmCalls((prev) => {
      const next = { ...prev };
      if (participants.length) next[conversationId] = participants; else delete next[conversationId];
      return next;
    });
    const onIncoming = (call) => {
      if (voiceChannelId === `dm:${call.conversationId}`) return;
      setIncomingCall(call);
    };
    const onDismissed = ({ conversationId }) => setIncomingCall((c) => (c?.conversationId === conversationId ? null : c));
    const onDeclined = ({ username }) => setNotice(`${username} recusou a chamada`);
    socket.on('dm:call:state', onState);
    socket.on('dm:call:incoming', onIncoming);
    socket.on('dm:call:dismissed', onDismissed);
    socket.on('dm:call:declined', onDeclined);
    socket.emit('dm:call:sync');
    return () => {
      socket.off('dm:call:state', onState);
      socket.off('dm:call:incoming', onIncoming);
      socket.off('dm:call:dismissed', onDismissed);
      socket.off('dm:call:declined', onDeclined);
    };
  }, [socket, voiceChannelId]);

  // Ligação chegando de uma conversa em que eu já entrei: some o aviso
  useEffect(() => {
    if (incomingCall && voiceChannelId === `dm:${incomingCall.conversationId}`) setIncomingCall(null);
  }, [voiceChannelId, incomingCall]);

  function handleToggleMic() {
    if (voice.connected) {
      voice.toggleMute();
    } else {
      const next = !settings.audio.joinMuted;
      setAudio({ joinMuted: next });
      if (next) playMuteSound(); else playUnmuteSound();
    }
  }

  function handleToggleDeafen() {
    if (voice.connected) {
      voice.toggleDeafen();
    } else {
      const next = !settings.audio.joinDeafened;
      setAudio({ joinDeafened: next, joinMuted: next ? true : settings.audio.joinMuted });
      if (next) playDeafenSound(); else playUndeafenSound();
    }
  }

  function handleAuth(newToken, newUser, verification) {
    addOrSwitchAccount(newToken, newUser);
    setAddingAccount(false);
    // Vindo do cadastro, guardamos o código de dev pra preencher a tela de verificação
    setPendingVerification(verification?.required ? { devCode: verification.devCode } : null);
    setSkippedVerification(false);
  }

  // Compartilhamento de tela: no app desktop abre o seletor de telas/janelas (igual ao
  // Discord); no navegador, o próprio navegador mostra o seletor dele.
  async function handleToggleScreenShare() {
    if (voice.screenSharing) {
      voice.stopScreenShare();
      return;
    }
    // Sempre abre o seletor: no app lista telas/janelas; no navegador escolhe a qualidade
    setScreenPickerOpen(true);
  }

  async function handlePickScreenSource(opts) {
    try {
      await voice.startScreenShare(opts);
      setScreenPickerOpen(false);
    } catch (err) {
      console.error('Falha ao compartilhar tela:', err);
      setScreenPickerOpen(false);
    }
  }

  function logoutCurrent() {
    if (user) removeAccount(user.id);
    socket?.disconnect();
  }

  function handleSwitchAccount(userId) {
    if (voice.connected) voice.leave();
    socket?.disconnect();
    switchAccount(userId);
    setActiveServerId(null);
    setActiveChannel(null);
    setView('server');
    setSettingsOpen(false);
  }

  function handleLogoutAccount(userId) {
    const isCurrent = user && String(user.id) === String(userId);
    if (isCurrent) {
      if (voice.connected) voice.leave();
      socket?.disconnect();
    }
    removeAccount(userId);
    if (isCurrent) setSettingsOpen(false);
  }

  async function saveProfile(profile) {
    try {
      const payload = {
        display_name: profile.display_name ?? user?.display_name,
        bio: profile.bio ?? user?.bio,
        avatar_color: profile.avatar_color ?? user?.avatar_color,
        spotify_track: profile.spotify_track !== undefined ? profile.spotify_track : (user?.spotify_track ?? null),
        connections: profile.connections ?? user?.connections ?? [],
      };
      // campos novos: só manda o que o editor mexeu (undefined = deixa como está; null = limpa o tema)
      for (const key of ['pronouns', 'status_text', 'theme_primary', 'theme_secondary']) {
        if (profile[key] !== undefined) payload[key] = profile[key];
      }

      const { data } = await api.put('/auth/me/profile', payload);
      updateActiveUser(data.user || data);
      return data.user || data;
    } catch (error) {
      console.error('Erro ao salvar perfil do usuário:', error);
      throw error;
    }
  }

  // Upload de foto/banner: envia o arquivo, recebe o usuário já atualizado (com a URL otimizada)
  async function handleUploadProfileImage(kind, file) {
    const updatedUser = await uploadProfileImage(api, kind, file);
    updateActiveUser(updatedUser);
    return updatedUser;
  }

  async function handleRemoveProfileImage(kind) {
    const updatedUser = await removeProfileImage(api, kind);
    updateActiveUser(updatedUser);
    return updatedUser;
  }

  // Ícone/banner do SERVIDOR (não confundir com foto/banner pessoal acima) — só o dono chama isso.
  async function handleUploadServerImage(kind, file) {
    if (!activeServerId) return;
    const updatedServer = await uploadServerImage(api, activeServerId, kind, file);
    setServers((prev) => prev.map((s) => (s.id === activeServerId ? { ...s, ...updatedServer } : s)));
    return updatedServer;
  }

  async function handleRemoveServerImage(kind) {
    if (!activeServerId) return;
    const updatedServer = await removeServerImage(api, activeServerId, kind);
    setServers((prev) => prev.map((s) => (s.id === activeServerId ? { ...s, ...updatedServer } : s)));
    return updatedServer;
  }

  // Nome, cor de destaque e descrição do servidor (personalização completa, junto com ícone/banner acima).
  async function handleUpdateServer(patch) {
    if (!activeServerId) return;
    const updatedServer = await updateServer(api, activeServerId, patch);
    setServers((prev) => prev.map((s) => (s.id === activeServerId ? { ...s, ...updatedServer } : s)));
    return updatedServer;
  }

  async function handleRegenerateInvite() {
    if (!activeServerId) return;
    const invite_code = await regenerateInviteCode(api, activeServerId);
    setServers((prev) => prev.map((s) => (s.id === activeServerId ? { ...s, invite_code } : s)));
    return invite_code;
  }

  // Conecta o socket assim que autenticado
  useEffect(() => {
    if (!socket) return;
    socket.connect();
    return () => socket.disconnect();
  }, [socket]);

  // Badge de pedidos de amizade pendentes no botão "Amigos" — atualiza em tempo real
  const loadPendingFriendRequests = useCallback(async () => {
    try {
      const { data } = await api.get('/friends');
      setPendingFriendRequests(data.incoming?.length || 0);
    } catch {
      // silencioso: se der erro aqui não deve travar o resto do app
    }
  }, [api]);

  useEffect(() => {
    if (token) loadPendingFriendRequests();
  }, [token, loadPendingFriendRequests]);

  useEffect(() => {
    if (!socket) return;
    const refresh = () => loadPendingFriendRequests();
    socket.on('friend:request', refresh);
    socket.on('friend:declined', refresh);
    return () => {
      socket.off('friend:request', refresh);
      socket.off('friend:declined', refresh);
    };
  }, [socket, loadPendingFriendRequests]);

  // Carrega servidores do usuário
  const loadServers = useCallback(async () => {
    const { data } = await api.get('/servers');
    setServers(data.servers);
    if (!activeServerId && data.servers[0]) setActiveServerId(data.servers[0].id);
  }, [api, activeServerId]);

  useEffect(() => {
    if (token) loadServers();
  }, [token, loadServers]);

  const activeServer = servers.find((s) => s.id === activeServerId);

  // Sempre que o servidor ativo muda (troca manual, criação ou exclusão de servidor),
  // limpa o canal/mensagens antigos — sem isso, o chat continuava mostrando o canal
  // (e as mensagens) do servidor anterior, mesmo depois de excluído.
  useEffect(() => {
    setActiveChannel((prevChannel) => {
      if (prevChannel) socket?.emit('channel:leave', prevChannel.id);
      return null;
    });
    setMessages([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServerId]);

  // Assim que os dados do novo servidor chegam, abre o primeiro canal de texto dele
  // automaticamente — só age enquanto nenhum canal estiver selecionado.
  useEffect(() => {
    if (!activeServer || activeChannel || !socket) return;
    const firstTextChannel = activeServer.channels?.find((c) => c.type === 'text');
    if (!firstTextChannel) return;
    setActiveChannel(firstTextChannel);
    setUnreadByChannel((prev) => ({ ...prev, [firstTextChannel.id]: 0 }));
    socket.emit('channel:join', firstTextChannel.id);
    api.get(`/messages/${firstTextChannel.id}`).then(({ data }) => setMessages(data.messages));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeServer, activeChannel, socket]);


  // Total de não lidas por servidor — soma os canais de texto dele (mostra bolinha no ícone do servidor)
  const unreadByServer = useMemo(() => {
    const totals = {};
    servers.forEach((s) => {
      totals[s.id] = s.channels
        .filter((c) => c.type === 'text')
        .reduce((sum, c) => sum + (unreadByChannel[c.id] || 0), 0);
    });
    return totals;
  }, [servers, unreadByChannel]);

  // Carrega membros, categorias e cargos do servidor ativo — tudo real agora, nada mockado
  const loadServerExtras = useCallback(async () => {
    if (!activeServerId) return;
    const [membersRes, categoriesRes, rolesRes] = await Promise.all([
      api.get(`/servers/${activeServerId}/members`),
      api.get(`/servers/${activeServerId}/categories`),
      api.get(`/servers/${activeServerId}/roles`),
    ]);
    setMembers(membersRes.data.members);
    setCategories(categoriesRes.data.categories);
    setRoles(rolesRes.data.roles);
  }, [activeServerId, api]);

  useEffect(() => {
    loadServerExtras();
  }, [loadServerExtras]);

  // Minhas permissões efetivas no servidor ativo (dono = tudo; senão, união dos cargos que tenho)
  const myPermissions = useMemo(() => {
    if (!activeServer || !user) return { isOwner: false, permissions: [] };
    if (activeServer.owner_id === user.id) return { isOwner: true, permissions: [] };
    const me = members.find((m) => m.id === user.id);
    const set = new Set();
    (me?.roles || []).forEach((r) => {
      const full = roles.find((role) => role.id === r.id);
      (full?.permissions || []).forEach((p) => set.add(p));
    });
    return { isOwner: false, permissions: [...set] };
  }, [activeServer, user, members, roles]);

  // Recebe mensagens em tempo real
  useEffect(() => {
    if (!socket) return;
    const onMsg = (msg) => {
      const isOpen = view === 'server' && msg.channelId === activeChannel?.id;
      setMessages((prev) => (isOpen ? [...prev, msg] : prev));
      // Se o canal não está aberto na tela agora, acumula um "não lida" nele
      if (!isOpen) {
        setUnreadByChannel((prev) => ({ ...prev, [msg.channelId]: (prev[msg.channelId] || 0) + 1 }));
      }
    };
    const onTyping = ({ username }) => {
      setTypingUsers((prev) => (prev.includes(username) ? prev : [...prev, username]));
      setTimeout(() => setTypingUsers((prev) => prev.filter((u) => u !== username)), 3000);
    };
    const onPresence = ({ userId, status, last_seen_at }) => {
      setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, status, ...(last_seen_at ? { last_seen_at } : {}) } : m)));
    };
    // Nome/descrição de canal mudou (alguém editou) — atualiza a lista e o topo do chat
    const onChannelUpdated = ({ serverId, channel }) => {
      setServers((prev) => prev.map((s) => (s.id === serverId
        ? { ...s, channels: s.channels.map((c) => (c.id === channel.id ? { ...c, ...channel } : c)) }
        : s)));
      setActiveChannel((prev) => (prev?.id === channel.id ? { ...prev, ...channel } : prev));
    };
    // Fui expulso/banido de um servidor: some da lista na hora
    const onServerRemoved = ({ serverId, kind }) => {
      setServers((prev) => {
        const gone = prev.find((x) => x.id === serverId);
        if (gone) setNotice(kind === 'ban' ? `Você foi banido de "${gone.name}"` : `Você foi expulso de "${gone.name}"`);
        const rest = prev.filter((x) => x.id !== serverId);
        setActiveServerId((cur) => (cur === serverId ? rest[0]?.id || null : cur));
        return rest;
      });
      setServerSettingsSection(null);
    };
    // Alguém saiu/foi removido do servidor aberto
    const onMemberRemoved = ({ serverId, userId }) => {
      if (serverId === activeServerId) setMembers((prev) => prev.filter((m) => m.id !== userId));
    };
    // Alguém mudou o perfil (nome, foto, status, tema…): atualiza a lista de membros
    const onUserUpdated = ({ user: u }) => {
      if (!u) return;
      setMembers((prev) => prev.map((m) => (m.id === u.id ? { ...m, ...u, roles: m.roles } : m)));
    };
    // Tickets: canal privado apareceu/mudou pra mim, ou perdi o acesso
    const upsertChannel = (serverId, channel) => {
      setServers((prev) => prev.map((s) => {
        if (s.id !== serverId) return s;
        const exists = s.channels.some((c) => c.id === channel.id);
        return { ...s, channels: exists ? s.channels.map((c) => (c.id === channel.id ? { ...c, ...channel } : c)) : [...s.channels, channel] };
      }));
      setActiveChannel((prev) => (prev?.id === channel.id ? { ...prev, ...channel } : prev));
    };
    const onChannelUpsert = ({ serverId, channel }) => {
      upsertChannel(serverId, channel);
      if (serverId === activeServerId) loadServerExtras(); // pode ter nascido a categoria "Tickets"
    };
    const onChannelRemoved = ({ serverId, channelId }) => {
      setServers((prev) => prev.map((s) => (s.id === serverId ? { ...s, channels: s.channels.filter((c) => c.id !== channelId) } : s)));
      setActiveChannel((prev) => {
        if (prev?.id !== channelId) return prev;
        setNotice('Você não tem mais acesso a esse canal');
        setMessages([]);
        return null; // o efeito de "primeiro canal" abre outro sozinho
      });
    };
    const onMessageRemoved = ({ messageId }) => setMessages((prev) => prev.filter((m) => m.id !== messageId));
    const onPanelUpdated = () => setPanelsVersion((v) => v + 1);
    const onMessageRejected = ({ error }) => setNotice(error || 'Mensagem não enviada');
    const onTicketOpened = ({ serverId, ticket }) => {
      const srv = servers.find((x) => x.id === serverId);
      setNotice(`Novo ticket #${String(ticket.number).padStart(4, '0')} · ${ticket.option_label}${srv ? ` em ${srv.name}` : ''}`);
    };
    const onVoicePresence = ({ channelId, participants }) => {
      setVoicePresence((prev) => ({ ...prev, [channelId]: participants }));
    };
    socket.on('message:new', onMsg);
    socket.on('typing', onTyping);
    socket.on('presence:update', onPresence);
    socket.on('voice:presence', onVoicePresence);
    socket.on('channel:updated', onChannelUpdated);
    socket.on('server:removed', onServerRemoved);
    socket.on('server:member-removed', onMemberRemoved);
    socket.on('user:updated', onUserUpdated);
    socket.on('channel:upsert', onChannelUpsert);
    socket.on('channel:removed', onChannelRemoved);
    socket.on('message:removed', onMessageRemoved);
    socket.on('ticket:panel-updated', onPanelUpdated);
    socket.on('message:rejected', onMessageRejected);
    socket.on('ticket:opened', onTicketOpened);
    return () => {
      socket.off('channel:upsert', onChannelUpsert);
      socket.off('channel:removed', onChannelRemoved);
      socket.off('message:removed', onMessageRemoved);
      socket.off('ticket:panel-updated', onPanelUpdated);
      socket.off('message:rejected', onMessageRejected);
      socket.off('ticket:opened', onTicketOpened);
      socket.off('channel:updated', onChannelUpdated);
      socket.off('server:removed', onServerRemoved);
      socket.off('server:member-removed', onMemberRemoved);
      socket.off('user:updated', onUserUpdated);
      socket.off('message:new', onMsg);
      socket.off('typing', onTyping);
      socket.off('presence:update', onPresence);
      socket.off('voice:presence', onVoicePresence);
    };
  }, [socket, activeChannel, view, activeServerId, servers, loadServerExtras]);

  // O aviso do rodapé some sozinho
  useEffect(() => {
    if (!notice) return undefined;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // Avisa o servidor qual grupo estamos olhando, pra receber (e manter atualizada) a lista
  // de quem está em cada canal de voz — mesmo sem ter entrado na chamada, igual ao Discord.
  useEffect(() => {
    if (!socket || !activeServerId) return;
    socket.emit('server:join', activeServerId);
    return () => socket.emit('server:leave', activeServerId);
  }, [socket, activeServerId]);

  async function selectChannel(channel) {
    if (channel.type === 'voice') {
      if (voice.connected && voiceChannelId === channel.id) {
        leaveVoiceRoom();
      } else {
        const ok = await joinVoiceRoom(channel.id, channel.name);
        if (!ok && voice.error) setNotice(voice.error);
      }
      return;
    }

    if (activeChannel) socket.emit('channel:leave', activeChannel.id);
    setActiveChannel(channel);
    setMessages([]);
    setUnreadByChannel((prev) => ({ ...prev, [channel.id]: 0 })); // abriu o canal = leu tudo
    socket.emit('channel:join', channel.id);
    const { data } = await api.get(`/messages/${channel.id}`);
    setMessages(data.messages);
  }

  function sendMessage(content, attachments = []) {
    socket.emit('message:send', { channelId: activeChannel.id, content, attachments });
  }

  // --- Categorias (Grupos) ---
  async function handleCreateGroup(name) {
    const { data } = await api.post(`/servers/${activeServerId}/categories`, { name });
    setCategories((prev) => [...prev, data.category]);
  }

  async function handleRenameGroup(id, name) {
    const { data } = await api.put(`/servers/${activeServerId}/categories/${id}`, { name });
    setCategories((prev) => prev.map((c) => (c.id === id ? data.category : c)));
  }

  async function handleDeleteGroup(id) {
    await api.delete(`/servers/${activeServerId}/categories/${id}`);
    setCategories((prev) => prev.filter((c) => c.id !== id));
    setServers((prev) =>
      prev.map((s) =>
        s.id === activeServerId
          ? { ...s, channels: s.channels.map((ch) => (ch.category_id === id ? { ...ch, category_id: null } : ch)) }
          : s
      )
    );
  }

  // --- Cargos ---
  async function handleCreateRole(name, color, extra = {}) {
    const { data } = await api.post(`/servers/${activeServerId}/roles`, { name, color, permissions: extra.permissions });
    setRoles((prev) => [data.role, ...prev]);
    return data.role;
  }

  async function handleUpdateRole(id, updates) {
    const { data } = await api.put(`/servers/${activeServerId}/roles/${id}`, updates);
    setRoles((prev) => prev.map((r) => (r.id === id ? data.role : r)));
  }

  async function handleDeleteRole(id) {
    await api.delete(`/servers/${activeServerId}/roles/${id}`);
    setRoles((prev) => prev.filter((r) => r.id !== id));
    setMembers((prev) => prev.map((m) => ({ ...m, roles: (m.roles || []).filter((r) => r.id !== id) })));
  }

  // Substitui a lista completa de cargos de um membro (é o que faltava pra "setar cargo")
  async function handleAssignMemberRoles(userId, roleIds) {
    await api.put(`/servers/${activeServerId}/roles/members/${userId}`, { roleIds });
    const roleObjs = roles.filter((r) => roleIds.includes(r.id)).sort((a, b) => b.position - a.position);
    setMembers((prev) => prev.map((m) => (m.id === userId ? { ...m, roles: roleObjs } : m)));
  }

  // --- Canais ---
  async function handleCreateChannel(name, type, categoryId) {
    const { data } = await api.post(`/servers/${activeServerId}/channels`, { name, type, category_id: categoryId });
    setServers((prev) =>
      prev.map((s) => (s.id === activeServerId ? { ...s, channels: [...s.channels, data.channel] } : s))
    );
  }

  async function handleUpdateChannelTopic(channelId, topic) {
    return handleUpdateChannel(channelId, { topic });
  }

  // Nome, descrição e categoria de um canal (tela de configurações do servidor)
  async function handleUpdateChannel(channelId, patch) {
    const { data } = await api.put(`/servers/${activeServerId}/channels/${channelId}`, patch);
    setServers((prev) => prev.map((s) => (s.id === activeServerId
      ? { ...s, channels: s.channels.map((c) => (c.id === channelId ? { ...c, ...data.channel } : c)) }
      : s)));
    setActiveChannel((prev) => (prev?.id === channelId ? { ...prev, ...data.channel } : prev));
  }

  async function handleDeleteChannel(channelId) {
    await api.delete(`/servers/${activeServerId}/channels/${channelId}`);
    setServers((prev) =>
      prev.map((s) => (s.id === activeServerId ? { ...s, channels: s.channels.filter((c) => c.id !== channelId) } : s))
    );
    if (activeChannel?.id === channelId) setActiveChannel(null);
    if (voiceChannelId === channelId) setVoiceChannelId(null);
  }

  async function createServer(name) {
    const { data } = await api.post('/servers', { name });
    setServers((prev) => [...prev, data.server]);
    setActiveServerId(data.server.id);
  }

  async function joinServer(inviteCode) {
    const { data } = await api.post('/servers/join', { inviteCode });
    await loadServers();
    setActiveServerId(data.server.id);
  }

  function pickNextServer(afterId) {
    const remaining = servers.filter((s) => s.id !== afterId);
    setActiveServerId(remaining[0]?.id || null);
  }

  async function leaveServer(serverId) {
    await api.post(`/servers/${serverId}/leave`);
    setServers((prev) => prev.filter((s) => s.id !== serverId));
    if (activeServerId === serverId) pickNextServer(serverId);
  }

  async function deleteServer(serverId) {
    await api.delete(`/servers/${serverId}`);
    setServers((prev) => prev.filter((s) => s.id !== serverId));
    if (activeServerId === serverId) pickNextServer(serverId);
  }

  if (!token || !user) {
    return <AuthScreen onAuth={handleAuth} />;
  }

  if (addingAccount) {
    return <AuthScreen onAuth={handleAuth} onCancel={() => setAddingAccount(false)} />;
  }

  // Depois do cadastro, pede o código do email antes de abrir o app (dá pra pular)
  if (user.email && !user.email_verified && !skippedVerification) {
    return (
      <VerifyEmailScreen
        api={api}
        user={user}
        devCode={pendingVerification?.devCode}
        onVerified={(updated) => {
          updateActiveUser(updated);
          setPendingVerification(null);
        }}
        onSkip={() => setSkippedVerification(true)}
        onLogout={logoutCurrent}
      />
    );
  }

  return (
    <div style={styles.appWrap}>
      <ServerRail
        servers={servers}
        activeId={activeServerId}
        onSelect={(id) => {
          setActiveServerId(id);
          setView('server');
        }}
        onCreate={createServer}
        onJoin={joinServer}
        currentUserId={user.id}
        onLeaveServer={leaveServer}
        onDeleteServer={deleteServer}
        friendsActive={view === 'friends'}
        onOpenFriends={() => setView('friends')}
        pendingFriendRequests={pendingFriendRequests}
        unreadByServer={unreadByServer}
      />

      {view === 'friends' ? (
        <ErrorBoundary label="Amigos e Conversas">
        <DirectMessagesView
          onOpenUserProfile={(userId, rect, preview) => setProfileTarget({ userId, rect, preview, serverId: null })}
          api={api}
          socket={socket}
          user={user}
          micMuted={micMuted}
          deafened={deafened}
          inCall={voice.connected}
          onToggleMic={handleToggleMic}
          onToggleDeafen={handleToggleDeafen}
          onOpenSettings={() => openSettings('voz')}
          onOpenProfile={openProfileEdit}
          onChangeStatus={handleChangeStatus}
          onOpenAccounts={openAccountsPicker}
          voiceConnected={voice.connected}
          voiceChannelName={voiceChannelName}
          voiceParticipants={voice.participants}
          voiceError={voice.error}
          onToggleVoiceMute={voice.toggleMute}
          onLeaveVoice={leaveVoiceRoom}
          onUploadAttachment={(file) => uploadMessageAttachment(api, file)}
          screenSharing={voice.screenSharing}
          onToggleScreenShare={handleToggleScreenShare}
          remoteScreenShares={voice.remoteScreenShares}
          onViewScreenShare={setViewingScreenShare}
          onOpenShop={() => setShopOpen(true)}
          dmCalls={dmCalls}
          focusConversation={focusConversation}
          currentVoiceRoom={voiceChannelId}
          onStartCall={startDmCall}
        />
        </ErrorBoundary>
      ) : (
        <ErrorBoundary label="Servidor">
          <div style={styles.middleCol}>
            <ChannelSidebar
              server={activeServer}
              activeChannelId={activeChannel?.id}
              voiceChannelId={voiceChannelId}
              onSelectChannel={selectChannel}
              user={user}
              categories={categories}
              members={members}
              myPermissions={myPermissions}
              roles={roles}
              onCreateGroup={handleCreateGroup}
              onRenameGroup={handleRenameGroup}
              onDeleteGroup={handleDeleteGroup}
              onCreateRole={handleCreateRole}
              onUpdateRole={handleUpdateRole}
              onDeleteRole={handleDeleteRole}
              onAssignMemberRoles={handleAssignMemberRoles}
              onCreateChannel={handleCreateChannel}
              onDeleteChannel={handleDeleteChannel}
              unreadByChannel={unreadByChannel}
              onUpdateServer={handleUpdateServer}
              onRegenerateInvite={handleRegenerateInvite}
              onDeleteServer={deleteServer}
              onLeaveServer={leaveServer}
              themeAccent={settingsHook.activeTheme.accent}
              micMuted={micMuted}
              deafened={deafened}
              inCall={voice.connected}
              onToggleMic={handleToggleMic}
              onToggleDeafen={handleToggleDeafen}
              onOpenSettings={() => openSettings('voz')}
              onOpenProfile={openProfileEdit}
              onChangeStatus={handleChangeStatus}
              onOpenAccounts={openAccountsPicker}
              voicePresence={voicePresence}
              voiceConnected={voice.connected}
              voiceChannelName={voiceChannelName}
              voiceParticipants={voice.participants}
              voiceError={voice.error}
              onToggleVoiceMute={voice.toggleMute}
              onLeaveVoice={leaveVoiceRoom}
              screenSharing={voice.screenSharing}
              onToggleScreenShare={handleToggleScreenShare}
              remoteScreenShares={voice.remoteScreenShares}
              onViewScreenShare={setViewingScreenShare}
              onOpenShop={() => setShopOpen(true)}
              onUploadServerImage={handleUploadServerImage}
              onRemoveServerImage={handleRemoveServerImage}
              onOpenServerSettings={(section) => setServerSettingsSection(section || 'overview')}
            />

            {voice.connecting && !voice.connected && (
              <div style={styles.voiceConnectingBanner}>Conectando ao canal de voz…</div>
            )}
            {voice.error && !voice.connected && (
              <div style={styles.voiceErrorBanner}>{voice.error}</div>
            )}
          </div>

          <div style={styles.mainChatArea}>
            <ChatView
              channel={activeChannel}
              messages={messages}
              onSend={sendMessage}
              onTyping={() => activeChannel && socket.emit('typing', { channelId: activeChannel.id })}
              onUploadAttachment={(file) => uploadMessageAttachment(api, file)}
              typingUsers={typingUsers}
              serverName={activeServer?.name}
              inviteCode={activeServer?.invite_code}
              canEditTopic={Boolean(myPermissions?.isOwner || myPermissions?.permissions?.includes('gerenciar_canais'))}
              onUpdateTopic={(topic) => activeChannel && handleUpdateChannelTopic(activeChannel.id, topic)}
              onOpenProfile={openServerProfile}
              ticketTools={{
                api,
                serverId: activeServerId,
                me: user,
                members,
                panelsVersion,
                onNotice: setNotice,
                onOpenChannel: (ch) => {
                  setServers((prev) => prev.map((s) => (s.id === activeServerId && !s.channels.some((c) => c.id === ch.id) ? { ...s, channels: [...s.channels, ch] } : s)));
                  selectChannel(ch);
                },
                onGoToChannelId: (id) => {
                  const ch = activeServer?.channels?.find((c) => c.id === id);
                  if (ch) selectChannel(ch);
                },
              }}
            />
          </div>

          <MemberList members={members} ownerId={activeServer?.owner_id} onOpenProfile={openServerProfile} />
        </ErrorBoundary>
      )}

      {serverSettingsSection && activeServer && (
        <ServerSettingsModal
          api={api}
          server={activeServer}
          categories={categories}
          roles={roles}
          members={members}
          user={user}
          permissions={myPermissions}
          initialSection={serverSettingsSection}
          onClose={() => setServerSettingsSection(null)}
          onUpdateServer={handleUpdateServer}
          onUploadServerImage={handleUploadServerImage}
          onRemoveServerImage={handleRemoveServerImage}
          onRegenerateInvite={handleRegenerateInvite}
          onCreateChannel={handleCreateChannel}
          onUpdateChannel={handleUpdateChannel}
          onDeleteChannel={handleDeleteChannel}
          onCreateCategory={handleCreateGroup}
          onRenameCategory={handleRenameGroup}
          onDeleteCategory={handleDeleteGroup}
          onCreateRole={handleCreateRole}
          onUpdateRole={handleUpdateRole}
          onDeleteRole={handleDeleteRole}
          onAssignMemberRoles={handleAssignMemberRoles}
          onMemberRemoved={(userId) => setMembers((prev) => prev.filter((m) => m.id !== userId))}
          onDeleteServer={deleteServer}
          onLeaveServer={leaveServer}
          onGoToChannel={(channelId) => {
            const ch = activeServer?.channels?.find((c) => c.id === channelId);
            if (!ch) { setNotice('Você não vê esse canal'); return; }
            setServerSettingsSection(null);
            selectChannel(ch);
          }}
        />
      )}

      {notice && (
        <div style={styles.notice} onClick={() => setNotice(null)} role="status">
          {notice}
        </div>
      )}

      {incomingCall && (
        <IncomingCallModal call={incomingCall} onAccept={acceptIncomingCall} onDecline={declineIncomingCall} />
      )}

      {screenPickerOpen && (
        <ScreenSharePicker
          loadSources={voice.getScreenSources}
          onPick={handlePickScreenSource}
          onClose={() => setScreenPickerOpen(false)}
        />
      )}

      <ScreenShareViewer
        stream={voice.remoteScreenShares?.get(viewingScreenShare)}
        viewerName={voice.participants.find((p) => p.socketId === viewingScreenShare)?.user?.username}
        onClose={() => setViewingScreenShare(null)}
      />

      {shopOpen && (
        <ShopModal
          api={api}
          user={user}
          onClose={() => setShopOpen(false)}
          onUserUpdated={updateActiveUser}
        />
      )}

      <SettingsModal
        open={settingsOpen}
        initialTab={settingsTab}
        onClose={() => setSettingsOpen(false)}
        settings={settingsHook.settings}
        activeTheme={settingsHook.activeTheme}
        isCustom={settingsHook.isCustom}
        setPreset={settingsHook.setPreset}
        setCustomGradient={settingsHook.setCustomGradient}
        setMode={settingsHook.setMode}
        setAudio={settingsHook.setAudio}
        voice={voice}
        accounts={accounts}
        activeUserId={user?.id}
        onSwitchAccount={handleSwitchAccount}
        onAddAccount={() => setAddingAccount(true)}
        onLogoutAccount={handleLogoutAccount}
        onOpenProfile={openProfileEdit}
        user={user}
      />

      <ProfileEditModal
        open={profileEditOpen}
        user={user}
        api={api}
        onClose={() => setProfileEditOpen(false)}
        onSaveProfile={saveProfile}
        onUploadProfileImage={handleUploadProfileImage}
        onRemoveProfileImage={handleRemoveProfileImage}
        themeAccent={settingsHook.activeTheme.accent}
      />

      <ProfileViewer
        api={api}
        target={profileTarget}
        me={user}
        onClose={closeProfileViewer}
        onEditOwn={openProfileEdit}
      />
    </div>
  );
}

const styles = {
  // Layout "flutuante" no estilo Stoat: a barra de servidores fica direto na moldura e
  // cada coluna vira um painel arredondado, com um respiro entre eles.
  notice: {
    position: 'fixed', left: '50%', bottom: 24, transform: 'translateX(-50%)', zIndex: 300, cursor: 'pointer',
    background: 'var(--text-hi)', color: 'var(--bg-surface)', fontSize: 13.5, fontWeight: 600,
    padding: '11px 18px', borderRadius: 14, boxShadow: 'var(--shadow-lg)',
  },
  appWrap: {
    display: 'flex', height: '100%', gap: 'var(--panel-gap)',
    padding: 'var(--panel-gap) var(--panel-gap) var(--panel-gap) 0', background: 'var(--bg-void)',
  },
  middleCol: {
    display: 'flex', flexDirection: 'column', width: 264, height: '100%', flexShrink: 0,
    background: 'var(--bg-base)', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
    border: '1px solid var(--border)',
  },
  mainChatArea: {
    flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0,
    background: 'var(--bg-surface)', borderRadius: 'var(--radius-lg)', overflow: 'hidden',
    border: '1px solid var(--border)',
  },
  voiceConnectingBanner: {
    padding: '8px 12px', fontSize: 11.5, color: 'var(--text-mid)', background: 'var(--bg-elevated)',
    borderTop: '1px solid var(--border)', textAlign: 'center',
  },
  voiceErrorBanner: {
    padding: '8px 12px', fontSize: 11.5, color: 'var(--danger)', background: 'rgba(240,101,79,0.1)',
    borderTop: '1px solid rgba(240,101,79,0.35)', textAlign: 'center',
  },
};