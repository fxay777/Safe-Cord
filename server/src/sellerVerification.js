const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const sharp = require('sharp');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { encryptBuffer, decryptBuffer, encryptJSON, decryptJSON, blindIndex } = require('./secureData');
const br = require('./brValidators');

// ─── Verificação de vendedores ──────────────────────────────────────────────
// Quem abre loja passa por: dados pessoais (e da empresa, se CNPJ) + endereço, foto do
// documento, prova de vida pela câmera e conta bancária/Pix no próprio nome. Um admin
// revisa e aprova; só então a loja aparece na vitrine. Hoje a revisão é manual; o campo
// `provider` deixa espaço pra plugar um serviço automático (idwall, unico…) depois.

const KYC_DIR = path.join(__dirname, '..', 'private-files', 'kyc');
fs.mkdirSync(KYC_DIR, { recursive: true });

const DOC_TYPES = {
  rg: { label: 'RG (identidade)', needsBack: true },
  cnh: { label: 'CNH (carteira de motorista)', needsBack: false },
  rne: { label: 'RNE / CRNM (estrangeiro)', needsBack: true },
  passaporte: { label: 'Passaporte', needsBack: false },
};

const LIVENESS_STEPS = {
  frente: 'Olhe direto pra câmera',
  esquerda: 'Vire o rosto devagar para a esquerda',
  direita: 'Vire o rosto devagar para a direita',
  sorriso: 'Dê um sorriso',
  cima: 'Levante um pouco o queixo',
  documento: 'Segure seu documento ao lado do rosto',
};
const LIVENESS_TTL_MS = 5 * 60 * 1000;

const SECTIONS = ['loja', 'dados', 'documento', 'rosto', 'banco'];
const SECTION_LABELS = {
  loja: 'Loja', dados: 'Seus dados', documento: 'Documento', rosto: 'Rosto', banco: 'Conta bancária',
};

const STORE_CATEGORIES = [
  'Moda e acessórios', 'Arte e design', 'Games', 'Cursos e e-books', 'Música', 'Tecnologia',
  'Artesanato', 'Beleza', 'Comida', 'Serviços digitais', 'Outros',
];

const now = () => Date.now();

// ─── arquivos criptografados ────────────────────────────────────────────────
async function saveKycImage(buffer, { maxSide = 1800 } = {}) {
  // Recodifica (tira EXIF/GPS do celular) e limita o tamanho antes de criptografar
  const jpeg = await sharp(buffer).rotate()
    .resize(maxSide, maxSide, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 86 }).toBuffer();
  const sha = crypto.createHash('sha256').update(buffer).digest('hex');
  const file = `${uuidv4()}.bin`;
  fs.writeFileSync(path.join(KYC_DIR, file), encryptBuffer(jpeg));
  return { file, sha };
}

function readKycFile(file) {
  const safe = path.basename(String(file || ''));
  const full = path.join(KYC_DIR, safe);
  if (!safe || !fs.existsSync(full)) return null;
  return decryptBuffer(fs.readFileSync(full));
}

function removeKycFile(file) {
  if (!file) return;
  try { fs.unlinkSync(path.join(KYC_DIR, path.basename(file))); } catch { /* já foi */ }
}

// ─── linha do banco ─────────────────────────────────────────────────────────
function getRow(userId) {
  return db.prepare('SELECT * FROM seller_verifications WHERE user_id = ?').get(userId);
}

function ensureRow(userId) {
  let row = getRow(userId);
  if (!row) {
    db.prepare('INSERT INTO seller_verifications (user_id, created_at, updated_at) VALUES (?, ?, ?)').run(userId, now(), now());
    row = getRow(userId);
  }
  return row;
}

const readFiles = (row) => { try { return JSON.parse(row?.files || '{}'); } catch { return {}; } };
const readData = (row) => decryptJSON(row?.data_enc, {}) || {};
const isEditable = (row) => !row || ['draft', 'rejected'].includes(row.status);

