const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { signToken, requireAuth } = require('../auth');
const { effectiveStatus } = require('../statusUtils');
const { sendVerificationEmail, isSmtpConfigured } = require('../mailer');
const {
  PUBLIC_USER_COLUMNS, parseUserRow, getPublicUser,
  grantBadge, generateUniqueTag,
} = require('../userUtils');

const router = express.Router();

const PALETTE = ['#2DD4BF', '#F0B429', '#818CF8', '#F87171', '#34D399', '#38BDF8'];
const MAX_CONNECTIONS = 6;
const ALLOWED_PLATFORMS = new Set(['discord', 'x', 'instagram', 'youtube', 'twitch', 'github', 'steam', 'tiktok', 'site']);
const STATUS_MODES = new Set(['online', 'idle', 'dnd', 'invisible']);

const VERIFICATION_TTL_MS = 30 * 60 * 1000; // 30 minutos
const RESEND_COOLDOWN_MS = 60 * 1000;       // 1 minuto entre reenvios
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function generateVerificationCode() {
  return String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
}

/** Gera, guarda e dispara um novo código de verificação pro usuário. */
async function issueVerificationCode(user) {
  const code = generateVerificationCode();
  db.prepare(
    'UPDATE users SET verification_code = ?, verification_expires = ?, verification_sent_at = ? WHERE id = ?'
  ).run(code, Date.now() + VERIFICATION_TTL_MS, Date.now(), user.id);

  const result = await sendVerificationEmail({ to: user.email, username: user.username, code });
  return result; // { delivered, devCode }
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

router.post('/register', async (req, res) => {
  const { username, password, email } = req.body || {};

  if (!username || !password || username.length < 3 || password.length < 6) {
    return res.status(400).json({ error: 'Usuário (min 3) e senha (min 6) são obrigatórios' });
  }
  if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
    return res.status(400).json({ error: 'O nome de usuário só pode ter letras, números, ponto, hífen e underline' });
  }
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'Informe um email válido' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const emailTaken = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(normalizedEmail);
  if (emailTaken) return res.status(409).json({ error: 'Esse email já está em uso' });

  // Diferente do antigo: o mesmo nome pode se repetir, o que identifica cada um é a tag (#0000).
  const tag = generateUniqueTag(username);
  if (!tag) return res.status(409).json({ error: 'Esse nome de usuário está cheio — escolha outro' });

  const id = uuidv4();
  const password_hash = bcrypt.hashSync(password, 10);
  const avatar_color = PALETTE[Math.floor(Math.random() * PALETTE.length)];

  try {
    db.prepare(
      `INSERT INTO users (id, username, tag, password_hash, avatar_color, display_name, avatar_url, banner_url,
                          bio, status, status_mode, email, email_verified, created_at)
       VALUES (?, ?, ?, ?, ?, '', NULL, NULL, '', 'online', 'online', ?, 0, ?)`
    ).run(id, username, tag, password_hash, avatar_color, normalizedEmail, Date.now());
  } catch (e) {
    // Corrida rara: alguém pegou a mesma tag entre o sorteio e o insert
    return res.status(409).json({ error: 'Não foi possível criar a conta agora — tente de novo' });
  }

  // Os 100 primeiros ganham a insígnia de pioneiro — detalhe bobo mas dá vida ao perfil.
  const totalUsers = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (totalUsers <= 100) grantBadge(id, 'early');
  if (totalUsers === 1) grantBadge(id, 'founder');

  let verification = { delivered: false, devCode: null };
  try {
    verification = await issueVerificationCode({ id, username, email: normalizedEmail });
  } catch (e) {
    console.error('Falha ao enviar email de verificação:', e.message);
  }

  const user = getPublicUser(id);
  const token = signToken(user);
  res.status(201).json({
    token,
    user,
    verification: {
      required: true,
      emailDelivered: verification.delivered,
      devCode: verification.devCode, // só vem preenchido quando não há SMTP configurado
    },
  });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'Informe usuário e senha' });

  // Aceita login por "nome#1234", por email, ou só pelo nome quando ele for único.
  const identifier = String(username).trim();
  let row = null;

  if (identifier.includes('@')) {
    row = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(identifier.toLowerCase());
  } else if (identifier.includes('#')) {
    const [name, tag] = identifier.split('#');
    row = db.prepare('SELECT * FROM users WHERE username = ? AND tag = ?').get(name.trim(), tag.trim());
  } else {
    const matches = db.prepare('SELECT * FROM users WHERE username = ?').all(identifier);
    if (matches.length > 1) {
      return res.status(409).json({ error: 'Existe mais de uma conta com esse nome — entre usando nome#0000 ou seu email' });
    }
    row = matches[0] || null;
  }

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Usuário ou senha inválidos' });
  }

  db.prepare('UPDATE users SET status = ? WHERE id = ?').run('online', row.id);
  const user = getPublicUser(row.id);
  const token = signToken(user);
  res.json({ token, user });
});

