const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { signToken, requireAuth } = require('../auth');
const { effectiveStatus } = require('../statusUtils');

const router = express.Router();

const PALETTE = ['#2DD4BF', '#F0B429', '#818CF8', '#F87171', '#34D399', '#38BDF8'];
const PUBLIC_USER_COLUMNS = 'id, username, tag, avatar_color, display_name, avatar_url, banner_url, bio, status, status_mode, spotify_track, connections';
const MAX_CONNECTIONS = 6;
const ALLOWED_PLATFORMS = new Set(['discord', 'x', 'instagram', 'youtube', 'twitch', 'github', 'steam', 'tiktok', 'site']);
const STATUS_MODES = new Set(['online', 'idle', 'dnd', 'invisible']);

function parseUserRow(row) {
  if (!row) return row;
  let connections = [];
  try {
    connections = JSON.parse(row.connections || '[]');
  } catch {
    connections = [];
  }
  let spotify_track = null;
  try {
    spotify_track = row.spotify_track ? JSON.parse(row.spotify_track) : null;
  } catch {
    spotify_track = null;
  }
  return { ...row, connections, spotify_track };
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

// A faixa vem inteira do resultado da busca (id, nome, artista, capa...) — aqui só
// garantimos que tem o mínimo necessário e limitamos o tamanho dos textos.
function sanitizeSpotifyTrack(raw) {
  if (raw === null) return null; // explicitamente removendo a música fixada
  if (!raw || typeof raw !== 'object' || !raw.id || !raw.name) return undefined; // formato inválido — ignora, mantém o que já tinha
  return {
    id: String(raw.id).slice(0, 64),
    name: String(raw.name).slice(0, 200),
    artists: typeof raw.artists === 'string' ? raw.artists.slice(0, 200) : '',
    album: typeof raw.album === 'string' ? raw.album.slice(0, 200) : '',
    image: typeof raw.image === 'string' ? raw.image.slice(0, 500) : null,
    preview_url: typeof raw.preview_url === 'string' ? raw.preview_url.slice(0, 500) : null,
    external_url: typeof raw.external_url === 'string' ? raw.external_url.slice(0, 500) : null,
  };
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
    `INSERT INTO users (id, username, tag, password_hash, avatar_color, display_name, avatar_url, banner_url, bio, status, status_mode, created_at)
     VALUES (?, ?, ?, ?, ?, '', NULL, NULL, '', 'online', 'online', ?)`
  ).run(id, username, tag, password_hash, avatar_color, Date.now());

  const user = { id, username, tag, avatar_color, display_name: '', avatar_url: null, banner_url: null, bio: '', status: 'online', status_mode: 'online', spotify_track: null, connections: [] };
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
    status: row.status,
    status_mode: row.status_mode || 'online',
    spotify_track: row.spotify_track,
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
  const safeSpotifyTrack = spotify_track !== undefined ? sanitizeSpotifyTrack(spotify_track) : undefined;
  const safeConnections = connections !== undefined ? JSON.stringify(sanitizeConnections(connections)) : undefined;

  const current = db.prepare('SELECT spotify_track, connections FROM users WHERE id = ?').get(req.user.id);

  db.prepare(
    `UPDATE users
     SET display_name = ?, bio = ?, avatar_color = COALESCE(?, avatar_color),
         spotify_track = ?, connections = ?
     WHERE id = ?`
  ).run(
    safeDisplayName,
    safeBio,
    safeAvatarColor,
    safeSpotifyTrack !== undefined ? (safeSpotifyTrack ? JSON.stringify(safeSpotifyTrack) : null) : current.spotify_track,
    safeConnections !== undefined ? safeConnections : current.connections,
    req.user.id
  );

  const row = db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(req.user.id);
  res.json({ user: parseUserRow(row) });
});

// Muda o status de presença escolhido (online/ausente/não incomodar/invisível) e avisa
// todo mundo em tempo real — invisível é reportado como offline pros outros, como no Discord.
router.put('/me/status', requireAuth, (req, res) => {
  const { status_mode } = req.body || {};
  if (!STATUS_MODES.has(status_mode)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  db.prepare('UPDATE users SET status_mode = ? WHERE id = ?').run(status_mode, req.user.id);

  const io = req.app.get('io');
  if (io) {
    io.emit('presence:update', { userId: req.user.id, status: effectiveStatus(status_mode, true) });
  }

  const row = db.prepare(`SELECT ${PUBLIC_USER_COLUMNS} FROM users WHERE id = ?`).get(req.user.id);
  res.json({ user: parseUserRow(row) });
});

module.exports = router;
