const express = require('express');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../auth');
const { requireAdmin } = require('../adminUtils');
const { upload } = require('../uploads');
const br = require('../brValidators');
const kyc = require('../sellerVerification');

// Montado em /api/market/verification
const router = express.Router();
router.use(requireAuth);

function notify(req, userId, event, payload) {
  req.app.get('io')?.to(`user:${userId}`).emit(event, payload);
}

function lockedError(res) {
  return res.status(409).json({ error: 'Sua verificação já foi enviada. Espere a análise para mudar alguma coisa.' });
}

// Listas pra montar os formulários
router.get('/options', (req, res) => {
  res.json({
    banks: br.BANKS,
    ufs: br.UFS,
    pixTypes: br.PIX_TYPES,
    docTypes: Object.entries(kyc.DOC_TYPES).map(([id, d]) => ({ id, ...d })),
    categories: kyc.STORE_CATEGORIES,
    sections: kyc.SECTIONS.map((id) => ({ id, label: kyc.SECTION_LABELS[id] })),
  });
});

router.get('/', (req, res) => {
  res.json({ verification: kyc.ownerView(req.user.id) });
});

// Seus dados: pessoa física/jurídica, dados pessoais, empresa, endereço
router.put('/personal', (req, res) => {
  const row = kyc.getRow(req.user.id);
  if (!kyc.isEditable(row)) return lockedError(res);
  const result = kyc.validatePersonal(req.body || {});
  if (result.error) return res.status(400).json(result);
  const current = kyc.readData(row);
  const patch = { personal: result.personal, business: result.business, address: result.address };
  // Mudou o CPF/CNPJ? A conta bancária cadastrada antes pode não bater mais — pede de novo
  const docChanged = current.personal && (current.personal.cpf !== result.personal.cpf
    || (current.business?.cnpj || null) !== (result.business?.cnpj || null));
  if (docChanged) { patch.bank = null; patch.pix = null; }
  kyc.saveData(req.user.id, patch, {
    person_type: result.person_type,
    cpf_hash: kyc.blindIndex(result.personal.cpf),
    cnpj_hash: result.business ? kyc.blindIndex(result.business.cnpj) : null,
  });
  res.json({ verification: kyc.ownerView(req.user.id), bankCleared: Boolean(docChanged && current.bank) });
});

// Tipo de documento + fotos (frente/verso)
router.put('/document', (req, res) => {
  const row = kyc.getRow(req.user.id);
  if (!kyc.isEditable(row)) return lockedError(res);
  const type = String(req.body?.doc_type || '');
  if (!kyc.DOC_TYPES[type]) return res.status(400).json({ error: 'Escolha o tipo de documento' });
  kyc.ensureRow(req.user.id);
  const files = kyc.readFiles(kyc.getRow(req.user.id));
  // Documento que não tem verso: apaga um verso enviado antes
  if (!kyc.DOC_TYPES[type].needsBack && files.doc_back) { kyc.removeKycFile(files.doc_back); delete files.doc_back; }
  kyc.setFiles(req.user.id, files, { doc_type: type });
  res.json({ verification: kyc.ownerView(req.user.id) });
});

router.post('/document/:side', upload.single('image'), async (req, res) => {
  const side = req.params.side === 'back' ? 'doc_back' : req.params.side === 'front' ? 'doc_front' : null;
  if (!side) return res.status(400).json({ error: 'Lado inválido' });
  const row = kyc.getRow(req.user.id);
  if (!kyc.isEditable(row)) return lockedError(res);
  if (!row?.doc_type) return res.status(400).json({ error: 'Escolha o tipo de documento primeiro' });
  if (!req.file) return res.status(400).json({ error: 'Envie a foto do documento' });
  try {
    const meta = await require('sharp')(req.file.buffer).metadata();
    if (Math.min(meta.width || 0, meta.height || 0) < 400) {
      return res.status(400).json({ error: 'Foto muito pequena — tire de perto, com o documento inteiro e legível' });
    }
    const saved = await kyc.saveKycImage(req.file.buffer);
    const files = kyc.readFiles(kyc.getRow(req.user.id));
    kyc.removeKycFile(files[side]);
    files[side] = saved.file;
    files[`${side}_sha`] = saved.sha;
    kyc.setFiles(req.user.id, files);
    res.json({ verification: kyc.ownerView(req.user.id) });
  } catch {
    res.status(400).json({ error: 'Não consegui ler essa imagem. Tente outra foto.' });
  }
});

