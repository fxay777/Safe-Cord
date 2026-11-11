const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../auth');
const { effectiveStatus } = require('../statusUtils');

const router = express.Router();
router.use(requireAuth);

const PUBLIC_USER_FIELDS = 'id, username, tag, avatar_color, display_name, avatar_url, banner_url, bio, status, status_mode';
const MAX_GROUP_MEMBERS = 10;

function withEffectiveStatus(row) {
  if (!row) return row;
  return { ...row, status: effectiveStatus(row.status_mode, row.status === 'online') };
}

// user_a/user_b sempre em ordem lexicográfica — assim "eu→você" e "você→eu" caem
// na mesma conversa em vez de criar duas linhas diferentes.
function orderedPair(idA, idB) {
  return idA < idB ? [idA, idB] : [idB, idA];
}

function areFriends(userId, otherId) {
  const row = db
    .prepare(
      `SELECT 1 FROM friendships
       WHERE status = 'accepted'
       AND ((requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?))`
    )
    .get(userId, otherId, otherId, userId);
  return !!row;
}

function getParticipants(conversationId) {
  return db
    .prepare(
      `SELECT u.${PUBLIC_USER_FIELDS.split(', ').join(', u.')}
       FROM dm_participants p JOIN users u ON u.id = p.user_id
       WHERE p.conversation_id = ?`
    )
    .all(conversationId)
    .map(withEffectiveStatus);
}

function isParticipant(conversationId, userId) {
  return !!db
    .prepare('SELECT 1 FROM dm_participants WHERE conversation_id = ? AND user_id = ?')
    .get(conversationId, userId);
}

/** Monta a conversa no formato que o app consome (1:1 e grupo têm a mesma forma). */
function serializeConversation(conversation, viewerId) {
  const participants = getParticipants(conversation.id);
  const lastMessage = db
    .prepare('SELECT content, author_id, created_at, attachments FROM dm_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1')
    .get(conversation.id);

  if (conversation.is_group) {
    const others = participants.filter((p) => p.id !== viewerId);
    const fallbackName = others.map((p) => p.display_name || p.username).join(', ') || 'Grupo';
    return {
      id: conversation.id,
      isGroup: true,
      name: conversation.name || fallbackName,
      icon_url: conversation.icon_url || null,
      owner_id: conversation.owner_id,
      participants,
      memberCount: participants.length,
      user: null,
      lastMessage: lastMessage || null,
    };
  }

  const other = participants.find((p) => p.id !== viewerId)
    || withEffectiveStatus(db.prepare(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`)
      .get(conversation.user_a === viewerId ? conversation.user_b : conversation.user_a));

  return {
    id: conversation.id,
    isGroup: false,
    name: other ? (other.display_name || other.username) : 'Conversa',
    participants,
    memberCount: participants.length,
    user: other || null,
    lastMessage: lastMessage || null,
  };
}

// Lista todas as conversas do usuário (1:1 e grupos), mais recentes primeiro
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.* FROM dm_conversations c
       WHERE c.id IN (SELECT conversation_id FROM dm_participants WHERE user_id = ?)
          OR c.user_a = ? OR c.user_b = ?`
    )
    .all(req.user.id, req.user.id, req.user.id);

  const seen = new Set();
  const conversations = [];
  for (const c of rows) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    conversations.push(serializeConversation(c, req.user.id));
  }

  conversations.sort((a, b) => (b.lastMessage?.created_at || 0) - (a.lastMessage?.created_at || 0));
  res.json({ conversations });
});

// --- Conversas em grupo ---

