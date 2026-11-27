const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { canViewChannel, getTicket, ticketAudience } = require('./tickets');
const { hasPermission } = require('./permissions');
const { verifyToken } = require('./auth');
const { effectiveStatus } = require('./statusUtils');

// voiceRooms: Map<channelId, Set<socketId>>  — quem está em cada sala de voz
const voiceRooms = new Map();
const socketUser = new Map(); // socketId -> user info
const userSockets = new Map(); // userId -> Set<socketId>  — pra mandar evento pra um usuário específico (ex: pedido de amizade)

// Só aceita o que esperamos de um anexo. O arquivo já subiu por REST antes da mensagem;
// aqui é só repassar os metadados, nunca confiar cegamente no que o cliente mandou.
function sanitizeAttachments(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((a) => a && typeof a.url === 'string' && a.url.startsWith('/uploads/'))
    .slice(0, 6) // no máximo 6 arquivos por mensagem
    .map((a) => ({
      url: a.url,
      name: typeof a.name === 'string' ? a.name.slice(0, 200) : 'arquivo',
      size: typeof a.size === 'number' ? a.size : null,
      width: typeof a.width === 'number' ? a.width : null,
      height: typeof a.height === 'number' ? a.height : null,
      type: typeof a.type === 'string' ? a.type : 'image/webp',
    }));
}

/** Quem participa de uma conversa (1:1 ou grupo). */
const badgesOfStmt = db.prepare(
  `SELECT b.id, b.name, b.description, b.icon, b.color
   FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
   WHERE ub.user_id = ? ORDER BY b.position ASC`
);

/** Insígnias do autor, pra aparecerem ao lado do nome na mensagem. */
function badgesOf(userId) {
  try { return badgesOfStmt.all(userId); } catch { return []; }
}

function conversationMemberIds(conversation) {
  const rows = db.prepare('SELECT user_id FROM dm_participants WHERE conversation_id = ?').all(conversation.id);
  if (rows.length > 0) return rows.map((r) => r.user_id);
  // Conversas antigas, criadas antes da tabela de participantes
  return [conversation.user_a, conversation.user_b].filter(Boolean);
}


/**
 * Emite um evento pra todas as conexões abertas de um usuário (ele pode estar
 * logado em mais de uma aba/dispositivo). Retorna 'em silêncio' se ele estiver offline.
 */
