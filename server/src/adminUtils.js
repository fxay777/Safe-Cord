const db = require('./db');

// Administradores do SafeCord: emails listados em ADMIN_EMAILS (e já confirmados).
function adminEmails() {
  return (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
}

function isAdmin(userId) {
  const list = adminEmails();
  if (!list.length || !userId) return false;
  const u = db.prepare('SELECT email, email_verified FROM users WHERE id = ?').get(userId);
  return Boolean(u?.email && u.email_verified && list.includes(u.email.toLowerCase()));
}

function requireAdmin(req, res, next) {
  if (!isAdmin(req.user?.id)) return res.status(403).json({ error: 'Só administradores do SafeCord' });
  next();
}

module.exports = { isAdmin, requireAdmin, adminEmails };
