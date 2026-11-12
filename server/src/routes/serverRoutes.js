const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../auth');
const { requireServerPermission } = require('../permissions');
const { effectiveStatus } = require('../statusUtils');

const router = express.Router();
router.use(requireAuth);

function genInviteCode() {
  return Math.random().toString(36).slice(2, 8);
}

// Lista os servidores do usuário logado, com seus canais
router.get('/', (req, res) => {
  const servers = db
    .prepare(
      `SELECT s.* FROM servers s
       JOIN server_members m ON m.server_id = s.id
       WHERE m.user_id = ?
       ORDER BY s.created_at ASC`
    )
    .all(req.user.id);

  const result = servers.map((s) => ({
    ...s,
    channels: db
      .prepare('SELECT * FROM channels WHERE server_id = ? ORDER BY position ASC')
      .all(s.id),
  }));

  res.json({ servers: result });
});

// Cria um servidor novo (dono vira membro automaticamente, cria canal #geral e #Sala de Voz)
router.post('/', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome do servidor é obrigatório' });

  const serverId = uuidv4();
  const now = Date.now();
  const inviteCode = genInviteCode();

  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO servers (id, name, owner_id, invite_code, created_at, color) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(serverId, name.trim(), req.user.id, inviteCode, now, '#1A75FF');

    db.prepare(
      'INSERT INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)'
    ).run(serverId, req.user.id, now);

    const generalId = uuidv4();
    db.prepare(
      'INSERT INTO channels (id, server_id, name, type, position, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(generalId, serverId, 'geral', 'text', 0, now);

    const voiceId = uuidv4();
    db.prepare(
      'INSERT INTO channels (id, server_id, name, type, position, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(voiceId, serverId, 'Sala de Voz', 'voice', 1, now);
  });
  tx();

  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
  const channels = db.prepare('SELECT * FROM channels WHERE server_id = ?').all(serverId);
  res.status(201).json({ server: { ...server, channels } });
});

// Entrar em um servidor via código de convite
router.post('/join', (req, res) => {
  const { inviteCode } = req.body;
  const server = db.prepare('SELECT * FROM servers WHERE invite_code = ?').get(inviteCode);
  if (!server) return res.status(404).json({ error: 'Convite inválido' });

  const already = db
    .prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?')
    .get(server.id, req.user.id);
  if (!already) {
    db.prepare(
      'INSERT INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)'
    ).run(server.id, req.user.id, Date.now());
  }

  const channels = db.prepare('SELECT * FROM channels WHERE server_id = ?').all(server.id);
  res.json({ server: { ...server, channels } });
});

// Sair de um servidor (o dono não pode sair — precisa excluir o servidor ou passar a posse antes)
router.post('/:serverId/leave', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Servidor não encontrado' });
  if (server.owner_id === req.user.id) {
    return res.status(400).json({ error: 'Você é o dono — exclua o servidor em vez de sair' });
  }

  const isMember = db
    .prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?')
    .get(req.params.serverId, req.user.id);
  if (!isMember) return res.status(404).json({ error: 'Você não é membro deste servidor' });

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(req.params.serverId, req.user.id);
    db.prepare('DELETE FROM member_roles WHERE server_id = ? AND user_id = ?').run(req.params.serverId, req.user.id);
  });
  tx();

  res.json({ ok: true });
});

// Exclui o servidor inteiro — só o dono. Apaga tudo em cascata (canais, mensagens, cargos, categorias, membros).
router.delete('/:serverId', (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Servidor não encontrado' });
  if (server.owner_id !== req.user.id) return res.status(403).json({ error: 'Só o dono pode excluir o servidor' });

  db.prepare('DELETE FROM servers WHERE id = ?').run(req.params.serverId); // FKs em cascata cuidam do resto
  res.json({ ok: true });
});

// Edita nome, cor de destaque e descrição do servidor — exige a permissão "gerenciar_servidor"
router.put('/:serverId', requireServerPermission('gerenciar_servidor'), (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Servidor não encontrado' });

  const { name, color, description } = req.body;
  const nextName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : server.name;
  const nextColor = typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color : server.color;
  const nextDescription = typeof description === 'string' ? description.slice(0, 300) : server.description;

  db.prepare('UPDATE servers SET name = ?, color = ?, description = ? WHERE id = ?')
    .run(nextName, nextColor, nextDescription, req.params.serverId);

  const updated = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.serverId);
  res.json({ server: updated });
});

// Gera um novo código de convite pro servidor (invalida o antigo) — exige "gerenciar_servidor"
router.post('/:serverId/invite/regenerate', requireServerPermission('gerenciar_servidor'), (req, res) => {
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Servidor não encontrado' });

  const newCode = genInviteCode();
  db.prepare('UPDATE servers SET invite_code = ? WHERE id = ?').run(newCode, req.params.serverId);
  res.json({ invite_code: newCode });
});

