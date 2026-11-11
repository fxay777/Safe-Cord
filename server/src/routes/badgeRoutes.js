const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { getPublicUser } = require('../userUtils');

const router = express.Router();
router.use(requireAuth);

// Catálogo completo de insígnias (as de sistema e as que estão à venda)
router.get('/', (req, res) => {
  const badges = db.prepare('SELECT * FROM badges ORDER BY position ASC').all()
    .map((b) => ({ ...b, purchasable: Boolean(b.purchasable) }));

  const mine = new Set(
    db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ?').all(req.user.id).map((r) => r.badge_id)
  );

  res.json({ badges: badges.map((b) => ({ ...b, owned: mine.has(b.id) })) });
});

// Insígnias de um usuário qualquer (usado pelo popup de perfil)
router.get('/user/:userId', (req, res) => {
  const user = getPublicUser(req.params.userId);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json({ badges: user.badges });
});

module.exports = router;
