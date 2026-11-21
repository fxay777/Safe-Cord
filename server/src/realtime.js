const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { canViewChannel, getTicket, ticketAudience } = require('./tickets');
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

    // Quem compartilha avisa a sala quando começa/para — sem isso, quem estava assistindo
    // ficava com o vídeo congelado na tela depois que a pessoa parava de compartilhar.
    socket.on('voice:screen-state', ({ sharing } = {}) => {
      const channelId = socket.data.voiceChannel;
      if (!channelId) return;
      socket.data.screenSharing = Boolean(sharing);
      socket.to(`voice:${channelId}`).emit('voice:screen-state', { socketId: socket.id, sharing: Boolean(sharing) });
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
  socket.data.screenSharing = false;
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
