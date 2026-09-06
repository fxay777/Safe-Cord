const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { verifyToken } = require('./auth');
const { effectiveStatus } = require('./statusUtils');

// voiceRooms: Map<channelId, Set<socketId>>  — quem está em cada sala de voz
const voiceRooms = new Map();
const socketUser = new Map(); // socketId -> user info
const userSockets = new Map(); // userId -> Set<socketId>  — pra mandar evento pra um usuário específico (ex: pedido de amizade)


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

    db.prepare('UPDATE users SET status = ? WHERE id = ?').run('online', socket.user.id);
    // Respeita o status escolhido (ausente/não incomodar/invisível) mesmo ao reconectar —
    // sem isso, a pessoa sempre voltava a aparecer "online" pros outros, ignorando a preferência.
    const currentModeRow = db.prepare('SELECT status_mode FROM users WHERE id = ?').get(socket.user.id);
    const currentMode = currentModeRow?.status_mode || 'online';
    socket.broadcast.emit('presence:update', { userId: socket.user.id, status: effectiveStatus(currentMode, true) });

    // ---- Chat de texto ----
    socket.on('channel:join', (channelId) => {
      socket.join(`channel:${channelId}`);
    });

    socket.on('channel:leave', (channelId) => {
      socket.leave(`channel:${channelId}`);
    });

    socket.on('message:send', ({ channelId, content }) => {
      if (!content || !content.trim() || !channelId) return;
      const id = uuidv4();
      const created_at = Date.now();
      db.prepare(
        'INSERT INTO messages (id, channel_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, channelId, socket.user.id, content.trim().slice(0, 4000), created_at);

      const author = db
        .prepare('SELECT username, tag, avatar_color, avatar_url, banner_url, bio, display_name FROM users WHERE id = ?')
        .get(socket.user.id);

      io.to(`channel:${channelId}`).emit('message:new', {
        id,
        channelId,
        content: content.trim().slice(0, 4000),
        created_at,
        author_id: socket.user.id,
        username: author.username,
        tag: author.tag,
        avatar_color: author.avatar_color,
        avatar_url: author.avatar_url,
        banner_url: author.banner_url,
        bio: author.bio,
        display_name: author.display_name,
      });
    });

    socket.on('typing', ({ channelId }) => {
      socket.to(`channel:${channelId}`).emit('typing', {
        channelId,
        username: socket.user.username,
      });
    });

    // ---- Mensagens diretas (DM) ----
    socket.on('dm:send', ({ conversationId, content }) => {
      if (!content || !content.trim() || !conversationId) return;

      const conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(conversationId);
      if (!conversation) return;
      if (conversation.user_a !== socket.user.id && conversation.user_b !== socket.user.id) return; // não é participante

      const id = uuidv4();
      const created_at = Date.now();
      const trimmed = content.trim().slice(0, 4000);
      db.prepare(
        'INSERT INTO dm_messages (id, conversation_id, author_id, content, created_at) VALUES (?, ?, ?, ?, ?)'
      ).run(id, conversationId, socket.user.id, trimmed, created_at);

      const author = db
        .prepare('SELECT username, tag, avatar_color, avatar_url, banner_url, bio, display_name FROM users WHERE id = ?')
        .get(socket.user.id);

      const payload = {
        id,
        conversationId,
        content: trimmed,
        created_at,
        author_id: socket.user.id,
        username: author.username,
        tag: author.tag,
        avatar_color: author.avatar_color,
        avatar_url: author.avatar_url,
        banner_url: author.banner_url,
        bio: author.bio,
        display_name: author.display_name,
      };

      // Manda pro remetente e pro outro participante, mesmo que ele não tenha aberto a conversa ainda
      const otherId = conversation.user_a === socket.user.id ? conversation.user_b : conversation.user_a;
      [socket.user.id, otherId].forEach((uid) => {
        userSockets.get(uid)?.forEach((sid) => io.to(sid).emit('dm:new', payload));
      });
    });

    socket.on('dm:typing', ({ conversationId }) => {
      const conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(conversationId);
      if (!conversation) return;
      const otherId = conversation.user_a === socket.user.id ? conversation.user_b : conversation.user_a;
      userSockets.get(otherId)?.forEach((sid) =>
        io.to(sid).emit('dm:typing', { conversationId, username: socket.user.username })
      );
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

    socket.on('voice:join', (channelId) => {
      socket.data.voiceChannel = channelId;
      if (!voiceRooms.has(channelId)) voiceRooms.set(channelId, new Set());
      const room = voiceRooms.get(channelId);

      // avisa aos que já estão na sala sobre o novo peer
      room.forEach((peerId) => {
        io.to(peerId).emit('voice:peer-joined', { socketId: socket.id, user: socket.user });
      });

      // manda pro novo peer a lista de quem já está lá (pra ele iniciar as conexões)
      socket.emit(
        'voice:existing-peers',
        Array.from(room).map((peerId) => ({ socketId: peerId, user: socketUser.get(peerId) }))
      );

      room.add(socket.id);
      socket.join(`voice:${channelId}`);
      io.to(`voice:${channelId}`).emit('voice:room-update', { channelId, size: room.size });
      broadcastVoicePresence(io, channelId);
    });

    socket.on('voice:signal', ({ to, signal }) => {
      io.to(to).emit('voice:signal', { from: socket.id, signal, user: socket.user });
    });

    socket.on('voice:leave', () => leaveVoice(socket, io));

    socket.on('disconnect', () => {
      leaveVoice(socket, io);
      socketUser.delete(socket.id);

      const sockets = userSockets.get(socket.user.id);
      sockets?.delete(socket.id);
      if (sockets && sockets.size === 0) {
        userSockets.delete(socket.user.id);
        db.prepare('UPDATE users SET status = ? WHERE id = ?').run('offline', socket.user.id);
        socket.broadcast.emit('presence:update', { userId: socket.user.id, status: 'offline' });
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

function leaveVoice(socket, io) {
  const channelId = socket.data.voiceChannel;
  if (!channelId) return;
  const room = voiceRooms.get(channelId);
  if (room) {
    room.delete(socket.id);
    io.to(`voice:${channelId}`).emit('voice:peer-left', { socketId: socket.id });
    io.to(`voice:${channelId}`).emit('voice:room-update', { channelId, size: room.size });
  }
  socket.leave(`voice:${channelId}`);
  socket.data.voiceChannel = null;
  broadcastVoicePresence(io, channelId);
}

// Avisa todo mundo que está olhando o servidor (não só quem já está na call) quem está
// conectado em cada canal de voz — é o que permite mostrar os avatares na lista de canais
// mesmo pra quem não entrou na chamada, igual ao Discord.
function broadcastVoicePresence(io, channelId) {
  const channel = db.prepare('SELECT server_id FROM channels WHERE id = ?').get(channelId);
  if (!channel) return;
  const room = voiceRooms.get(channelId);
  const participants = room
    ? Array.from(room).map((socketId) => socketUser.get(socketId)).filter(Boolean)
    : [];
  io.to(`server:${channel.server_id}`).emit('voice:presence', { channelId, participants });
}

module.exports = { attachRealtime };