router.get('/me', requireAuth, (req, res) => {
  const user = getPublicUser(req.user.id);
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });
  res.json({ user });
});

// --- Verificação de email ---

router.post('/verify-email', requireAuth, (req, res) => {
  const { code } = req.body || {};
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (row.email_verified) return res.json({ user: getPublicUser(row.id), alreadyVerified: true });

  if (!code || !row.verification_code) {
    return res.status(400).json({ error: 'Informe o código que enviamos por email' });
  }
  if (row.verification_expires && row.verification_expires < Date.now()) {
    return res.status(400).json({ error: 'Esse código expirou — peça um novo' });
  }
  if (String(code).trim() !== row.verification_code) {
    return res.status(400).json({ error: 'Código incorreto' });
  }

  db.prepare(
    'UPDATE users SET email_verified = 1, verification_code = NULL, verification_expires = NULL WHERE id = ?'
  ).run(row.id);
  grantBadge(row.id, 'verified');

  res.json({ user: getPublicUser(row.id) });
});

router.post('/resend-verification', requireAuth, async (req, res) => {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!row) return res.status(404).json({ error: 'Usuário não encontrado' });
  if (row.email_verified) return res.status(400).json({ error: 'Esse email já está verificado' });
  if (!row.email) return res.status(400).json({ error: 'Sua conta não tem email cadastrado' });

  const waited = Date.now() - (row.verification_sent_at || 0);
  if (waited < RESEND_COOLDOWN_MS) {
    const seconds = Math.ceil((RESEND_COOLDOWN_MS - waited) / 1000);
    return res.status(429).json({ error: `Espere ${seconds}s antes de pedir outro código` });
  }

  try {
    const result = await issueVerificationCode(row);
    res.json({ emailDelivered: result.delivered, devCode: result.devCode, smtpConfigured: isSmtpConfigured() });
  } catch (e) {
    res.status(500).json({ error: 'Não foi possível enviar o email agora' });
  }
});

// Troca o email e recomeça a verificação (ex: errou o endereço no cadastro)
router.put('/me/email', requireAuth, async (req, res) => {
  const { email } = req.body || {};
  if (!email || !EMAIL_RE.test(String(email).trim())) {
    return res.status(400).json({ error: 'Informe um email válido' });
  }
  const normalized = String(email).trim().toLowerCase();

  const taken = db.prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?').get(normalized, req.user.id);
  if (taken) return res.status(409).json({ error: 'Esse email já está em uso' });

  db.prepare('UPDATE users SET email = ?, email_verified = 0 WHERE id = ?').run(normalized, req.user.id);
  db.prepare('DELETE FROM user_badges WHERE user_id = ? AND badge_id = ?').run(req.user.id, 'verified');

  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  let result = { delivered: false, devCode: null };
  try { result = await issueVerificationCode(row); } catch (e) { /* o usuário pode reenviar */ }

  res.json({ user: getPublicUser(req.user.id), emailDelivered: result.delivered, devCode: result.devCode });
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

  res.json({ user: getPublicUser(req.user.id) });
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

  res.json({ user: getPublicUser(req.user.id) });
});

module.exports = router;
