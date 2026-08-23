const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { signToken, requireAuth } = require('../auth');

const router = express.Router();

const PALETTE = ['#2DD4BF', '#F0B429', '#818CF8', '#F87171', '#34D399', '#38BDF8'];
const PUBLIC_USER_COLUMNS = 'id, username, tag, avatar_color, display_name, avatar_url, banner_url, bio, status, spotify_track_id, connections';
const MAX_CONNECTIONS = 6;
const ALLOWED_PLATFORMS = new Set(['discord', 'x', 'instagram', 'youtube', 'twitch', 'github', 'steam', 'tiktok', 'site']);

function parseUserRow(row) {
  if (!row) return row;
  let connections = [];
  try {
    connections = JSON.parse(row.connections || '[]');
  } catch {
    connections = [];
  }
  return { ...row, connections };
}

function sanitizeConnections(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c) => c && typeof c === 'object')
    .filter((c) => ALLOWED_PLATFORMS.has(c.platform))
    .slice(0, MAX_CONNECTIONS)
    .map((c) => ({
      platform: c.platform,
      label: typeof c.label === 'string' ? c.label.trim().slice(0, 60) : '',
      url: typeof c.url === 'string' ? c.url.trim().slice(0, 300) : '',
    }))
    .filter((c) => c.label);
}

// Aceita um link comum do Spotify (track) ou só o ID e devolve o ID limpo, ou null se inválido.
function extractSpotifyTrackId(input) {
  if (!input || typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  const urlMatch = trimmed.match(/open\.spotify\.com\/track\/([a-zA-Z0-9]{10,30})/);
  if (urlMatch) return urlMatch[1];
  if (/^[a-zA-Z0-9]{10,30}$/.test(trimmed)) return trimmed;
  return null;
}

router.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || username.length < 3 || password.length < 6) {
    return res.status(400).json({ error: 'Usuário (min 3) e senha (min 6) são obrigatórios' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Nome de usuário já existe' });

  const id = uuidv4();
  const tag = String(Math.floor(1000 + Math.random() * 9000));
  const password_hash = bcrypt.hashSync(password, 10);
  const avatar_color = PALETTE[Math.floor(Math.random() * PALETTE.length)];

  db.prepare(
    `INSERT INTO users (id, username, tag, password_hash, avatar_color, display_name, avatar_url, banner_url, bio, status, created_at)
     VALUES (?, ?, ?, ?, ?, '', NULL, NULL, '', 'online', ?)`
  ).run(id, username, tag, password_hash, avatar_color, Date.now());

  const user = { id, username, tag, avatar_color, display_name: '', avatar_url: null, banner_url: null, bio: '', spotify_track_id: null, connections: [] };
  const token = signToken(user);
  res.status(201).json({ token, user });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }
  db.prepare('UPDATE users SET status = ? WHERE id = ?').run('online', row.id);
  const user = parseUserRow({
    id: row.id,
    username: row.username,
    tag: row.tag,
    avatar_color: row.avatar_color,
    display_name: row.display_name || '',
    avatar_url: row.avatar_url || null,
    banner_url: row.banner_url || null,
    bio: row.bio || '',
    spotify_track_id: row.spotify_track_id || null,
    connections: row.connections,
  });
  const token = signToken(user);
  res.json({ token, user });
});

router.get('/me', requireAuth, (req, res) => {
  const row = db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json({ user: parseUserRow(row) });
});

// Atualiza os campos de texto do perfil. Foto e banner têm rotas próprias
// (POST /api/uploads/avatar e /api/uploads/banner) porque envolvem processamento
// de imagem (multer + sharp) — não fazem sentido como string JSON.
router.put('/me/profile', requireAuth, (req, res) => {
  const { display_name, bio, avatar_color, spotify_track, connections } = req.body || {};

  const safeDisplayName = typeof display_name === 'string' ? display_name.trim().slice(0, 40) : '';
  const safeBio = typeof bio === 'string' ? bio.trim().slice(0, 220) : '';
  const safeAvatarColor = typeof avatar_color === 'string' && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(avatar_color)
    ? avatar_color
    : null;
  const safeSpotifyTrackId = spotify_track !== undefined ? extractSpotifyTrackId(spotify_track) : undefined;
  const safeConnections = connections !== undefined ? JSON.stringify(sanitizeConnections(connections)) : undefined;

  const current = db.prepare('SELECT spotify_track_id, connections FROM users WHERE id = ?').get(req.user.id);

  db.prepare(
    `UPDATE users
     SET display_name = ?, bio = ?, avatar_color = COALESCE(?, avatar_color),
         spotify_track_id = ?, connections = ?
     WHERE id = ?`
  ).run(
    safeDisplayName,
    safeBio,
    safeAvatarColor,
    safeSpotifyTrackId !== undefined ? safeSpotifyTrackId : current.spotify_track_id,
    safeConnections !== undefined ? safeConnections : current.connections,
    req.user.id
  );

  const row = db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(req.user.id);
  res.json({ user: parseUserRow(row) });
});

module.exports = router;
