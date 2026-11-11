const db = require('./db');

// Colunas que podem ir pro cliente (nunca password_hash nem verification_code).
const PUBLIC_USER_COLUMNS = `id, username, tag, avatar_color, display_name, avatar_url, banner_url, bio,
  status, status_mode, spotify_track, connections, email, email_verified, pro_until, created_at`;

const listBadgesStmt = db.prepare(
  `SELECT b.id, b.name, b.description, b.icon, b.color
   FROM user_badges ub JOIN badges b ON b.id = ub.badge_id
   WHERE ub.user_id = ?
   ORDER BY b.position ASC`
);

/** Converte uma linha crua da tabela users no formato que o app consome. */
function parseUserRow(row, { includeBadges = true } = {}) {
  if (!row) return row;

  let connections = [];
  try { connections = JSON.parse(row.connections || '[]'); } catch { connections = []; }

  let spotify_track = null;
  try { spotify_track = row.spotify_track ? JSON.parse(row.spotify_track) : null; } catch { spotify_track = null; }

  const isPro = Boolean(row.pro_until && row.pro_until > Date.now());

  return {
    ...row,
    connections,
    spotify_track,
    email_verified: Boolean(row.email_verified),
    is_pro: isPro,
    badges: includeBadges ? listBadgesStmt.all(row.id) : [],
  };
}

/** Busca um usuário já no formato público. */
function getPublicUser(userId) {
  const row = db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(userId);
  return parseUserRow(row);
}

/** Dá uma insígnia pra alguém (não falha se já tiver). */
function grantBadge(userId, badgeId) {
  db.prepare('INSERT OR IGNORE INTO user_badges (user_id, badge_id, granted_at) VALUES (?, ?, ?)')
    .run(userId, badgeId, Date.now());
}

function revokeBadge(userId, badgeId) {
  db.prepare('DELETE FROM user_badges WHERE user_id = ? AND badge_id = ?').run(userId, badgeId);
}

/**
 * Gera uma tag #0000 que ainda não existe pra esse nome de usuário.
 * Com 9000 combinações por nome, só estoura se muita gente usar o mesmo nome —
 * aí avisamos em vez de gravar duplicado e quebrar a busca de amigos.
 */
function generateUniqueTag(username) {
  const taken = new Set(
    db.prepare('SELECT tag FROM users WHERE username = ?').all(username).map((r) => r.tag)
  );
  if (taken.size >= 9000) return null;

  for (let attempt = 0; attempt < 200; attempt++) {
    const tag = String(Math.floor(1000 + Math.random() * 9000));
    if (!taken.has(tag)) return tag;
  }
  // Fallback determinístico, caso a sorte esteja muito ruim
  for (let n = 1000; n <= 9999; n++) {
    const tag = String(n);
    if (!taken.has(tag)) return tag;
  }
  return null;
}

/** Aceita "nome#1234" ou só "nome" (quando houver apenas um dono daquele nome). */
function findUserByHandle(handle) {
  if (typeof handle !== 'string') return null;
  const trimmed = handle.trim().replace(/^@/, '');
  if (!trimmed) return null;

  if (trimmed.includes('#')) {
    const [username, tag] = trimmed.split('#');
    return db.prepare('SELECT * FROM users WHERE username = ? AND tag = ?').get(username.trim(), tag.trim()) || null;
  }

  const matches = db.prepare('SELECT * FROM users WHERE username = ?').all(trimmed);
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) return { ambiguous: true, count: matches.length };
  return null;
}

module.exports = {
  PUBLIC_USER_COLUMNS,
  parseUserRow,
  getPublicUser,
  grantBadge,
  revokeBadge,
  generateUniqueTag,
  findUserByHandle,
};
