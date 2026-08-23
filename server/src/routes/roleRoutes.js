const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../auth');
const { sanitizePermissions, parsePermissions, requireServerPermission, PERMISSIONS } = require('../permissions');

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

function serializeRole(row) {
  return { ...row, permissions: parsePermissions(row.permissions) };
}

function requireMembership(req, res, next) {
  const isMember = db
    .prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?')
    .get(req.params.serverId, req.user.id);
  if (!isMember) return res.status(403).json({ error: 'Você não é membro deste servidor' });
  next();
}

router.get('/permissions-catalog', requireMembership, (req, res) => {
  res.json({ permissions: PERMISSIONS });
});

router.get('/', requireMembership, (req, res) => {
  const roles = db
    .prepare('SELECT * FROM roles WHERE server_id = ? ORDER BY position DESC, created_at ASC')
    .all(req.params.serverId);
  res.json({ roles: roles.map(serializeRole) });
});

router.post('/', requireServerPermission('gerenciar_cargos'), (req, res) => {
  const { name, color, permissions } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome do cargo é obrigatório' });

  const id = uuidv4();
  const now = Date.now();
  const maxPos = db
    .prepare('SELECT COALESCE(MAX(position), -1) as maxPos FROM roles WHERE server_id = ?')
    .get(req.params.serverId).maxPos;

  db.prepare(
    'INSERT INTO roles (id, server_id, name, color, permissions, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(
    id,
    req.params.serverId,
    name.trim().slice(0, 40),
    /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color || '') ? color : '#99AAB5',
    JSON.stringify(sanitizePermissions(permissions)),
    maxPos + 1,
    now
  );

  const role = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
  res.status(201).json({ role: serializeRole(role) });
});

router.put('/:roleId', requireServerPermission('gerenciar_cargos'), (req, res) => {
  const role = db.prepare('SELECT * FROM roles WHERE id = ? AND server_id = ?').get(req.params.roleId, req.params.serverId);
  if (!role) return res.status(404).json({ error: 'Cargo não encontrado' });

  const { name, color, permissions, position } = req.body || {};
  const nextName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : role.name;
  const nextColor = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(color || '') ? color : role.color;
  const nextPermissions = permissions !== undefined ? sanitizePermissions(permissions) : parsePermissions(role.permissions);
  const nextPosition = Number.isInteger(position) ? position : role.position;

  db.prepare('UPDATE roles SET name = ?, color = ?, permissions = ?, position = ? WHERE id = ?').run(
    nextName,
    nextColor,
    JSON.stringify(nextPermissions),
    nextPosition,
    role.id
  );

  const updated = db.prepare('SELECT * FROM roles WHERE id = ?').get(role.id);
  res.json({ role: serializeRole(updated) });
});

router.delete('/:roleId', requireServerPermission('gerenciar_cargos'), (req, res) => {
  const role = db.prepare('SELECT * FROM roles WHERE id = ? AND server_id = ?').get(req.params.roleId, req.params.serverId);
  if (!role) return res.status(404).json({ error: 'Cargo não encontrado' });

  db.prepare('DELETE FROM roles WHERE id = ?').run(role.id); // member_roles cai junto via ON DELETE CASCADE
  res.json({ ok: true });
});

// Define a lista completa de cargos de um membro (substitui o que ele tinha)
router.put('/members/:userId', requireServerPermission('gerenciar_membros'), (req, res) => {
  const { roleIds } = req.body || {};
  if (!Array.isArray(roleIds)) return res.status(400).json({ error: 'roleIds deve ser uma lista' });

  const serverId = req.params.serverId;
  const isTargetMember = db
    .prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?')
    .get(serverId, req.params.userId);
  if (!isTargetMember) return res.status(404).json({ error: 'Membro não encontrado neste servidor' });

  // Garante que todo roleId pertence mesmo a esse servidor (evita atribuir cargo de outro server)
  const validRoleIds = new Set(
    db.prepare('SELECT id FROM roles WHERE server_id = ?').all(serverId).map((r) => r.id)
  );
  const safeRoleIds = [...new Set(roleIds)].filter((id) => validRoleIds.has(id));

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM member_roles WHERE server_id = ? AND user_id = ?').run(serverId, req.params.userId);
    const insert = db.prepare('INSERT INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)');
    safeRoleIds.forEach((roleId) => insert.run(serverId, req.params.userId, roleId));
  });
  tx();

  res.json({ roleIds: safeRoleIds });
});

module.exports = router;
