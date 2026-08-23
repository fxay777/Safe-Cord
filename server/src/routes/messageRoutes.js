const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');

const router = express.Router();
router.use(requireAuth);

// Histórico de mensagens de um canal (mais recentes primeiro, paginado por 'before')
router.get('/:channelId', (req, res) => {
  const { channelId } = req.params;
  const before = req.query.before ? Number(req.query.before) : Date.now() + 1;

  const rows = db
    .prepare(
      `SELECT m.id, m.content, m.created_at, u.id as author_id, u.username, u.tag, u.avatar_color,
              u.display_name, u.avatar_url, u.banner_url, u.bio
       FROM messages m JOIN users u ON u.id = m.author_id
       WHERE m.channel_id = ? AND m.created_at < ?
       ORDER BY m.created_at DESC LIMIT 50`
    )
    .all(channelId, before);

  res.json({ messages: rows.reverse() });
});

module.exports = router;