function attachRealtime(io) {
  // Autentica cada conexão de socket usando o mesmo JWT do REST
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      const payload = verifyToken(token);
      socket.user = payload;
      next();
    } catch (e) {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socketUser.set(socket.id, socket.user);
    if (!userSockets.has(socket.user.id)) userSockets.set(socket.user.id, new Set());
    userSockets.get(socket.user.id).add(socket.id);
    socket.join(`user:${socket.user.id}`); // permite avisar essa pessoa de qualquer lugar do servidor

    db.prepare('UPDATE users SET status = ? WHERE id = ?').run('online', socket.user.id);
    // Respeita o status escolhido (ausente/não incomodar/invisível) mesmo ao reconectar —
    // sem isso, a pessoa sempre voltava a aparecer "online" pros outros, ignorando a preferência.
    const currentModeRow = db.prepare('SELECT status_mode FROM users WHERE id = ?').get(socket.user.id);
    const currentMode = currentModeRow?.status_mode || 'online';
    socket.broadcast.emit('presence:update', { userId: socket.user.id, status: effectiveStatus(currentMode, true) });

    // ---- Chat de texto ----
    socket.on('channel:join', (channelId) => {
      // Só entra na sala quem pode ver o canal — senão dava pra "escutar" qualquer canal pelo id
      const ch = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
      if (!ch || !canViewChannel(ch, socket.user.id)) return;
      socket.join(`channel:${channelId}`);
    });

    socket.on('channel:leave', (channelId) => {
      socket.leave(`channel:${channelId}`);
    });

    socket.on('message:send', ({ channelId, content, attachments }) => {
      const trimmed = (content || '').trim().slice(0, 4000);
      const safeAttachments = sanitizeAttachments(attachments);
      if ((!trimmed && safeAttachments.length === 0) || !channelId) return;

      // Só membro do servidor pode mandar mensagem no canal (antes qualquer um com o id mandava)
      const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
      if (!channel || !canViewChannel(channel, socket.user.id)) return;
      if (channel.ticket_id) {
        const t = getTicket(channel.ticket_id);
        if (!t || t.status !== 'open') {
          socket.emit('message:rejected', { channelId, error: 'Esse ticket está fechado' });
          return;
        }
      }

      const id = uuidv4();
      const created_at = Date.now();
      db.prepare(
        'INSERT INTO messages (id, channel_id, author_id, content, created_at, attachments) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, channelId, socket.user.id, trimmed, created_at, JSON.stringify(safeAttachments));

      const author = db
        .prepare('SELECT username, tag, avatar_color, avatar_url, banner_url, bio, display_name FROM users WHERE id = ?')
        .get(socket.user.id);

      // Vai pra TODOS os membros do servidor (sala pessoal de cada um), não só pra quem está
      // com o canal aberto — é isso que faz o contador de não lidas acumular nos outros canais.
      // Canal de ticket: só pra quem enxerga o ticket
      const memberRooms = channel.ticket_id
        ? ticketAudience(getTicket(channel.ticket_id)).map((u) => `user:${u}`)
        : db
          .prepare('SELECT user_id FROM server_members WHERE server_id = ?')
          .all(channel.server_id)
          .map((m) => `user:${m.user_id}`);
      // Só pras salas pessoais de quem pode ver AGORA (a sala do canal pode ter alguém que perdeu acesso)
      io.to(memberRooms).emit('message:new', {
        id,
        channelId,
        serverId: channel.server_id,
        content: trimmed,
        kind: 'text',
        meta: {},
        attachments: safeAttachments,
        created_at,
        author_id: socket.user.id,
        username: author.username,
        tag: author.tag,
        avatar_color: author.avatar_color,
        avatar_url: author.avatar_url,
        banner_url: author.banner_url,
        bio: author.bio,
        display_name: author.display_name,
        badges: badgesOf(socket.user.id),
      });
    });

    socket.on('typing', ({ channelId }) => {
      if (!socket.rooms.has(`channel:${channelId}`)) return;
      const typingCh = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
      if (!typingCh || !canViewChannel(typingCh, socket.user.id)) { socket.leave(`channel:${channelId}`); return; }
      socket.to(`channel:${channelId}`).emit('typing', {
        channelId,
        username: socket.user.username,
      });
    });

    // ---- Mensagens diretas (DM) ----
    socket.on('dm:send', ({ conversationId, content, attachments }) => {
      const trimmed = (content || '').trim().slice(0, 4000);
      const safeAttachments = sanitizeAttachments(attachments);
      if ((!trimmed && safeAttachments.length === 0) || !conversationId) return;

      const conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(conversationId);
      if (!conversation) return;

      const memberIds = conversationMemberIds(conversation);
      if (!memberIds.includes(socket.user.id)) return; // não é participante

      const id = uuidv4();
      const created_at = Date.now();
      db.prepare(
        'INSERT INTO dm_messages (id, conversation_id, author_id, content, created_at, attachments) VALUES (?, ?, ?, ?, ?, ?)'
      ).run(id, conversationId, socket.user.id, trimmed, created_at, JSON.stringify(safeAttachments));

      const author = db
        .prepare('SELECT username, tag, avatar_color, avatar_url, banner_url, bio, display_name FROM users WHERE id = ?')
        .get(socket.user.id);

      const payload = {
        id,
        conversationId,
        content: trimmed,
        attachments: safeAttachments,
        created_at,
        author_id: socket.user.id,
        username: author.username,
        tag: author.tag,
        avatar_color: author.avatar_color,
        avatar_url: author.avatar_url,
        banner_url: author.banner_url,
        bio: author.bio,
        display_name: author.display_name,
        badges: badgesOf(socket.user.id),
      };

      // Manda pra todo mundo da conversa (1:1 ou grupo), mesmo quem ainda não abriu
      memberIds.forEach((uid) => {
        userSockets.get(uid)?.forEach((sid) => io.to(sid).emit('dm:new', payload));
      });
    });

    socket.on('dm:typing', ({ conversationId }) => {
      const conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(conversationId);
      if (!conversation) return;
      conversationMemberIds(conversation)
        .filter((uid) => uid !== socket.user.id)
        .forEach((uid) => {
          userSockets.get(uid)?.forEach((sid) =>
            io.to(sid).emit('dm:typing', { conversationId, username: socket.user.username })
          );
        });
    });

    // ---- Sinalização WebRTC para canais de voz (topologia mesh) ----
    socket.on('server:join', (serverId) => {
      socket.join(`server:${serverId}`);
      // Manda o estado atual de todas as salas de voz desse servidor pra quem acabou
      // de entrar — sem isso, só quem já tava vendo a tela quando alguém entrou na call
      // é que sabia; quem abria o servidor depois via a lista de canais sem ninguém.
      const voiceChannels = db.prepare("SELECT id FROM channels WHERE server_id = ? AND type = 'voice'").all(serverId);
      voiceChannels.forEach(({ id: channelId }) => {
        const room = voiceRooms.get(channelId);
        const participants = room
          ? Array.from(room).map((socketId) => socketUser.get(socketId)).filter(Boolean)
          : [];
        socket.emit('voice:presence', { channelId, participants });
      });
    });
    socket.on('server:leave', (serverId) => socket.leave(`server:${serverId}`));

    // Entrar numa sala de voz. Sala = canal de voz de servidor OU chamada privada ("dm:<conversa>").
    // Responde com ack: { ok, bitrate, userLimit } ou { error }.
    socket.on('voice:join', (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      const roomId = String(typeof payload === 'string' ? payload : payload?.channelId || '');
      const check = canJoinVoice(roomId, socket.user.id);
      if (check.error) { reply({ error: check.error }); return; }

      if (socket.data.voiceChannel && socket.data.voiceChannel !== roomId) leaveVoice(socket, io);
      if (!voiceRooms.has(roomId)) voiceRooms.set(roomId, new Set());
      const room = voiceRooms.get(roomId);
      if (room.has(socket.id)) { reply({ ok: true, ...check.info }); return; }

      if (check.info.userLimit > 0 && room.size >= check.info.userLimit && !check.bypassLimit) {
        reply({ error: `Canal cheio (${room.size}/${check.info.userLimit})` });
        return;
      }

      socket.data.voiceChannel = roomId;
      socket.data.screenSharing = false;
      // avisa aos que já estão na sala sobre o novo peer
      room.forEach((peerId) => {
        io.to(peerId).emit('voice:peer-joined', { socketId: socket.id, user: socket.user });
      });
      // manda pro novo peer a lista de quem já está lá (pra ele iniciar as conexões)
      socket.emit('voice:existing-peers', Array.from(room).map((peerId) => ({
        socketId: peerId,
        user: socketUser.get(peerId),
        sharing: Boolean(io.sockets.sockets.get(peerId)?.data.screenSharing),
      })));

      room.add(socket.id);
      socket.join(`voice:${roomId}`);
      io.to(`voice:${roomId}`).emit('voice:room-update', { channelId: roomId, size: room.size });
      broadcastVoicePresence(io, roomId);
      reply({ ok: true, ...check.info });
    });

    // Checagem antes de abrir o microfone: pode entrar? está cheio?
    socket.on('voice:join-check', (payload, ack) => {
      if (typeof ack !== 'function') return;
      const roomId = String(payload?.channelId || '');
      const check = canJoinVoice(roomId, socket.user.id);
      if (check.error) return ack({ error: check.error });
      const size = voiceRooms.get(roomId)?.size || 0;
      if (check.info.userLimit > 0 && size >= check.info.userLimit && !check.bypassLimit) {
        return ack({ error: `Canal cheio (${size}/${check.info.userLimit})` });
      }
      ack({ ok: true, ...check.info, size });
    });

    // Sinalização só entre quem está na MESMA sala (antes dava pra mandar pra qualquer socket)
    socket.on('voice:signal', ({ to, signal } = {}) => {
      const roomId = socket.data.voiceChannel;
      if (!roomId || !voiceRooms.get(roomId)?.has(to)) return;
      io.to(to).emit('voice:signal', { from: socket.id, signal, user: socket.user });
    });

    // Quem compartilha avisa a sala quando começa/para — sem isso, quem estava assistindo
    // ficava com o vídeo congelado na tela depois que a pessoa parava de compartilhar.
    socket.on('voice:screen-state', ({ sharing, streamId } = {}) => {
      const channelId = socket.data.voiceChannel;
      if (!channelId) return;
      socket.data.screenSharing = Boolean(sharing);
      socket.to(`voice:${channelId}`).emit('voice:screen-state', {
        socketId: socket.id, sharing: Boolean(sharing), streamId: typeof streamId === 'string' ? streamId.slice(0, 80) : null,
      });
      broadcastVoicePresence(io, channelId);
    });

    // ─── Chamadas privadas (conversas 1:1 e grupos de DM) ───────────────────
    // Quem liga entra na sala "dm:<conversa>" e manda tocar pros outros participantes.
    socket.on('dm:call:ring', ({ conversationId } = {}) => {
      const conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(conversationId);
      if (!conversation) return;
      const members = conversationMemberIds(conversation);
      if (!members.includes(socket.user.id)) return;
      if (socket.data.voiceChannel !== `dm:${conversationId}`) return; // só toca quem já está na chamada
      const caller = db.prepare('SELECT id, username, tag, display_name, avatar_url, avatar_color FROM users WHERE id = ?').get(socket.user.id);
      members.filter((uid) => uid !== socket.user.id).forEach((uid) => {
        userSockets.get(uid)?.forEach((sid) => io.to(sid).emit('dm:call:incoming', {
          conversationId, caller, isGroup: members.length > 2, memberCount: members.length,
        }));
      });
    });

    // Recusar: avisa quem ligou e para de tocar nas outras abas da mesma pessoa
    socket.on('dm:call:decline', ({ conversationId } = {}) => {
      const conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(conversationId);
      if (!conversation) return;
      const members = conversationMemberIds(conversation);
      if (!members.includes(socket.user.id)) return;
      userSockets.get(socket.user.id)?.forEach((sid) => io.to(sid).emit('dm:call:dismissed', { conversationId }));
      const room = voiceRooms.get(`dm:${conversationId}`);
      room?.forEach((sid) => io.to(sid).emit('dm:call:declined', { conversationId, userId: socket.user.id, username: socket.user.username }));
    });

    // Estado das chamadas das minhas conversas (pra mostrar "em chamada" ao abrir o app)
    socket.on('dm:call:sync', () => {
      for (const [roomId, room] of voiceRooms.entries()) {
        if (!roomId.startsWith('dm:') || room.size === 0) continue;
        const conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(roomId.slice(3));
        if (!conversation || !conversationMemberIds(conversation).includes(socket.user.id)) continue;
        socket.emit('dm:call:state', { conversationId: conversation.id, participants: roomParticipants(io, roomId) });
      }
    });

    socket.on('voice:leave', () => leaveVoice(socket, io));

    socket.on('disconnect', () => {
      leaveVoice(socket, io);
      socketUser.delete(socket.id);

      const sockets = userSockets.get(socket.user.id);
      sockets?.delete(socket.id);
      if (sockets && sockets.size === 0) {
        userSockets.delete(socket.user.id);
        const seenAt = Date.now();
        db.prepare('UPDATE users SET status = ?, last_seen_at = ? WHERE id = ?').run('offline', seenAt, socket.user.id);
        socket.broadcast.emit('presence:update', { userId: socket.user.id, status: 'offline', last_seen_at: seenAt });
      }
    });
  });

  // Usado pelas rotas REST (ex: friendRoutes) pra notificar um usuário específico em tempo real
  return function notifyUser(userId, event, payload) {
    const sockets = userSockets.get(userId);
    if (!sockets) return false;
    sockets.forEach((socketId) => io.to(socketId).emit(event, payload));
    return true;
  };
}

