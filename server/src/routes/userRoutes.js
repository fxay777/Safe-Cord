const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { getProfileForOthers, canViewProfile } = require('../userUtils');

// Perfil de outra pessoa (o cartão que abre ao clicar no nome/avatar).
// Privacidade: só vê quem tem relação — amigo, mesmo servidor ou mesma conversa.
// Nunca devolve o email.
const router = express.Router();
router.use(requireAuth);

router.get('/:id/profile', (req, res) => {
  const targetId = req.params.id;
  if (!canViewProfile(req.user.id, targetId)) {
    return res.status(403).json({ error: 'Você só pode ver o perfil de amigos e de quem está nos seus servidores' });
  }
  const user = getProfileForOthers(targetId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const mutualServers = db.prepare(
    `SELECT s.id, s.name, s.icon_url, s.color FROM server_members a
     JOIN server_members b ON b.server_id = a.server_id AND b.user_id = ?
     JOIN servers s ON s.id = a.server_id WHERE a.user_id = ?`
  ).all(targetId, req.user.id);

  const friendship = db.prepare(
    `SELECT status FROM friendships WHERE (requester_id = ? AND addressee_id = ?) OR (requester_id = ? AND addressee_id = ?)`
  ).get(req.user.id, targetId, targetId, req.user.id);

  // Dados de membro no servidor em que a pessoa foi clicada (cargos, desde quando)
  let member = null;
  const serverId = req.query.serverId;
  if (serverId && mutualServers.some((s) => s.id === serverId)) {
    const joined = db.prepare('SELECT joined_at FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, targetId);
    const roles = db.prepare(
      `SELECT r.id, r.name, r.color FROM member_roles mr JOIN roles r ON r.id = mr.role_id
       WHERE mr.server_id = ? AND mr.user_id = ? ORDER BY r.position DESC`
    ).all(serverId, targetId);
    const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId);
    member = { joined_at: joined?.joined_at || null, roles, is_owner: server?.owner_id === targetId };
  }

  res.json({
    user,
    member,
    mutual_servers: targetId === req.user.id ? [] : mutualServers,
    friendship: friendship?.status || null,
  });
});

module.exports = router;
