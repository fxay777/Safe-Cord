const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

const PUBLIC_USER_FIELDS = 'id, username, tag, avatar_color, display_name, avatar_url, banner_url, bio, status';

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

// Lista as conversas do usuário, com dados do outro participante + prévia da última mensagem
router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.user_a, c.user_b, c.created_at
       FROM dm_conversations c
       WHERE c.user_a = ? OR c.user_b = ?`
    )
    .all(req.user.id, req.user.id);

  const conversations = rows.map((c) => {
    const otherId = c.user_a === req.user.id ? c.user_b : c.user_a;
    const other = db.prepare(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`).get(otherId);
    const lastMessage = db
      .prepare('SELECT content, author_id, created_at FROM dm_messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 1')
      .get(c.id);
    return { id: c.id, user: other, lastMessage: lastMessage || null };
  });

  conversations.sort((a, b) => (b.lastMessage?.created_at || 0) - (a.lastMessage?.created_at || 0));

  res.json({ conversations });
});

// Busca (ou cria) a conversa com um amigo. Só funciona entre amigos de verdade.
router.post('/:friendId', (req, res) => {
  const friendId = req.params.friendId;
  if (friendId === req.user.id) return res.status(400).json({ error: 'Você não pode conversar consigo mesmo' });

  const friend = db.prepare(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`).get(friendId);
  if (!friend) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (!areFriends(req.user.id, friendId)) return res.status(403).json({ error: 'Vocês precisam ser amigos pra conversar' });

  const [userA, userB] = orderedPair(req.user.id, friendId);
  let conversation = db.prepare('SELECT * FROM dm_conversations WHERE user_a = ? AND user_b = ?').get(userA, userB);

  if (!conversation) {
    const id = uuidv4();
    db.prepare('INSERT INTO dm_conversations (id, user_a, user_b, created_at) VALUES (?, ?, ?, ?)').run(id, userA, userB, Date.now());
    conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(id);
  }

  res.json({ conversation: { id: conversation.id, user: friend } });
});

function requireParticipant(req, res, next) {
  const conversation = db.prepare('SELECT * FROM dm_conversations WHERE id = ?').get(req.params.conversationId);
  if (!conversation) return res.status(404).json({ error: 'Conversa não encontrada' });
  if (conversation.user_a !== req.user.id && conversation.user_b !== req.user.id) {
    return res.status(403).json({ error: 'Você não faz parte desta conversa' });
  }
  req.conversation = conversation;
  next();
}

// Histórico de mensagens da conversa (mesmo padrão paginado dos canais de servidor)
router.get('/:conversationId/messages', requireParticipant, (req, res) => {
  const before = req.query.before ? Number(req.query.before) : Date.now() + 1;
  const rows = db
    .prepare(
      `SELECT m.id, m.content, m.created_at, u.id as author_id, u.username, u.tag, u.avatar_color,
              u.display_name, u.avatar_url, u.banner_url, u.bio
       FROM dm_messages m JOIN users u ON u.id = m.author_id
       WHERE m.conversation_id = ? AND m.created_at < ?
       ORDER BY m.created_at DESC LIMIT 50`
    )
    .all(req.params.conversationId, before);

  res.json({ messages: rows.reverse() });
});

module.exports = router;
