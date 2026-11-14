const crypto = require('crypto');

// ─── Criptografia de dados sensíveis (LGPD) ─────────────────────────────────
// Documentos, selfies, CPF e dados bancários dos vendedores ficam criptografados com
// AES-256-GCM — no banco e no disco. Sem a chave (DATA_ENCRYPTION_KEY) ninguém lê,
// nem quem copiar o arquivo do banco ou a pasta private-files.

let cachedKey = null;
let warned = false;

function loadKey() {
  if (cachedKey) return cachedKey;
  const raw = (process.env.DATA_ENCRYPTION_KEY || '').trim();
  if (raw) {
    const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');
    if (buf.length !== 32) {
      throw new Error('DATA_ENCRYPTION_KEY precisa ter 32 bytes (64 caracteres hex). Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"');
    }
    cachedKey = buf;
    return cachedKey;
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Defina DATA_ENCRYPTION_KEY no .env antes de aceitar verificações de vendedores em produção');
  }
  if (!warned) {
    console.warn('[segurança] DATA_ENCRYPTION_KEY não definida — usando uma chave de desenvolvimento. NÃO use assim em produção.');
    warned = true;
  }
  cachedKey = crypto.scryptSync(process.env.JWT_SECRET || 'safecord-dev-secret-troque-isso-em-producao', 'safecord-kyc-dev', 32);
  return cachedKey;
}

// Formato: versão(1) | iv(12) | tag(16) | dados
function encryptBuffer(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', loadKey(), iv);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from([1]), iv, cipher.getAuthTag(), enc]);
}

function decryptBuffer(blob) {
  if (!blob || blob.length < 30 || blob[0] !== 1) throw new Error('Dado criptografado inválido');
  const iv = blob.subarray(1, 13);
  const tag = blob.subarray(13, 29);
  const decipher = crypto.createDecipheriv('aes-256-gcm', loadKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(blob.subarray(29)), decipher.final()]);
}

function encryptJSON(value) {
  return encryptBuffer(Buffer.from(JSON.stringify(value), 'utf8')).toString('base64');
}

function decryptJSON(text, fallback = null) {
  if (!text) return fallback;
  try {
    return JSON.parse(decryptBuffer(Buffer.from(text, 'base64')).toString('utf8'));
  } catch {
    return fallback;
  }
}

// Hash com chave (HMAC) pra achar CPF/CNPJ repetido sem guardar o número aberto
function blindIndex(value) {
  if (!value) return null;
  return crypto.createHmac('sha256', loadKey()).update(`idx:${value}`).digest('hex');
}

module.exports = { encryptBuffer, decryptBuffer, encryptJSON, decryptJSON, blindIndex, loadKey };
