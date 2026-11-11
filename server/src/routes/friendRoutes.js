const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../auth');
const { effectiveStatus } = require('../statusUtils');
const { findUserByHandle } = require('../userUtils');

const router = express.Router();
router.use(requireAuth);

const PUBLIC_USER_FIELDS = 'id, username, tag, avatar_color, display_name, avatar_url, banner_url, bio, status, status_mode';

function withEffectiveStatus(row) {
  return { ...row, status: effectiveStatus(row.status_mode, row.status === 'online') };
}

// Busca usuários por nome (pra "adicionar pessoas"). Ignora quem já é o próprio usuário.
router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ users: [] });

  const rows = db
    .prepare(
      `SELECT ${PUBLIC_USER_FIELDS} FROM users
       WHERE username LIKE ? AND id != ?
       ORDER BY username ASC LIMIT 20`
    )
    .all(`%${q}%`, req.user.id);

  res.json({ users: rows.map(withEffectiveStatus) });
});

// Lista amigos aceitos + pedidos recebidos + pedidos enviados (tudo que a tela de Amigos precisa)
router.get('/', (req, res) => {
  const userId = req.user.id;

  const friends = db
    .prepare(
      `SELECT ${PUBLIC_USER_FIELDS.split(', ').map((f) => `u.${f}`).join(', ')}, f.id as friendship_id
       FROM friendships f
       JOIN users u ON u.id = CASE WHEN f.requester_id = ? THEN f.addressee_id ELSE f.requester_id END
       WHERE (f.requester_id = ? OR f.addressee_id = ?) AND f.status = 'accepted'
       ORDER BY u.status = 'online' DESC, u.username ASC`
    )
    .all(userId, userId, userId)
    .map(withEffectiveStatus);

  const incoming = db
    .prepare(
      `SELECT ${PUBLIC_USER_FIELDS.split(', ').map((f) => `u.${f}`).join(', ')}, f.id as friendship_id, f.created_at
       FROM friendships f JOIN users u ON u.id = f.requester_id
       WHERE f.addressee_id = ? AND f.status = 'pending'
       ORDER BY f.created_at DESC`
    )
    .all(userId)
    .map(withEffectiveStatus);

  const outgoing = db
    .prepare(
      `SELECT ${PUBLIC_USER_FIELDS.split(', ').map((f) => `u.${f}`).join(', ')}, f.id as friendship_id, f.created_at
       FROM friendships f JOIN users u ON u.id = f.addressee_id
       WHERE f.requester_id = ? AND f.status = 'pending'
       ORDER BY f.created_at DESC`
    )
    .all(userId)
    .map(withEffectiveStatus);

  res.json({ friends, incoming, outgoing });
});

// Envia um pedido de amizade. Aceita "nome#1234" (jeito certo, igual ao Discord) ou
// só "nome" quando houver uma única pessoa com aquele nome.
router.post('/request', (req, res) => {
  const { username } = req.body || {};
  if (!username || !username.trim()) {
    return res.status(400).json({ error: 'Informe um nome de usuário' });
  }

  const found = findUserByHandle(username);
  if (found?.ambiguous) {
    return res.status(409).json({
      error: `Existem ${found.count} pessoas com esse nome — use o formato nome#0000`,
    });
  }
  const target = found;
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (target.id === req.user.id) return res.status(400).json({ error: 'Você não pode adicionar a si mesmo' });

  const existing = db
    .prepare(
      `SELECT * FROM friendships
       WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`
    )
    .get(req.user.id, target.id, target.id, req.user.id);

  if (existing) {
    if (existing.status === 'accepted') return res.status(409).json({ error: 'Vocês já são amigos' });
    return res.status(409).json({ error: 'Já existe um pedido pendente entre vocês' });
  }

  const id = uuidv4();
  db.prepare(
    'INSERT INTO friendships (id, requester_id, addressee_id, status, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, req.user.id, target.id, 'pending', Date.now());

  req.app.get('notifyUser')?.(target.id, 'friend:request', {
    friendship_id: id,
    from: db.prepare(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`).get(req.user.id),
  });

  res.status(201).json({ friendship_id: id });
});

function findFriendshipForUser(friendshipId, userId) {
  return db
    .prepare('SELECT * FROM friendships WHERE id = ? AND (requester_id = ? OR addressee_id = ?)')
    .get(friendshipId, userId, userId);
}

// Aceita um pedido recebido (só quem recebeu pode aceitar)
router.post('/:id/accept', (req, res) => {
  const friendship = findFriendshipForUser(req.params.id, req.user.id);
  if (!friendship || friendship.addressee_id !== req.user.id) {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }
  if (friendship.status !== 'pending') return res.status(409).json({ error: 'Pedido já foi respondido' });

  db.prepare("UPDATE friendships SET status = 'accepted', responded_at = ? WHERE id = ?").run(Date.now(), friendship.id);

  const me = db.prepare(`SELECT ${PUBLIC_USER_FIELDS} FROM users WHERE id = ?`).get(req.user.id);
  req.app.get('notifyUser')?.(friendship.requester_id, 'friend:accepted', { friendship_id: friendship.id, by: me });

  res.json({ ok: true });
});

// Recusa um pedido recebido, ou cancela um pedido que você mesmo enviou
router.post('/:id/decline', (req, res) => {
  const friendship = findFriendshipForUser(req.params.id, req.user.id);
  if (!friendship || friendship.status !== 'pending') {
    return res.status(404).json({ error: 'Pedido não encontrado' });
  }

  db.prepare('DELETE FROM friendships WHERE id = ?').run(friendship.id);
  const otherId = friendship.requester_id === req.user.id ? friendship.addressee_id : friendship.requester_id;
  req.app.get('notifyUser')?.(otherId, 'friend:declined', { friendship_id: friendship.id });

  res.json({ ok: true });
});

// Remove uma amizade já aceita
router.delete('/:id', (req, res) => {
  const friendship = findFriendshipForUser(req.params.id, req.user.id);
  if (!friendship) return res.status(404).json({ error: 'Amizade não encontrada' });

  db.prepare('DELETE FROM friendships WHERE id = ?').run(friendship.id);
  const otherId = friendship.requester_id === req.user.id ? friendship.addressee_id : friendship.requester_id;
  req.app.get('notifyUser')?.(otherId, 'friend:removed', { friendship_id: friendship.id });

  res.json({ ok: true });
});

module.exports = router;
