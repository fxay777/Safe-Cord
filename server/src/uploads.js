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

// --- Anexos de mensagem (imagem e vídeo) ---
// Diferente de avatar/banner: aqui NÃO recortamos em quadrado — a proporção original é
// preservada, só limitamos o lado maior. Vídeo não passa pelo sharp (ele só lida com
// imagem), então é salvo como veio, com validação de tipo e tamanho.
const ATTACHMENT_DIR = path.join(UPLOAD_ROOT, 'attachments');
fs.mkdirSync(ATTACHMENT_DIR, { recursive: true });

const ALLOWED_ATTACHMENT_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'video/mp4', 'video/webm', 'video/quicktime',
]);
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB — cobre imagem e vídeo curto
const MAX_ATTACHMENT_DIMENSION = 1600;
const VIDEO_EXT = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

const uploadAttachment = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_ATTACHMENT_BYTES },
  fileFilter(req, file, cb) {
    if (!ALLOWED_ATTACHMENT_MIME.has(file.mimetype)) {
      return cb(new Error('Formato não suportado (imagem PNG/JPEG/WEBP/GIF ou vídeo MP4/WEBM/MOV)'));
    }
    cb(null, true);
  },
});

// Confere o tipo REAL do vídeo pelos primeiros bytes (o "type" que o navegador manda é só uma dica)
function sniffVideo(buffer) {
  if (buffer.length < 16) return null;
  if (buffer.readUInt32BE(0) === 0x1a45dfa3) return 'video/webm';
  if (buffer.toString('latin1', 4, 8) === 'ftyp') {
    const brand = buffer.toString('latin1', 8, 12);
    return brand === 'qt  ' ? 'video/quicktime' : 'video/mp4';
  }
  return null;
}

const num = (v, max) => { const n = Number(v); return Number.isFinite(n) && n > 0 && n <= max ? Math.round(n) : null; };

/**
 * Salva um anexo de mensagem. Imagem: otimiza pra WEBP (mantendo a ANIMAÇÃO de GIF/WEBP animado —
 * antes virava uma imagem parada). Vídeo: confere que é vídeo de verdade e guarda como veio.
 * meta (opcional, do app): largura/altura/duração do vídeo, pra montar o player sem "pular".
 */
async function saveMessageAttachment(buffer, mimetype, userId, originalName, meta = {}) {
  if (mimetype.startsWith('video/')) {
    const real = sniffVideo(buffer);
    if (!real) throw Object.assign(new Error('Esse arquivo não é um vídeo válido (MP4, WEBM ou MOV)'), { status: 400 });
    const ext = VIDEO_EXT[real] || 'mp4';
    const filename = `${userId}-${uuidv4()}.${ext}`;
    fs.writeFileSync(path.join(ATTACHMENT_DIR, filename), buffer);
    return {
      url: `/uploads/attachments/${filename}`,
      name: originalName || `video.${ext}`,
      size: buffer.length,
      type: real,
      width: num(meta.width, 8192),
      height: num(meta.height, 8192),
      duration: num(meta.duration, 60 * 60 * 6),
    };
  }

  let info;
  try { info = await sharp(buffer, { animated: true }).metadata(); } catch {
    throw Object.assign(new Error('Não consegui ler essa imagem'), { status: 400 });
  }
  const animated = (info.pages || 1) > 1;
  const pipeline = sharp(buffer, { animated, limitInputPixels: 80_000_000 }).rotate().resize({
    width: MAX_ATTACHMENT_DIMENSION,
    height: MAX_ATTACHMENT_DIMENSION,
    fit: 'inside',           // preserva proporção, só reduz se passar do limite
    withoutEnlargement: true,
  });

  const filename = `${userId}-${uuidv4()}.webp`;
  const outputBuffer = await pipeline.webp(animated ? { quality: 78, effort: 3 } : { quality: 85 }).toBuffer();
  const out = await sharp(outputBuffer, { animated }).metadata();
  fs.writeFileSync(path.join(ATTACHMENT_DIR, filename), outputBuffer);

  return {
    url: `/uploads/attachments/${filename}`,
    width: out.width,
    height: animated ? (out.pageHeight || out.height) : out.height,
    size: outputBuffer.length,
    name: originalName || 'imagem.webp',
    type: 'image/webp',
    animated,
  };
}

// ─── Mercado ────────────────────────────────────────────────────────────────
// Fotos de produto são públicas (servidas em /uploads/products). O arquivo de produto DIGITAL
// vai pra uma pasta privada FORA de /uploads — só sai pela rota de download, depois de pago.
const PRODUCT_IMAGE_DIR = path.join(UPLOAD_ROOT, 'products');
const STORE_IMAGE_DIR = path.join(UPLOAD_ROOT, 'stores');
const PRIVATE_ROOT = path.join(__dirname, '..', 'private-files');
const DIGITAL_DIR = path.join(PRIVATE_ROOT, 'digital');
for (const dir of [PRODUCT_IMAGE_DIR, STORE_IMAGE_DIR, DIGITAL_DIR]) fs.mkdirSync(dir, { recursive: true });

const MAX_DIGITAL_BYTES = 100 * 1024 * 1024; // 100MB
const uploadDigital = multer({
  storage: multer.diskStorage({
    destination: DIGITAL_DIR,
    filename: (req, file, cb) => cb(null, `${uuidv4()}.bin`), // nome aleatório, sem extensão executável
  }),
  limits: { fileSize: MAX_DIGITAL_BYTES },
});

async function saveProductImage(buffer, storeId) {
  const optimized = await sharp(buffer).rotate()
    .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 84 }).toBuffer();
  const filename = `${storeId}-${uuidv4()}.webp`;
  fs.writeFileSync(path.join(PRODUCT_IMAGE_DIR, filename), optimized);
  return `/uploads/products/${filename}`;
}

async function saveStoreImage(buffer, storeId, kind) {
  const spec = kind === 'banner' ? BANNER_SPEC : AVATAR_SPEC;
  const optimized = await processImage(buffer, spec);
  const filename = `${storeId}-${kind}-${uuidv4()}.webp`;
  fs.writeFileSync(path.join(STORE_IMAGE_DIR, filename), optimized);
  return `/uploads/stores/${filename}`;
}

function digitalFilePath(storedName) {
  const safe = path.basename(storedName || '');
  return path.join(DIGITAL_DIR, safe);
}

module.exports = {
  uploadDigital, saveProductImage, saveStoreImage, digitalFilePath, MAX_DIGITAL_BYTES,
  upload, saveAvatar, saveBanner, saveServerIcon, saveServerBanner, removeIfLocalUpload, UPLOAD_ROOT,
  uploadAttachment, saveMessageAttachment,
};
