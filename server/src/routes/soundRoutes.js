const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const mm = require('music-metadata');
const db = require('../db');
const { requireAuth } = require('../auth');
const { requireServerPermission, hasPermission } = require('../permissions');
const { UPLOAD_ROOT } = require('../uploads');
const SB = require('../soundboard');

// Montado em /api/servers/:serverId/sounds
const router = express.Router({ mergeParams: true });
router.use(requireAuth);

const SOUND_DIR = path.join(UPLOAD_ROOT, 'sounds');
fs.mkdirSync(SOUND_DIR, { recursive: true });
const EXT = { 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/webm': 'webm', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac' };
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (!EXT[file.mimetype]) return cb(new Error('Formato de som não suportado (MP3, OGG, WAV, M4A ou WEBM)'));
    cb(null, true);
  },
});
const HEX = /^#[0-9a-f]{6}$/i;

function requireMember(req, res, next) {
  const m = db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(req.params.serverId, req.user.id);
  if (!m) return res.status(403).json({ error: 'Você não é membro deste servidor' });
  next();
}

function settings(serverId) {
  const s = db.prepare('SELECT soundboard_everyone, soundboard_defaults FROM servers WHERE id = ?').get(serverId);
  return { everyone: Boolean(s?.soundboard_everyone), defaults: Boolean(s?.soundboard_defaults) };
}

router.get('/', requireMember, (req, res) => {
  const st = settings(req.params.serverId);
  const canManage = hasPermission(req.params.serverId, req.user.id, 'gerenciar_soundboard');
  res.json({
    sounds: SB.serverSounds(req.params.serverId),
    settings: st,
    canManage,
    canPlay: st.everyone || canManage,
    limits: { max: SB.MAX_PER_SERVER, maxDurationMs: SB.MAX_DURATION_MS, maxBytes: 1024 * 1024 },
  });
});

router.post('/', requireServerPermission('gerenciar_soundboard'), upload.single('sound'), async (req, res) => {
  const { serverId } = req.params;
  if (!req.file) return res.status(400).json({ error: 'Envie o arquivo do som' });
  const name = String(req.body?.name || '').trim().slice(0, 32);
  if (name.length < 2) return res.status(400).json({ error: 'Dê um nome pro som (2 letras ou mais)' });
  const count = db.prepare('SELECT COUNT(*) AS n FROM server_sounds WHERE server_id = ?').get(serverId).n;
  if (count >= SB.MAX_PER_SERVER) return res.status(400).json({ error: `Limite de ${SB.MAX_PER_SERVER} sons por servidor` });
  let duration;
  try {
    const meta = await mm.parseBuffer(req.file.buffer, { mimeType: req.file.mimetype }, { duration: true });
    duration = Math.round((meta.format.duration || 0) * 1000);
  } catch {
    return res.status(400).json({ error: 'Não consegui ler esse áudio. Tente outro arquivo.' });
  }
  if (!duration) return res.status(400).json({ error: 'Não consegui ver a duração desse áudio' });
  if (duration > SB.MAX_DURATION_MS) return res.status(400).json({ error: `O som pode ter no máximo ${Math.round(SB.MAX_DURATION_MS / 1000)} segundos (esse tem ${(duration / 1000).toFixed(1)}s)` });

  const id = uuidv4();
  const filename = `${id}.${EXT[req.file.mimetype]}`;
  fs.writeFileSync(path.join(SOUND_DIR, filename), req.file.buffer);
  const volume = Math.max(5, Math.min(100, Number(req.body?.volume) || 80));
  const color = HEX.test(req.body?.color || '') ? req.body.color : '#1E7BFF';
  db.prepare('INSERT INTO server_sounds (id, server_id, name, color, file, duration_ms, volume, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, serverId, name, color, `/uploads/sounds/${filename}`, duration, volume, req.user.id, Date.now());
  req.app.get('io')?.to(`server:${serverId}`).emit('soundboard:updated', { serverId });
  res.status(201).json({ sound: db.prepare('SELECT * FROM server_sounds WHERE id = ?').get(id) });
});

router.put('/settings', requireServerPermission('gerenciar_soundboard'), (req, res) => {
  const { serverId } = req.params;
  const cur = settings(serverId);
  const everyone = req.body?.everyone !== undefined ? Boolean(req.body.everyone) : cur.everyone;
  const defaults = req.body?.defaults !== undefined ? Boolean(req.body.defaults) : cur.defaults;
  db.prepare('UPDATE servers SET soundboard_everyone = ?, soundboard_defaults = ? WHERE id = ?').run(everyone ? 1 : 0, defaults ? 1 : 0, serverId);
  req.app.get('io')?.to(`server:${serverId}`).emit('soundboard:updated', { serverId });
  res.json({ settings: settings(serverId) });
});

router.put('/:soundId', requireServerPermission('gerenciar_soundboard'), (req, res) => {
  const sound = db.prepare('SELECT * FROM server_sounds WHERE id = ? AND server_id = ?').get(req.params.soundId, req.params.serverId);
  if (!sound) return res.status(404).json({ error: 'Som não encontrado' });
  const name = req.body?.name !== undefined ? String(req.body.name).trim().slice(0, 32) : sound.name;
  if (name.length < 2) return res.status(400).json({ error: 'Nome muito curto' });
  const volume = req.body?.volume !== undefined ? Math.max(5, Math.min(100, Number(req.body.volume) || 80)) : sound.volume;
  const color = HEX.test(req.body?.color || '') ? req.body.color : sound.color;
  db.prepare('UPDATE server_sounds SET name = ?, volume = ?, color = ? WHERE id = ?').run(name, volume, color, sound.id);
  req.app.get('io')?.to(`server:${req.params.serverId}`).emit('soundboard:updated', { serverId: req.params.serverId });
  res.json({ sound: db.prepare('SELECT * FROM server_sounds WHERE id = ?').get(sound.id) });
});

router.delete('/:soundId', requireServerPermission('gerenciar_soundboard'), (req, res) => {
  const sound = db.prepare('SELECT * FROM server_sounds WHERE id = ? AND server_id = ?').get(req.params.soundId, req.params.serverId);
  if (!sound) return res.status(404).json({ error: 'Som não encontrado' });
  db.prepare('DELETE FROM server_sounds WHERE id = ?').run(sound.id);
  try { fs.unlinkSync(path.join(SOUND_DIR, path.basename(sound.file))); } catch { /* já foi */ }
  req.app.get('io')?.to(`server:${req.params.serverId}`).emit('soundboard:updated', { serverId: req.params.serverId });
  res.json({ ok: true });
});

module.exports = router;
