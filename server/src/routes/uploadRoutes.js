const express = require('express');
const db = require('../db');
const { requireAuth } = require('../auth');
const { upload, saveAvatar, saveBanner, saveServerIcon, saveServerBanner, removeIfLocalUpload } = require('../uploads');

const router = express.Router();
router.use(requireAuth);

function getUserRow(id) {
  return db
    .prepare('SELECT id, username, tag, avatar_color, display_name, avatar_url, banner_url, bio, status FROM users WHERE id = ?')
    .get(id);
}

// Trata erros do multer (tamanho, tipo de arquivo) com uma resposta JSON limpa
function handleUpload(field) {
  return (req, res, next) => {
    upload.single(field)(req, res, (err) => {
      if (err) return res.status(400).json({ error: err.message || 'Falha no upload' });
      next();
    });
  };
}

router.post('/avatar', handleUpload('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  try {
    const before = getUserRow(req.user.id);
    const url = await saveAvatar(req.file.buffer, req.user.id);
    db.prepare('UPDATE users SET avatar_url = ? WHERE id = ?').run(url, req.user.id);
    removeIfLocalUpload(before?.avatar_url);
    res.json({ user: getUserRow(req.user.id) });
  } catch (e) {
    res.status(500).json({ error: 'Não foi possível processar a imagem' });
  }
});

router.post('/banner', handleUpload('banner'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  try {
    const before = getUserRow(req.user.id);
    const url = await saveBanner(req.file.buffer, req.user.id);
    db.prepare('UPDATE users SET banner_url = ? WHERE id = ?').run(url, req.user.id);
    removeIfLocalUpload(before?.banner_url);
    res.json({ user: getUserRow(req.user.id) });
  } catch (e) {
    res.status(500).json({ error: 'Não foi possível processar a imagem' });
  }
});

router.delete('/avatar', (req, res) => {
  const before = getUserRow(req.user.id);
  db.prepare('UPDATE users SET avatar_url = NULL WHERE id = ?').run(req.user.id);
  removeIfLocalUpload(before?.avatar_url);
  res.json({ user: getUserRow(req.user.id) });
});

router.delete('/banner', (req, res) => {
  const before = getUserRow(req.user.id);
  db.prepare('UPDATE users SET banner_url = NULL WHERE id = ?').run(req.user.id);
  removeIfLocalUpload(before?.banner_url);
  res.json({ user: getUserRow(req.user.id) });
});

// --- Ícone e banner do SERVIDOR (separados do avatar/banner pessoal do usuário) ---
// Só o dono do servidor pode trocar.

function getServerRow(id) {
  return db.prepare('SELECT id, name, owner_id, invite_code, icon_url, banner_url, created_at FROM servers WHERE id = ?').get(id);
}

function requireServerOwner(req, res, next) {
  const server = getServerRow(req.params.serverId);
  if (!server) return res.status(404).json({ error: 'Servidor não encontrado' });
  if (server.owner_id !== req.user.id) return res.status(403).json({ error: 'Só o dono do servidor pode alterar isso' });
  req.server = server;
  next();
}

router.post('/server/:serverId/icon', requireServerOwner, handleUpload('icon'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  try {
    const url = await saveServerIcon(req.file.buffer, req.server.id);
    db.prepare('UPDATE servers SET icon_url = ? WHERE id = ?').run(url, req.server.id);
    removeIfLocalUpload(req.server.icon_url);
    res.json({ server: getServerRow(req.server.id) });
  } catch (e) {
    res.status(500).json({ error: 'Não foi possível processar a imagem' });
  }
});

router.post('/server/:serverId/banner', requireServerOwner, handleUpload('banner'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
  try {
    const url = await saveServerBanner(req.file.buffer, req.server.id);
    db.prepare('UPDATE servers SET banner_url = ? WHERE id = ?').run(url, req.server.id);
    removeIfLocalUpload(req.server.banner_url);
    res.json({ server: getServerRow(req.server.id) });
  } catch (e) {
    res.status(500).json({ error: 'Não foi possível processar a imagem' });
  }
});

router.delete('/server/:serverId/icon', requireServerOwner, (req, res) => {
  db.prepare('UPDATE servers SET icon_url = NULL WHERE id = ?').run(req.server.id);
  removeIfLocalUpload(req.server.icon_url);
  res.json({ server: getServerRow(req.server.id) });
});

router.delete('/server/:serverId/banner', requireServerOwner, (req, res) => {
  db.prepare('UPDATE servers SET banner_url = NULL WHERE id = ?').run(req.server.id);
  removeIfLocalUpload(req.server.banner_url);
  res.json({ server: getServerRow(req.server.id) });
});

module.exports = router;