/** Pode entrar nessa sala de voz? Devolve { info: {bitrate, userLimit}, bypassLimit } ou { error }. */
function canJoinVoice(roomId, userId) {
  if (!roomId) return { error: 'Sala inválida' };
  if (roomId.startsWith('dm:')) {
    const conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(roomId.slice(3));
    if (!conversation || !conversationMemberIds(conversation).includes(userId)) return { error: 'Você não participa dessa conversa' };
    return { info: { bitrate: 64, userLimit: 0, kind: 'dm' } };
  }
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(roomId);
  if (!channel || channel.type !== 'voice' || !canViewChannel(channel, userId)) return { error: 'Canal de voz não encontrado' };
  return {
    info: { bitrate: channel.bitrate || 64, userLimit: channel.user_limit || 0, kind: 'server' },
    // Como no Discord: quem gerencia canais passa do limite
    bypassLimit: hasPermission(channel.server_id, userId, 'gerenciar_canais'),
  };
}

function roomParticipants(io, roomId) {
  const room = voiceRooms.get(roomId);
  if (!room) return [];
  return Array.from(room).map((socketId) => {
    const u = socketUser.get(socketId);
    return u ? { ...u, socketId, sharing: Boolean(io.sockets.sockets.get(socketId)?.data.screenSharing) } : null;
  }).filter(Boolean);
}

