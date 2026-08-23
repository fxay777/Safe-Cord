const fs = require('fs');
const path = require('path');
const multer = require('multer');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');
const AVATAR_DIR = path.join(UPLOAD_ROOT, 'avatars');
const BANNER_DIR = path.join(UPLOAD_ROOT, 'banners');

for (const dir of [UPLOAD_ROOT, AVATAR_DIR, BANNER_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024; // 6MB de entrada; a saída sai bem menor (webp otimizado)

// Mantém o arquivo só em memória — nunca gravamos o original no disco, só o já otimizado.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_BYTES },
  fileFilter(req, file, cb) {
    if (!ALLOWED_MIME.has(file.mimetype)) {
      return cb(new Error('Formato de imagem não suportado (use PNG, JPEG, WEBP ou GIF)'));
    }
    cb(null, true);
  },
});

/**
 * Processa um buffer de imagem: recorta/redimensiona e recodifica pra WEBP otimizado.
 * Isso é o que faz o upload ser "otimizado" — nunca guardamos o arquivo original gigante,
 * sempre uma versão comprimida e do tamanho exato que a UI usa.
 */
async function processImage(buffer, { width, height, quality = 82 }) {
  return sharp(buffer)
    .rotate() // corrige orientação EXIF (fotos de celular)
    .resize(width, height, { fit: 'cover', position: 'attention' })
    .webp({ quality })
    .toBuffer();
}

const AVATAR_SPEC = { width: 256, height: 256 };
const BANNER_SPEC = { width: 960, height: 320 };

async function saveAvatar(buffer, userId) {
  const optimized = await processImage(buffer, AVATAR_SPEC);
  const filename = `${userId}-${uuidv4()}.webp`;
  fs.writeFileSync(path.join(AVATAR_DIR, filename), optimized);
  return `/uploads/avatars/${filename}`;
}

async function saveBanner(buffer, userId) {
  const optimized = await processImage(buffer, BANNER_SPEC);
  const filename = `${userId}-${uuidv4()}.webp`;
  fs.writeFileSync(path.join(BANNER_DIR, filename), optimized);
  return `/uploads/banners/${filename}`;
}

const SERVER_ICON_DIR = path.join(UPLOAD_ROOT, 'server-icons');
const SERVER_BANNER_DIR = path.join(UPLOAD_ROOT, 'server-banners');
for (const dir of [SERVER_ICON_DIR, SERVER_BANNER_DIR]) {
  fs.mkdirSync(dir, { recursive: true });
}

async function saveServerIcon(buffer, serverId) {
  const optimized = await processImage(buffer, AVATAR_SPEC);
  const filename = `${serverId}-${uuidv4()}.webp`;
  fs.writeFileSync(path.join(SERVER_ICON_DIR, filename), optimized);
  return `/uploads/server-icons/${filename}`;
}

async function saveServerBanner(buffer, serverId) {
  const optimized = await processImage(buffer, BANNER_SPEC);
  const filename = `${serverId}-${uuidv4()}.webp`;
  fs.writeFileSync(path.join(SERVER_BANNER_DIR, filename), optimized);
  return `/uploads/server-banners/${filename}`;
}

/** Apaga um arquivo antigo de upload (avatar ou banner) se ele pertencer ao nosso /uploads. */
function removeIfLocalUpload(urlPath) {
  if (!urlPath || typeof urlPath !== 'string' || !urlPath.startsWith('/uploads/')) return;
  const abs = path.join(UPLOAD_ROOT, urlPath.replace('/uploads/', ''));
  if (abs.startsWith(UPLOAD_ROOT) && fs.existsSync(abs)) {
    fs.unlink(abs, () => {});
  }
}

module.exports = { upload, saveAvatar, saveBanner, saveServerIcon, saveServerBanner, removeIfLocalUpload, UPLOAD_ROOT };
