const db = require('./db');

// Catálogo único de permissões — front e back usam as mesmas chaves,
// então o que você marca no cargo é exatamente o que é checado aqui.
const PERMISSIONS = [
  { key: 'ver_canais', label: 'Ver canais' },
  { key: 'enviar_mensagens', label: 'Enviar mensagens' },
  { key: 'criar_canais', label: 'Criar canais e categorias' },
  { key: 'gerenciar_canais', label: 'Gerenciar/excluir canais e categorias' },
  { key: 'gerenciar_cargos', label: 'Gerenciar cargos' },
  { key: 'gerenciar_membros', label: 'Gerenciar membros (atribuir cargo)' },
  { key: 'banir_membros', label: 'Banir/expulsar membros' },
  { key: 'gerenciar_servidor', label: 'Gerenciar servidor (ícone, banner, nome)' },
];
const PERMISSION_KEYS = new Set(PERMISSIONS.map((p) => p.key));

function parsePermissions(json) {
  try {
    const arr = JSON.parse(json || '[]');
    return Array.isArray(arr) ? arr.filter((k) => PERMISSION_KEYS.has(k)) : [];
  } catch {
    return [];
  }
}

function sanitizePermissions(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.filter((k) => PERMISSION_KEYS.has(k)))];
}

/** Todas as permissões de um membro num servidor = união das permissões de todos os cargos que ele tem. */
function getEffectivePermissions(serverId, userId) {
  const server = db.prepare('SELECT owner_id FROM servers WHERE id = ?').get(serverId);
  if (!server) return { isOwner: false, permissions: [] };
  if (server.owner_id === userId) return { isOwner: true, permissions: PERMISSIONS.map((p) => p.key) };

  const roles = db
    .prepare(
      `SELECT r.permissions FROM member_roles mr
       JOIN roles r ON r.id = mr.role_id
       WHERE mr.server_id = ? AND mr.user_id = ?`
    )
    .all(serverId, userId);

  const set = new Set();
  roles.forEach((r) => parsePermissions(r.permissions).forEach((p) => set.add(p)));
  return { isOwner: false, permissions: [...set] };
}

function hasPermission(serverId, userId, key) {
  const { isOwner, permissions } = getEffectivePermissions(serverId, userId);
  return isOwner || permissions.includes(key);
}

/** Middleware: exige que o usuário seja dono do servidor OU tenha a permissão passada. serverId vem de req.params.serverId. */
function requireServerPermission(key) {
  return (req, res, next) => {
    const serverId = req.params.serverId;
    const server = db.prepare('SELECT id FROM servers WHERE id = ?').get(serverId);
    if (!server) return res.status(404).json({ error: 'Servidor não encontrado' });

    const isMember = db
      .prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?')
      .get(serverId, req.user.id);
    if (!isMember) return res.status(403).json({ error: 'Você não é membro deste servidor' });

    if (!hasPermission(serverId, req.user.id, key)) {
      return res.status(403).json({ error: 'Você não tem permissão para fazer isso' });
    }
    next();
  };
}

module.exports = {
  PERMISSIONS,
  PERMISSION_KEYS,
  parsePermissions,
  sanitizePermissions,
  getEffectivePermissions,
  hasPermission,
  requireServerPermission,
};