// Lista membros de um servidor (com status e cargos)
router.get('/:serverId/members', (req, res) => {
  // Só quem entrou no servidor (pelo convite) pode ver a lista — inclusive o banner e a
  // bio de cada membro. Sem isso, qualquer pessoa logada via o perfil de gente de
  // servidores em que nunca pôs os pés.
  const isMember = db
    .prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?')
    .get(req.params.serverId, req.user.id);
  if (!isMember) {
    return res.status(403).json({ error: 'Você precisa ser membro deste servidor para ver isso' });
  }

  const members = db
    .prepare(
      `SELECT u.id, u.username, u.tag, u.avatar_color, u.display_name, u.avatar_url, u.banner_url, u.bio, u.status, u.status_mode, u.last_seen_at
       FROM server_members m JOIN users u ON u.id = m.user_id
       WHERE m.server_id = ?`
    )
    .all(req.params.serverId);

  const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(req.params.serverId);
  const roleRows = db
    .prepare(
      `SELECT mr.user_id, r.id, r.name, r.color, r.position
       FROM member_roles mr JOIN roles r ON r.id = mr.role_id
       WHERE mr.server_id = ?
       ORDER BY r.position DESC`
    )
    .all(req.params.serverId);

  const rolesByUser = new Map();
  roleRows.forEach((row) => {
    if (!rolesByUser.has(row.user_id)) rolesByUser.set(row.user_id, []);
    rolesByUser.get(row.user_id).push({ id: row.id, name: row.name, color: row.color, position: row.position });
  });

  const withRoles = members.map((m) => ({
    ...m,
    status: effectiveStatus(m.status_mode, m.status === 'online'),
    is_owner: server?.owner_id === m.id,
    roles: rolesByUser.get(m.id) || [],
  }));

  res.json({ members: withRoles });
});

// Cria um canal (dentro de uma categoria ou solto). Requer permissão 'criar_canais' ou ser dono.
router.post('/:serverId/channels', requireServerPermission('criar_canais'), (req, res) => {
  const { name, type, category_id } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome do canal é obrigatório' });
  const safeType = type === 'voice' ? 'voice' : 'text';

  let categoryId = null;
  if (category_id) {
    const category = db.prepare('SELECT id FROM categories WHERE id = ? AND server_id = ?').get(category_id, req.params.serverId);
    if (!category) return res.status(400).json({ error: 'Categoria inválida' });
    categoryId = category.id;
  }

  const id = uuidv4();
  const now = Date.now();
  const maxPos = db
    .prepare('SELECT COALESCE(MAX(position), -1) as maxPos FROM channels WHERE server_id = ?')
    .get(req.params.serverId).maxPos;

  db.prepare(
    'INSERT INTO channels (id, server_id, name, type, position, category_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(id, req.params.serverId, name.trim().slice(0, 60), safeType, maxPos + 1, categoryId, now);

  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(id);
  res.status(201).json({ channel });
});

// Move um canal pra outra categoria (ou tira de categoria, category_id: null)
router.put('/:serverId/channels/:channelId', requireServerPermission('gerenciar_canais'), (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ? AND server_id = ?').get(req.params.channelId, req.params.serverId);
  if (!channel) return res.status(404).json({ error: 'Canal não encontrado' });

  const { name, category_id, topic } = req.body || {};
  const nextName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 60) : channel.name;
  const nextTopic = typeof topic === 'string' ? topic.trim().slice(0, 160) : (channel.topic || '');

  let categoryId = channel.category_id;
  if (category_id !== undefined) {
    if (category_id === null) {
      categoryId = null;
    } else {
      const category = db.prepare('SELECT id FROM categories WHERE id = ? AND server_id = ?').get(category_id, req.params.serverId);
      if (!category) return res.status(400).json({ error: 'Categoria inválida' });
      categoryId = category.id;
    }
  }

  db.prepare('UPDATE channels SET name = ?, category_id = ?, topic = ? WHERE id = ?').run(nextName, categoryId, nextTopic, channel.id);
  const updated = db.prepare('SELECT * FROM channels WHERE id = ?').get(channel.id);
  // Todo mundo no servidor vê a mudança (nome/descrição) na hora
  req.app.get('io')?.to(`server:${req.params.serverId}`).emit('channel:updated', { serverId: req.params.serverId, channel: updated });
  res.json({ channel: updated });
});

router.delete('/:serverId/channels/:channelId', requireServerPermission('gerenciar_canais'), (req, res) => {
  const channel = db.prepare('SELECT * FROM channels WHERE id = ? AND server_id = ?').get(req.params.channelId, req.params.serverId);
  if (!channel) return res.status(404).json({ error: 'Canal não encontrado' });

  const remaining = db.prepare('SELECT COUNT(*) as n FROM channels WHERE server_id = ?').get(req.params.serverId).n;
  if (remaining <= 1) return res.status(400).json({ error: 'O servidor precisa ter pelo menos um canal' });

  db.prepare('DELETE FROM channels WHERE id = ?').run(channel.id);
  res.json({ ok: true });
});

module.exports = router;
