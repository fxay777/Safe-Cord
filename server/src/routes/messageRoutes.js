const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { canViewChannel } = require('../tickets');

const router = express.Router();
router.use(requireAuth);

// Histórico de mensagens de um canal (mais recentes primeiro, paginado por 'before')
router.get('/:channelId', (req, res) => {
  const { channelId } = req.params;
  const before = req.query.before ? Number(req.query.before) : Date.now() + 1;
  // Só quem pode ver o canal lê o histórico (antes qualquer pessoa logada lia com o id do canal)
  const channel = db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId);
  if (!channel || !canViewChannel(channel, req.user.id)) return res.status(404).json({ error: 'Canal não encontrado' });

  const rows = db
    .prepare(
      `SELECT m.id, m.content, m.created_at, m.attachments, m.kind, m.meta, u.id as author_id, u.username, u.tag, u.avatar_color,
              u.display_name, u.avatar_url, u.banner_url, u.bio
       FROM messages m JOIN users u ON u.id = m.author_id
       WHERE m.channel_id = ? AND m.created_at < ?
       ORDER BY m.created_at DESC LIMIT 50`
    )
    .all(channelId, before);

  const messages = rows.reverse().map((r) => {
    let attachments = [];
    try {
      const parsed = JSON.parse(r.attachments || '[]');
      attachments = Array.isArray(parsed) ? parsed : [];
    } catch { /* anexo corrompido: ignora */ }
    let meta = {};
    try { meta = JSON.parse(r.meta || '{}') || {}; } catch { /* ignora */ }
    return { ...r, attachments, meta };
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