// Cria um grupo com vários amigos de uma vez
router.post('/groups', (req, res) => {
  const { memberIds, name } = req.body || {};
  if (!Array.isArray(memberIds) || memberIds.length < 1) {
    return res.status(400).json({ error: 'Escolha pelo menos um amigo pro grupo' });
  }

  const unique = [...new Set(memberIds.filter((id) => id && id !== req.user.id))];
  if (unique.length + 1 > MAX_GROUP_MEMBERS) {
    return res.status(400).json({ error: `Um grupo pode ter no máximo ${MAX_GROUP_MEMBERS} pessoas` });
  }

  for (const id of unique) {
    if (!areFriends(req.user.id, id)) {
      return res.status(403).json({ error: 'Você só pode adicionar amigos ao grupo' });
    }
  }

  const id = uuidv4();
  const now = Date.now();
  const safeName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : null;

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO dm_conversations (id, user_a, user_b, is_group, name, owner_id, created_at)
       VALUES (?, NULL, NULL, 1, ?, ?, ?)`
    ).run(id, safeName, req.user.id, now);

    const insert = db.prepare('INSERT INTO dm_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)');
    insert.run(id, req.user.id, now);
    for (const memberId of unique) insert.run(id, memberId, now);
  });
  tx();

  const conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(id);
  const payload = serializeConversation(conversation, req.user.id);

  // Avisa quem foi adicionado, pra aparecer na lista deles na hora
  const io = req.app.get('io');
  if (io) {
    for (const memberId of unique) {
      io.to(`user:${memberId}`).emit('dm:group-created', { conversationId: id });
    }
  }

  res.status(201).json({ conversation: payload });
});

function requireGroupParticipant(req, res, next) {
  const conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(req.params.conversationId);
  if (!conversation || !conversation.is_group) return res.status(404).json({ error: 'Grupo não encontrado' });
  if (!isParticipant(conversation.id, req.user.id)) {
    return res.status(403).json({ error: 'Você não faz parte deste grupo' });
  }
  req.conversation = conversation;
  next();
}

// Adiciona mais alguém ao grupo
router.post('/groups/:conversationId/members', requireGroupParticipant, (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: 'Informe quem adicionar' });
  if (!areFriends(req.user.id, userId)) return res.status(403).json({ error: 'Você só pode adicionar seus amigos' });
  if (isParticipant(req.conversation.id, userId)) return res.status(409).json({ error: 'Essa pessoa já está no grupo' });

  const count = db.prepare('SELECT COUNT(*) AS n FROM dm_participants WHERE conversation_id = ?').get(req.conversation.id).n;
  if (count >= MAX_GROUP_MEMBERS) return res.status(400).json({ error: `O grupo já está cheio (${MAX_GROUP_MEMBERS})` });

  db.prepare('INSERT INTO dm_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)')
    .run(req.conversation.id, userId, Date.now());

  const io = req.app.get('io');
  if (io) io.to(`user:${userId}`).emit('dm:group-created', { conversationId: req.conversation.id });

  res.json({ conversation: serializeConversation(req.conversation, req.user.id) });
});

// Renomear o grupo (qualquer participante pode, como no Discord)
router.put('/groups/:conversationId', requireGroupParticipant, (req, res) => {
  const { name } = req.body || {};
  const safeName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : null;
  db.prepare('UPDATE dm_conversations SET name = ? WHERE id = ?').run(safeName, req.conversation.id);

  const updated = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(req.conversation.id);
  res.json({ conversation: serializeConversation(updated, req.user.id) });
});

// Sair do grupo. Se o último sair, a conversa some junto.
router.delete('/groups/:conversationId/members/me', requireGroupParticipant, (req, res) => {
  db.prepare('DELETE FROM dm_participants WHERE conversation_id = ? AND user_id = ?')
    .run(req.conversation.id, req.user.id);

  const left = db.prepare('SELECT COUNT(*) AS n FROM dm_participants WHERE conversation_id = ?').get(req.conversation.id).n;
  if (left === 0) {
    db.prepare('DELETE FROM dm_conversations WHERE id = ?').run(req.conversation.id);
  }
  res.json({ ok: true });
});

// Busca (ou cria) a conversa 1:1 com um amigo.
router.post('/:friendId', (req, res) => {
  const friendId = req.params.friendId;
  if (friendId === req.user.id) return res.status(400).json({ error: 'Você não pode conversar consigo mesmo' });

  const friend = withEffectiveStatus(db.prepare(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`).get(friendId));
  if (!friend) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (!areFriends(req.user.id, friendId)) return res.status(403).json({ error: 'Vocês precisam ser amigos pra conversar' });

  const [userA, userB] = orderedPair(req.user.id, friendId);
  let conversation = db.prepare('SELECT * FROM dm_conversations WHERE user_a = ? AND user_b = ?').get(userA, userB);

  if (!conversation) {
    const id = uuidv4();
    const now = Date.now();
    const tx = db.transaction(() => {
      db.prepare('INSERT INTO dm_conversations (id, user_a, user_b, is_group, created_at) VALUES (?, ?, ?, 0, ?)')
        .run(id, userA, userB, now);
      const insert = db.prepare('INSERT OR IGNORE INTO dm_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)');
      insert.run(id, userA, now);
      insert.run(id, userB, now);
    });
    tx();
    conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(id);
  } else if (!isParticipant(conversation.id, req.user.id)) {
    // Conversa criada antes da tabela de participantes existir
    const insert = db.prepare('INSERT OR IGNORE INTO dm_participants (conversation_id, user_id, joined_at) VALUES (?, ?, ?)');
    insert.run(conversation.id, userA, conversation.created_at);
    insert.run(conversation.id, userB, conversation.created_at);
  }

  res.json({ conversation: serializeConversation(conversation, req.user.id) });
});

