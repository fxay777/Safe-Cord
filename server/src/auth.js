const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'safecord-dev-secret-troque-isso-em-producao';

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      tag: user.tag,
      avatar_color: user.avatar_color || '#2DD4BF',
      avatar_url: user.avatar_url || null,
      banner_url: user.banner_url || null,
      bio: user.bio || '',
      display_name: user.display_name || '',
      status_mode: user.status_mode || 'online',
    },
    JWT_SECRET,
    {
      expiresIn: '30d',
    }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

// Middleware Express: exige header Authorization: Bearer <token>
function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token ausente' });
  try {
    req.user = verifyToken(token);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

module.exports = { signToken, verifyToken, requireAuth, JWT_SECRET };