function leaveVoice(socket, io) {
  const channelId = socket.data.voiceChannel;
  if (!channelId) return;
  const room = voiceRooms.get(channelId);
  if (room) {
    room.delete(socket.id);
    io.to(`voice:${channelId}`).emit('voice:peer-left', { socketId: socket.id });
    io.to(`voice:${channelId}`).emit('voice:room-update', { channelId, size: room.size });
    if (room.size === 0) voiceRooms.delete(channelId);
  }
  socket.leave(`voice:${channelId}`);
  socket.data.voiceChannel = null;
  socket.data.screenSharing = false;
  broadcastVoicePresence(io, channelId);
}

// Avisa quem está em cada canal de voz. Canal de servidor: todo mundo olhando o servidor
// (mostra os avatares na lista de canais, igual ao Discord). Chamada privada: os
// participantes da conversa (pra mostrar "em chamada — entrar").
function broadcastVoicePresence(io, channelId) {
  const participants = roomParticipants(io, channelId);
  if (channelId.startsWith('dm:')) {
    const conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(channelId.slice(3));
    if (!conversation) return;
    conversationMemberIds(conversation).forEach((uid) => {
      userSockets.get(uid)?.forEach((sid) => io.to(sid).emit('dm:call:state', { conversationId: conversation.id, participants }));
    });
    return;
  }
  const channel = db.prepare('SELECT server_id FROM channels WHERE id = ?').get(channelId);
  if (!channel) return;
  io.to(`server:${channel.server_id}`).emit('voice:presence', { channelId, participants });
}

module.exports = { attachRealtime };