// ─── prova de vida ──────────────────────────────────────────────────────────
// O servidor sorteia a sequência de gestos na hora; o app filma e manda uma foto por gesto.
// Sem sequência sorteada não tem como reaproveitar fotos/vídeo antigos.
router.post('/liveness/start', (req, res) => {
  const row = kyc.getRow(req.user.id);
  if (!kyc.isEditable(row)) return lockedError(res);
  const pool = ['esquerda', 'direita', 'sorriso', 'cima'];
  for (let i = pool.length - 1; i > 0; i -= 1) { const j = crypto.randomInt(i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const middle = pool.slice(0, 2);
  const steps = ['frente', ...middle, 'documento'];
  const id = uuidv4();
  // descarta desafios antigos não terminados
  const old = db.prepare('SELECT * FROM liveness_challenges WHERE user_id = ? AND completed_at IS NULL').all(req.user.id);
  for (const c of old) for (const f of JSON.parse(c.frames)) kyc.removeKycFile(f.file);
  db.prepare('DELETE FROM liveness_challenges WHERE user_id = ? AND completed_at IS NULL').run(req.user.id);
  db.prepare('INSERT INTO liveness_challenges (id, user_id, steps, created_at) VALUES (?, ?, ?, ?)')
    .run(id, req.user.id, JSON.stringify(steps), Date.now());
  res.json({
    challengeId: id,
    expiresInSec: Math.round(kyc.LIVENESS_TTL_MS / 1000),
    steps: steps.map((s) => ({ id: s, label: kyc.LIVENESS_STEPS[s] })),
  });
});

router.post('/liveness/:id/frame', upload.single('image'), async (req, res) => {
  const challenge = db.prepare('SELECT * FROM liveness_challenges WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!challenge || challenge.completed_at) return res.status(404).json({ error: 'Desafio não encontrado — comece de novo' });
  if (Date.now() - challenge.created_at > kyc.LIVENESS_TTL_MS) return res.status(410).json({ error: 'O tempo acabou — comece de novo' });
  if (!kyc.isEditable(kyc.getRow(req.user.id))) return lockedError(res);
  if (!req.file) return res.status(400).json({ error: 'Foto não recebida' });

  const steps = JSON.parse(challenge.steps);
  const frames = JSON.parse(challenge.frames);
  const index = Number(req.body?.index);
  if (index !== frames.length) return res.status(409).json({ error: 'Foto fora de ordem — comece de novo', expected: frames.length });
  if (index >= steps.length) return res.status(409).json({ error: 'Desafio já tem todas as fotos' });

  let saved;
  try {
    saved = await kyc.saveKycImage(req.file.buffer, { maxSide: 1100 });
  } catch {
    return res.status(400).json({ error: 'Não consegui ler a imagem da câmera' });
  }
  if (frames.some((f) => f.sha === saved.sha)) {
    kyc.removeKycFile(saved.file);
    return res.status(400).json({ error: 'A câmera parece travada (foto igual à anterior). Tente de novo.' });
  }
  frames.push({ step: steps[index], file: saved.file, sha: saved.sha, at: Date.now() });

  const done = frames.length === steps.length;
  db.prepare('UPDATE liveness_challenges SET frames = ?, completed_at = ? WHERE id = ?')
    .run(JSON.stringify(frames), done ? Date.now() : null, challenge.id);

  if (done) {
    kyc.ensureRow(req.user.id);
    const files = kyc.readFiles(kyc.getRow(req.user.id));
    for (const f of files.liveness || []) kyc.removeKycFile(f.file); // troca a prova de vida anterior
    files.liveness = frames;
    files.selfie = frames[0].file;
    kyc.setFiles(req.user.id, files, { liveness_at: Date.now() });
    db.prepare('DELETE FROM liveness_challenges WHERE id = ?').run(challenge.id);
  }
  res.json({ received: index, done, verification: done ? kyc.ownerView(req.user.id) : undefined });
});

// Conta bancária + Pix (no nome de quem vende)
router.put('/bank', (req, res) => {
  const row = kyc.getRow(req.user.id);
  if (!kyc.isEditable(row)) return lockedError(res);
  const result = kyc.validateBank(req.body || {}, kyc.readData(row), row?.person_type);
  if (result.error) return res.status(400).json(result);
  kyc.saveData(req.user.id, { bank: result.bank, pix: result.pix });
  res.json({ verification: kyc.ownerView(req.user.id) });
});

// Envia tudo pra análise
router.post('/submit', (req, res) => {
  const row = kyc.getRow(req.user.id);
  if (!row) return res.status(400).json({ error: 'Preencha a verificação primeiro' });
  if (!kyc.isEditable(row)) return lockedError(res);
  const store = db.prepare('SELECT id FROM stores WHERE owner_id = ?').get(req.user.id);
  const done = kyc.sectionsDone(row, store);
  const missing = kyc.SECTIONS.filter((s) => !done[s]);
  if (missing.length) {
    return res.status(400).json({ error: `Falta completar: ${missing.map((s) => kyc.SECTION_LABELS[s]).join(', ')}`, missing });
  }
  if (req.body?.accept_terms !== true) {
    return res.status(400).json({ error: 'Aceite os termos de vendedor para enviar' });
  }
  // Um CPF/CNPJ = uma loja
  const dup = db.prepare(
    "SELECT 1 FROM seller_verifications WHERE user_id != ? AND status IN ('pending','approved') AND (cpf_hash = ? OR (cnpj_hash IS NOT NULL AND cnpj_hash = ?))"
  ).get(req.user.id, row.cpf_hash, row.cnpj_hash);
  if (dup) return res.status(409).json({ error: 'Esse CPF/CNPJ já está ligado a outra loja no SafeCord' });

  db.prepare(`UPDATE seller_verifications SET status = 'pending', submitted_at = ?, terms_accepted_at = ?,
    reject_reason = NULL, reject_sections = '[]', updated_at = ? WHERE user_id = ?`).run(Date.now(), Date.now(), Date.now(), req.user.id);
  kyc.log(req.user.id, 'submitted', req.user.id);
  res.json({ verification: kyc.ownerView(req.user.id) });
});

// ─── admin ──────────────────────────────────────────────────────────────────
router.get('/admin/list', requireAdmin, (req, res) => {
  const status = ['pending', 'approved', 'rejected', 'draft'].includes(req.query.status) ? req.query.status : 'pending';
  const rows = db.prepare(
    `SELECT * FROM seller_verifications WHERE status = ? ORDER BY ${status === 'pending' ? 'submitted_at ASC' : 'updated_at DESC'} LIMIT 100`
  ).all(status);
  const counts = Object.fromEntries(
    db.prepare('SELECT status, COUNT(*) AS n FROM seller_verifications GROUP BY status').all().map((r) => [r.status, r.n])
  );
  res.json({ verifications: rows.map(kyc.adminSummary), counts });
});

router.get('/admin/:userId', requireAdmin, (req, res) => {
  const detail = kyc.adminDetail(req.params.userId);
  if (!detail) return res.status(404).json({ error: 'Verificação não encontrada' });
  res.json({ verification: detail });
});

router.get('/admin/:userId/file/:key', requireAdmin, (req, res) => {
  let buf;
  try { buf = kyc.fileForAdmin(req.params.userId, req.params.key); } catch { buf = null; }
  if (!buf) return res.status(404).json({ error: 'Arquivo não encontrado' });
  res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store, private', 'X-Content-Type-Options': 'nosniff' });
  res.send(buf);
});

router.post('/admin/:userId/approve', requireAdmin, (req, res) => {
  const row = kyc.getRow(req.params.userId);
  if (!row) return res.status(404).json({ error: 'Verificação não encontrada' });
  if (row.status !== 'pending') return res.status(409).json({ error: 'Só dá pra aprovar o que está em análise' });
  db.transaction(() => {
    db.prepare(`UPDATE seller_verifications SET status = 'approved', reviewed_at = ?, reviewed_by = ?, reject_reason = NULL,
      reject_sections = '[]', updated_at = ? WHERE user_id = ?`).run(Date.now(), req.user.id, Date.now(), row.user_id);
    db.prepare("UPDATE stores SET status = 'active' WHERE owner_id = ? AND status = 'pending'").run(row.user_id);
  })();
  kyc.log(row.user_id, 'approved', req.user.id, req.body?.note);
  notify(req, row.user_id, 'market:verification', { status: 'approved' });
  res.json({ verification: kyc.adminDetail(row.user_id) });
});

router.post('/admin/:userId/reject', requireAdmin, (req, res) => {
  const row = kyc.getRow(req.params.userId);
  if (!row) return res.status(404).json({ error: 'Verificação não encontrada' });
  if (row.status !== 'pending') return res.status(409).json({ error: 'Só dá pra recusar o que está em análise' });
  const reason = String(req.body?.reason || '').trim().slice(0, 500);
  if (reason.length < 5) return res.status(400).json({ error: 'Explique o motivo pro vendedor saber o que corrigir' });
  const sections = (Array.isArray(req.body?.sections) ? req.body.sections : []).filter((s) => kyc.SECTIONS.includes(s));
  db.prepare(`UPDATE seller_verifications SET status = 'rejected', reviewed_at = ?, reviewed_by = ?, reject_reason = ?,
    reject_sections = ?, updated_at = ? WHERE user_id = ?`).run(Date.now(), req.user.id, reason, JSON.stringify(sections), Date.now(), row.user_id);
  // Se a prova de vida foi o problema, ela precisa ser feita de novo
  if (sections.includes('rosto')) db.prepare('UPDATE seller_verifications SET liveness_at = NULL WHERE user_id = ?').run(row.user_id);
  // Documento recusado: pede fotos novas
  if (sections.includes('documento')) {
    const files = kyc.readFiles(kyc.getRow(row.user_id));
    kyc.removeKycFile(files.doc_front); kyc.removeKycFile(files.doc_back);
    delete files.doc_front; delete files.doc_back; delete files.doc_front_sha; delete files.doc_back_sha;
    kyc.setFiles(row.user_id, files);
  }
  kyc.log(row.user_id, 'rejected', req.user.id, reason);
  notify(req, row.user_id, 'market:verification', { status: 'rejected' });
  res.json({ verification: kyc.adminDetail(row.user_id) });
});

module.exports = router;
