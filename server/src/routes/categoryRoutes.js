const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../auth');
const { requireServerPermission } = require('../permissions');

const router = express.Router({ mergeParams: true });
router.use(requireAuth);

function requireMembership(req, res, next) {
  const isMember = db
    .prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?')
    .get(req.params.serverId, req.user.id);
  if (!isMember) return res.status(403).json({ error: 'Você não é membro deste servidor' });
  next();
}

router.get('/', requireMembership, (req, res) => {
  const categories = db
    .prepare('SELECT * FROM categories WHERE server_id = ? ORDER BY position ASC, created_at ASC')
    .all(req.params.serverId);
  res.json({ categories });
});

router.post('/', requireServerPermission('criar_canais'), (req, res) => {
  const { name } = req.body || {};
  if (!name || !name.trim()) return res.status(400).json({ error: 'Nome da categoria é obrigatório' });

  const id = uuidv4();
  const now = Date.now();
  const maxPos = db
    .prepare('SELECT COALESCE(MAX(position), -1) as maxPos FROM categories WHERE server_id = ?')
    .get(req.params.serverId).maxPos;

  db.prepare(
    'INSERT INTO categories (id, server_id, name, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(id, req.params.serverId, name.trim().slice(0, 40), maxPos + 1, req.user.id, now);

  const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  res.status(201).json({ category });
});

function getServer(serverId) {
  return db.prepare('SELECT * FROM servers WHERE id = ?').get(serverId);
}

router.put('/:categoryId', requireServerPermission('criar_canais'), (req, res) => {
  const category = db.prepare('SELECT * FROM categories WHERE id = ? AND server_id = ?').get(req.params.categoryId, req.params.serverId);
  if (!category) return res.status(404).json({ error: 'Categoria não encontrada' });

  const server = getServer(req.params.serverId);
  const canManageAny = server.owner_id === req.user.id;
  // Renomear é permitido a quem tem "criar_canais"; só dono/criador via checagem abaixo pode excluir.
  const { name, position } = req.body || {};
  const nextName = typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : category.name;
  const nextPosition = Number.isInteger(position) ? position : category.position;

  db.prepare('UPDATE categories SET name = ?, position = ? WHERE id = ?').run(nextName, nextPosition, category.id);
  const updated = db.prepare('SELECT * FROM categories WHERE id = ?').get(category.id);
  res.json({ category: updated });
});

// Só quem CRIOU a categoria ou o DONO do servidor pode excluir — é a regra que estava faltando.
router.delete('/:categoryId', requireMembership, (req, res) => {
  const category = db.prepare('SELECT * FROM categories WHERE id = ? AND server_id = ?').get(req.params.categoryId, req.params.serverId);
  if (!category) return res.status(404).json({ error: 'Categoria não encontrada' });

  const server = getServer(req.params.serverId);
  const isCreator = category.created_by === req.user.id;
  const isOwner = server.owner_id === req.user.id;
  if (!isCreator && !isOwner) {
    return res.status(403).json({ error: 'Só quem criou esta categoria (ou o dono do servidor) pode excluí-la' });
  }

  const tx = db.transaction(() => {
    db.prepare('UPDATE channels SET category_id = NULL WHERE category_id = ?').run(category.id);
    db.prepare('DELETE FROM categories WHERE id = ?').run(category.id);
  });
  tx();

  res.json({ ok: true });
});

module.exports = router;
