const db = require('./db');
const { effectiveStatus } = require('./statusUtils');

// Colunas que podem ir pro cliente (nunca password_hash nem verification_code).
const PUBLIC_USER_COLUMNS = `id, username, tag, avatar_color, display_name, avatar_url, banner_url, bio,
  status, status_mode, spotify_track, connections, email, email_verified, pro_until, last_seen_at, pronouns, status_text, theme_primary, theme_secondary, created_at`;

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

/**
 * Perfil como OS OUTROS veem: sem email (dado privado da conta).
 * Use isto sempre que um usuário for mostrado/enviado pra outra pessoa.
 */
function getProfileForOthers(userId) {
  const user = getPublicUser(userId);
  if (!user) return null;
  const { email, email_verified, ...rest } = user;
  // Quem está invisível aparece offline para os outros — nunca revelar o modo escolhido
  const shown = effectiveStatus(user.status_mode, user.status === 'online');
  return { ...rest, status_mode: shown, status: shown };
}

/** Quem tem relação com o usuário: amigos, quem divide servidor ou conversa com ele. */
function relatedUserIds(userId) {
  const rows = db.prepare(
    `SELECT CASE WHEN requester_id = ? THEN addressee_id ELSE requester_id END AS id
       FROM friendships WHERE status = 'accepted' AND (requester_id = ? OR addressee_id = ?)
     UNION SELECT sm2.user_id FROM server_members sm1 JOIN server_members sm2 ON sm2.server_id = sm1.server_id WHERE sm1.user_id = ?
     UNION SELECT p2.user_id FROM dm_participants p1 JOIN dm_participants p2 ON p2.conversation_id = p1.conversation_id WHERE p1.user_id = ?`
  ).all(userId, userId, userId, userId, userId);
  return new Set(rows.map((r) => r.id));
}

/** Pode ver o perfil completo (banner, bio…)? Só quem tem alguma relação — igual ao Discord. */
function canViewProfile(viewerId, targetId) {
  if (viewerId === targetId) return true;
  return relatedUserIds(viewerId).has(targetId);
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
  getProfileForOthers,
  relatedUserIds,
  canViewProfile,
  PUBLIC_USER_COLUMNS,
  parseUserRow,
  getPublicUser,
  grantBadge,
  revokeBadge,
  generateUniqueTag,
  findUserByHandle,
};