function log(userId, action, actorId, note) {
  db.prepare('INSERT INTO verification_log (user_id, action, actor_id, note, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(userId, action, actorId || null, note ? String(note).slice(0, 500) : null, now());
}

// ─── validação das seções ───────────────────────────────────────────────────
const text = (v, max) => String(v ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

function validatePersonal(body) {
  const person_type = body.person_type === 'pj' ? 'pj' : body.person_type === 'pf' ? 'pf' : null;
  if (!person_type) return { error: 'Escolha se você vende como pessoa física (CPF) ou empresa (CNPJ)' };

  const p = body.personal || {};
  const personal = {
    full_name: text(p.full_name, 120),
    cpf: br.onlyDigits(p.cpf),
    birth_date: String(p.birth_date || '').slice(0, 10),
    phone: br.onlyDigits(p.phone),
  };
  if (personal.full_name.split(' ').filter(Boolean).length < 2) return { error: 'Informe seu nome completo, igual ao documento', field: 'full_name' };
  if (!br.isValidCPF(personal.cpf)) return { error: 'CPF inválido', field: 'cpf' };
  const age = br.ageFrom(personal.birth_date);
  if (age === null || age > 120) return { error: 'Data de nascimento inválida', field: 'birth_date' };
  if (age < 18) return { error: 'É preciso ter 18 anos ou mais para vender no SafeCord', field: 'birth_date' };
  if (!br.isValidPhone(personal.phone)) return { error: 'Celular inválido — use DDD + número', field: 'phone' };

  let business = null;
  if (person_type === 'pj') {
    const b = body.business || {};
    business = { cnpj: br.onlyDigits(b.cnpj), company_name: text(b.company_name, 140), trade_name: text(b.trade_name, 80) };
    if (!br.isValidCNPJ(business.cnpj)) return { error: 'CNPJ inválido', field: 'cnpj' };
    if (business.company_name.length < 3) return { error: 'Informe a razão social da empresa', field: 'company_name' };
  }

  const a = body.address || {};
  const address = {
    cep: br.onlyDigits(a.cep), street: text(a.street, 120), number: text(a.number, 12), complement: text(a.complement, 60),
    district: text(a.district, 60), city: text(a.city, 60), state: text(a.state, 2).toUpperCase(),
  };
  if (address.cep.length !== 8) return { error: 'CEP inválido (8 números)', field: 'cep' };
  if (!address.street || !address.number) return { error: 'Informe rua e número', field: 'street' };
  if (!address.district || !address.city) return { error: 'Informe bairro e cidade', field: 'city' };
  if (!br.UFS.includes(address.state)) return { error: 'UF inválida', field: 'state' };

  return { person_type, personal, business, address };
}

function validateBank(body, data, personType) {
  if (!data.personal) return { error: 'Preencha seus dados antes da conta bancária' };
  const b = body.bank || {};
  const code = br.onlyDigits(b.bank_code).padStart(3, '0').slice(-3);
  const bank = {
    bank_code: code,
    bank_name: br.bankName(code) || text(b.bank_name, 60),
    agency: br.onlyDigits(b.agency),
    agency_digit: text(b.agency_digit, 1).toUpperCase(),
    account: br.onlyDigits(b.account),
    account_digit: text(b.account_digit, 2).toUpperCase(),
    account_type: ['corrente', 'poupanca', 'pagamento'].includes(b.account_type) ? b.account_type : null,
    holder_name: text(b.holder_name, 140),
    holder_document: br.onlyDigits(b.holder_document),
  };
  if (!/^\d{3}$/.test(code) || code === '000') return { error: 'Escolha o banco', field: 'bank_code' };
  if (!bank.bank_name) return { error: 'Informe o nome do banco', field: 'bank_name' };
  if (!/^\d{1,5}$/.test(bank.agency)) return { error: 'Agência inválida (até 5 números, sem o dígito)', field: 'agency' };
  if (bank.agency_digit && !/^[0-9X]$/.test(bank.agency_digit)) return { error: 'Dígito da agência inválido', field: 'agency_digit' };
  if (!/^\d{3,13}$/.test(bank.account)) return { error: 'Número da conta inválido', field: 'account' };
  if (!/^[0-9X]{1,2}$/.test(bank.account_digit)) return { error: 'Informe o dígito da conta', field: 'account_digit' };
  if (!bank.account_type) return { error: 'Escolha o tipo de conta', field: 'account_type' };
  if (bank.holder_name.length < 3) return { error: 'Informe o nome do titular da conta', field: 'holder_name' };

  // A conta precisa estar no nome de quem vende: o CPF da pessoa ou o CNPJ da empresa
  const allowed = [data.personal.cpf];
  if (personType === 'pj' && data.business?.cnpj) allowed.push(data.business.cnpj);
  if (!allowed.includes(bank.holder_document)) {
    return {
      error: personType === 'pj'
        ? 'A conta precisa estar no CNPJ da empresa ou no seu CPF'
        : 'A conta precisa estar no seu nome — use o mesmo CPF dos seus dados',
      field: 'holder_document',
    };
  }

  const pixType = br.PIX_TYPES.includes(body.pix?.type) ? body.pix.type : null;
  if (!pixType) return { error: 'Escolha o tipo da chave Pix', field: 'pix_type' };
  const pixKey = br.normalizePixKey(pixType, body.pix?.key);
  if (!pixKey) return { error: 'Chave Pix inválida para o tipo escolhido', field: 'pix_key' };
  if ((pixType === 'cpf' || pixType === 'cnpj') && !allowed.includes(pixKey)) {
    return { error: 'A chave Pix de CPF/CNPJ precisa ser a sua (ou da sua empresa)', field: 'pix_key' };
  }
  return { bank, pix: { type: pixType, key: pixKey } };
}

// ─── progresso ──────────────────────────────────────────────────────────────
function sectionsDone(row, store) {
  const data = readData(row);
  const files = readFiles(row);
  const doc = DOC_TYPES[row?.doc_type];
  return {
    loja: Boolean(store),
    dados: Boolean(data.personal && data.address && (row.person_type !== 'pj' || data.business)),
    documento: Boolean(doc && files.doc_front && (!doc.needsBack || files.doc_back)),
    rosto: Boolean(row?.liveness_at && files.selfie && files.liveness?.length),
    banco: Boolean(data.bank && data.pix),
  };
}

function maskedData(data, personType) {
  if (!data.personal) return {};
  return {
    personal: {
      full_name: data.personal.full_name,
      cpf: br.maskCPF(data.personal.cpf),
      birth_date: data.personal.birth_date ? `••/••/${data.personal.birth_date.slice(0, 4)}` : '',
      phone: br.maskTail(data.personal.phone, 4),
    },
    business: personType === 'pj' && data.business
      ? { ...data.business, cnpj: br.maskCNPJ(data.business.cnpj) } : null,
    address: data.address ? { city: data.address.city, state: data.address.state } : null,
    bank: data.bank ? {
      bank_code: data.bank.bank_code, bank_name: data.bank.bank_name, account_type: data.bank.account_type,
      agency: data.bank.agency, account: br.maskTail(data.bank.account, 3), holder_name: data.bank.holder_name,
    } : null,
    pix: data.pix ? { type: data.pix.type, key: data.pix.type === 'random' || data.pix.type === 'email' ? data.pix.key : br.maskTail(data.pix.key, 4) } : null,
  };
}

/** O que o próprio vendedor vê. Dados completos só enquanto dá pra editar; depois, mascarados. */
function ownerView(userId) {
  const row = getRow(userId);
  const store = db.prepare('SELECT id, status FROM stores WHERE owner_id = ?').get(userId);
  if (!row) {
    return {
      status: 'draft', editable: true, person_type: null, doc_type: null, data: {}, files: {},
      sections: { ...Object.fromEntries(SECTIONS.map((s) => [s, false])), loja: Boolean(store) },
      reject_reason: null, reject_sections: [], payout_mode: 'manual',
    };
  }
  const files = readFiles(row);
  const data = readData(row);
  const editable = isEditable(row);
  return {
    status: row.status,
    editable,
    person_type: row.person_type,
    doc_type: row.doc_type,
    data: editable ? data : maskedData(data, row.person_type),
    files: {
      doc_front: Boolean(files.doc_front), doc_back: Boolean(files.doc_back),
      selfie: Boolean(files.selfie), liveness_frames: files.liveness?.length || 0,
    },
    sections: sectionsDone(row, store),
    terms_accepted: Boolean(row.terms_accepted_at),
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    reject_reason: row.status === 'rejected' ? row.reject_reason : null,
    reject_sections: row.status === 'rejected' ? JSON.parse(row.reject_sections || '[]') : [],
    payout_mode: row.payout_mode,
  };
}

function saveData(userId, patch, extraColumns = {}) {
  const row = ensureRow(userId);
  const data = { ...readData(row), ...patch };
  const cols = { data_enc: encryptJSON(data), updated_at: now(), ...extraColumns };
  const keys = Object.keys(cols);
  db.prepare(`UPDATE seller_verifications SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE user_id = ?`)
    .run(...keys.map((k) => cols[k]), userId);
}

function setFiles(userId, files, extraColumns = {}) {
  const cols = { files: JSON.stringify(files), updated_at: now(), ...extraColumns };
  const keys = Object.keys(cols);
  db.prepare(`UPDATE seller_verifications SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE user_id = ?`)
    .run(...keys.map((k) => cols[k]), userId);
}

// ─── visão do admin ─────────────────────────────────────────────────────────
function normalizeName(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

function flagsFor(row, data) {
  const flags = [];
  if (row.cpf_hash) {
    const n = db.prepare('SELECT COUNT(*) AS n FROM seller_verifications WHERE cpf_hash = ? AND user_id != ?').get(row.cpf_hash, row.user_id).n;
    if (n) flags.push({ level: 'danger', text: `Esse CPF também aparece em outra${n > 1 ? 's' : ''} ${n} conta${n > 1 ? 's' : ''}` });
  }
  if (row.cnpj_hash) {
    const n = db.prepare('SELECT COUNT(*) AS n FROM seller_verifications WHERE cnpj_hash = ? AND user_id != ?').get(row.cnpj_hash, row.user_id).n;
    if (n) flags.push({ level: 'danger', text: 'Esse CNPJ também aparece em outra conta' });
  }
  if (data.bank && data.personal) {
    const holder = normalizeName(data.bank.holder_name);
    const names = [data.personal.full_name, data.business?.company_name, data.business?.trade_name].map(normalizeName).filter(Boolean);
    if (!names.includes(holder)) flags.push({ level: 'warn', text: 'Nome do titular da conta é diferente do nome informado' });
  }
  const user = db.prepare('SELECT created_at FROM users WHERE id = ?').get(row.user_id);
  const created = typeof user?.created_at === 'number' ? user.created_at : Date.parse(user?.created_at || '');
  if (created && now() - created < 7 * 86400000) flags.push({ level: 'info', text: 'Conta criada há menos de 7 dias' });
  const files = readFiles(row);
  const shas = (files.liveness || []).map((f) => f.sha);
  if (shas.length && new Set(shas).size !== shas.length) flags.push({ level: 'danger', text: 'Fotos repetidas na prova de vida' });
  return flags;
}

function adminSummary(row) {
  const data = readData(row);
  const user = db.prepare('SELECT id, username, tag, display_name, avatar_url, avatar_color, email FROM users WHERE id = ?').get(row.user_id);
  const store = db.prepare('SELECT id, name, logo_url, status FROM stores WHERE owner_id = ?').get(row.user_id);
  return {
    user_id: row.user_id,
    user,
    store,
    status: row.status,
    person_type: row.person_type,
    full_name: data.personal?.full_name || null,
    company_name: data.business?.company_name || null,
    submitted_at: row.submitted_at,
    reviewed_at: row.reviewed_at,
    flags: flagsFor(row, data),
  };
}

function adminDetail(userId) {
  const row = getRow(userId);
  if (!row) return null;
  const data = readData(row);
  const files = readFiles(row);
  const store = db.prepare('SELECT * FROM stores WHERE owner_id = ?').get(userId);
  return {
    ...adminSummary(row),
    doc_type: row.doc_type,
    doc_label: DOC_TYPES[row.doc_type]?.label || null,
    data: {
      ...data,
      personal: data.personal ? { ...data.personal, cpf_formatted: br.formatCPF(data.personal.cpf) } : null,
      business: data.business ? { ...data.business, cnpj_formatted: br.formatCNPJ(data.business.cnpj) } : null,
    },
    store: store ? {
      id: store.id, name: store.name, description: store.description, category: store.category, logo_url: store.logo_url,
      status: store.status, contact_email: store.contact_email, contact_phone: store.contact_phone,
    } : null,
    files: [
      files.doc_front && { key: 'doc_front', label: 'Documento — frente' },
      files.doc_back && { key: 'doc_back', label: 'Documento — verso' },
      ...(files.liveness || []).map((f, i) => ({ key: `liveness-${i}`, label: `Prova de vida: ${LIVENESS_STEPS[f.step] || f.step}`, step: f.step })),
    ].filter(Boolean),
    liveness_at: row.liveness_at,
    terms_accepted_at: row.terms_accepted_at,
    reject_reason: row.reject_reason,
    reject_sections: JSON.parse(row.reject_sections || '[]'),
    log: db.prepare('SELECT action, actor_id, note, created_at FROM verification_log WHERE user_id = ? ORDER BY id DESC LIMIT 20').all(userId),
  };
}

function fileForAdmin(userId, key) {
  const files = readFiles(getRow(userId));
  let name = null;
  if (key === 'doc_front' || key === 'doc_back' || key === 'selfie') name = files[key];
  const m = /^liveness-(\d+)$/.exec(key);
  if (m) name = files.liveness?.[Number(m[1])]?.file;
  return name ? readKycFile(name) : null;
}

/** Pra onde o admin manda o dinheiro (dados completos, só pro admin). */
function payoutDestination(userId) {
  const row = getRow(userId);
  if (!row) return null;
  const data = readData(row);
  if (!data.bank && !data.pix) return null;
  return {
    verified: row.status === 'approved',
    status: row.status,
    payout_mode: row.payout_mode,
    pix: data.pix || null,
    bank: data.bank ? {
      ...data.bank,
      holder_document_formatted: data.bank.holder_document.length === 14 ? br.formatCNPJ(data.bank.holder_document) : br.formatCPF(data.bank.holder_document),
    } : null,
  };
}

function isApproved(userId) {
  return getRow(userId)?.status === 'approved';
}

module.exports = {
  DOC_TYPES, LIVENESS_STEPS, LIVENESS_TTL_MS, SECTIONS, SECTION_LABELS, STORE_CATEGORIES,
  saveKycImage, readKycFile, removeKycFile,
  getRow, ensureRow, readFiles, readData, isEditable, log,
  validatePersonal, validateBank, sectionsDone, ownerView, saveData, setFiles,
  adminSummary, adminDetail, fileForAdmin, payoutDestination, isApproved, blindIndex,
};