function requireParticipant(req, res, next) {
  const conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(req.params.conversationId);
  if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });

  const allowed = isParticipant(conversation.id, req.user.id)
    || conversation.user_a === req.user.id
    || conversation.user_b === req.user.id;
  if (!allowed) return res.status(403).json({ error: 'Você não faz parte desta conversa' });

  req.conversation = conversation;
  next();
}

// Histórico de mensagens da conversa (mesmo padrão paginado dos canais de servidor)
router.get('/:conversationId/messages', requireParticipant, (req, res) => {
  const before = req.query.before ? Number(req.query.before) : Date.now() + 1;
  const rows = db
    .prepare(
      `SELECT m.id, m.content, m.created_at, m.attachments, u.id as author_id, u.username, u.tag, u.avatar_color,
              u.display_name, u.avatar_url, u.banner_url, u.bio
       FROM dm_messages m JOIN users u ON u.id = m.author_id
       WHERE m.conversation_id = ? AND m.created_at < ?
       ORDER BY m.created_at DESC LIMIT 50`
    )
    .all(req.params.conversationId, before);

  const messages = rows.reverse().map((r) => {
    let attachments = [];
    try {
      const parsed = JSON.parse(r.attachments || '[]');
      attachments = Array.isArray(parsed) ? parsed : [];
    } catch { /* anexo corrompido: ignora */ }
    return { ...r, attachments };
  });

  res.json({ messages: attachBadges(messages) });
});


/** Anexa as insígnias de cada autor às mensagens, numa query só. */
function attachBadges(messages) {
  const authorIds = [...new Set(messages.map((m) => m.author_id))];
  if (authorIds.length === 0) return messages;

  const placeholders = authorIds.map(() => '?').join(', ');
  const rows = db.prepare(
    `SELECT ub.user_id, b.id, b.name, b.description, b.icon, b.color
     FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
     WHERE ub.user_id IN (${placeholders})
     ORDER BY b.position ASC`
  ).all(...authorIds);

  const byUser = new Map();
  for (const r of rows) {
    if (!byUser.has(r.user_id)) byUser.set(r.user_id, []);
    byUser.get(r.user_id).push({ id: r.id, name: r.name, description: r.description, icon: r.icon, color: r.color });
  }
  return messages.map((m) => ({ ...m, badges: byUser.get(m.author_id) || [] }));
}

module.exports = router;
