// Verificação de vendedores (KYC). Servidor com: MARKET_DEV_PAYMENTS=1 ADMIN_EMAILS=admin@t.com, banco zerado.
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { randomCPF, photo, form, personalFor, bankFor, doLiveness } = require('./helpers/kyc');
const B = 'http://localhost:4000/api';
let n = 0, fails = 0;
const ok = (c, l) => { n++; console.log(`${n}) ${l}: ${c ? 'OK' : 'FALHOU'}`); if (!c) fails++; };
const req = async (m, p, body, t, raw) => {
  const r = await fetch(B + p, { method: m, headers: { ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined });
  if (raw) return r;
  let d = {}; try { d = await r.json(); } catch {} return { s: r.status, d };
};
const rnd = () => Math.random().toString(36).slice(2, 7);
async function user(name, email) {
  const r = await req('POST', '/auth/register', { username: name + rnd(), password: 'senha123', email: email || `${name}${rnd()}@t.com` });
  await req('POST', '/auth/verify-email', { code: r.d.verification?.devCode }, r.d.token);
  return { token: r.d.token, id: r.d.user.id };
}
const V = '/market/verification';
const addr = { name: 'Bia', cep: '01310100', street: 'Rua A', number: '1', district: 'Centro', city: 'São Paulo', state: 'SP' };

(async () => {
  const seller = await user('vend'), buyer = await user('comp'), admin = await user('adm', 'admin@t.com'), clone = await user('clone');
  const T = seller.token;

  // ── loja nova fica escondida
  ok((await req('POST', '/market/my-store', { name: 'Ateliê Bia', description: 'curta', category: 'Artesanato' }, T)).s === 400, 'descrição curta demais é recusada');
  ok((await req('POST', '/market/my-store', { name: 'Ateliê Bia', description: 'Peças de crochê feitas à mão', category: 'Inventada' }, T)).s === 400, 'categoria inválida é recusada');
  const st = await req('POST', '/market/my-store', { name: 'Ateliê Bia', description: 'Peças de crochê feitas à mão', category: 'Artesanato', contact_phone: '(11) 98888-7777' }, T);
  ok(st.s === 201 && st.d.store.status === 'pending' && st.d.store.verified === false, 'loja nova nasce escondida (pending) e não verificada');
  const prod = (await req('POST', '/market/products', { title: 'Bolsa de crochê', type: 'physical', price_cents: 8000, stock: 3 }, T)).d.product;
  ok(Boolean(prod), 'dá pra cadastrar produto enquanto espera');
  ok((await req('GET', '/market/products', null, buyer.token)).d.products.length === 0, 'produto de loja não verificada não aparece na vitrine');
  ok((await req('POST', '/market/checkout', { productId: prod.id, address: addr }, buyer.token)).s === 404, 'ninguém compra de loja não verificada');

  // ── dados pessoais
  const cpf = randomCPF();
  const bad = (patch) => req('PUT', `${V}/personal`, { ...personalFor(cpf), ...patch }, T);
  ok((await bad({ personal: { ...personalFor(cpf).personal, cpf: '111.111.111-11' } })).s === 400, 'CPF inválido recusado');
  const minor = await bad({ personal: { ...personalFor(cpf).personal, birth_date: `${new Date().getFullYear() - 16}-01-01` } });
  ok(minor.s === 400 && /18 anos/.test(minor.d.error), 'menor de 18 anos recusado');
  ok((await bad({ personal: { ...personalFor(cpf).personal, full_name: 'Ana' } })).s === 400, 'nome sem sobrenome recusado');
  ok((await bad({ person_type: 'pj', business: { cnpj: '11.111.111/1111-11', company_name: 'Bia LTDA' } })).s === 400, 'CNPJ inválido recusado');
  ok((await bad({ address: { ...personalFor(cpf).address, state: 'XX' } })).s === 400, 'UF inválida recusada');
  const pj = await bad({ person_type: 'pj', business: { cnpj: '11.222.333/0001-81', company_name: 'Bia Artesanato LTDA' } });
  ok(pj.s === 200 && pj.d.verification.person_type === 'pj' && pj.d.verification.sections.dados, 'PJ com CNPJ válido aceito');
  const pf = await req('PUT', `${V}/personal`, personalFor(cpf, 'Beatriz Lima Rocha'), T);
  ok(pf.s === 200 && pf.d.verification.data.personal.cpf === cpf, 'PF salva; enquanto é rascunho o dono vê os próprios dados');

  // ── documento
  ok((await req('POST', `${V}/document/front`, form(await photo()), T)).s === 400, 'foto sem escolher o tipo é recusada');
  await req('PUT', `${V}/document`, { doc_type: 'rg' }, T);
  ok((await req('POST', `${V}/document/front`, form(await photo(200, 150)), T)).s === 400, 'foto pequena demais recusada');
  let v = (await req('POST', `${V}/document/front`, form(await photo()), T)).d.verification;
  ok(v.files.doc_front && !v.sections.documento, 'RG só com a frente ainda não completa');
  v = (await req('POST', `${V}/document/back`, form(await photo()), T)).d.verification;
  ok(v.sections.documento, 'RG com frente e verso completo');

  // ── prova de vida
  const start = await req('POST', `${V}/liveness/start`, null, T);
  const steps = start.d.steps.map((s) => s.id);
  ok(steps.length === 4 && steps[0] === 'frente' && steps[3] === 'documento' && new Set(steps).size === 4, 'desafio sorteado: frente, 2 gestos, documento');
  ok((await req('POST', `${V}/liveness/${start.d.challengeId}/frame`, form(await photo(640, 480), { index: 1 }), T)).s === 409, 'foto fora de ordem recusada');
  const f0 = await photo(640, 480);
  await req('POST', `${V}/liveness/${start.d.challengeId}/frame`, form(f0, { index: 0 }), T);
  ok((await req('POST', `${V}/liveness/${start.d.challengeId}/frame`, form(f0, { index: 1 }), T)).s === 400, 'câmera "travada" (foto repetida) recusada');
  ok((await req('POST', `${V}/liveness/${start.d.challengeId}/frame`, form(await photo(640, 480), { index: 0 }), buyer.token)).s === 404, 'outra pessoa não usa meu desafio');
  for (let i = 1; i < 4; i += 1) v = (await req('POST', `${V}/liveness/${start.d.challengeId}/frame`, form(await photo(640, 480), { index: i }), T)).d;
  ok(v.done && v.verification.sections.rosto && v.verification.files.liveness_frames === 4, 'prova de vida completa (4 fotos)');

  // ── banco
  const other = randomCPF();
  ok((await req('PUT', `${V}/bank`, { ...bankFor(cpf, 'Beatriz Lima Rocha'), bank: { ...bankFor(other).bank, holder_name: 'Outra Pessoa' } }, T)).s === 400, 'conta no CPF de outra pessoa recusada');
  ok((await req('PUT', `${V}/bank`, { ...bankFor(cpf, 'Beatriz Lima Rocha'), pix: { type: 'cpf', key: other } }, T)).s === 400, 'Pix CPF de outra pessoa recusado');
  ok((await req('PUT', `${V}/bank`, { ...bankFor(cpf, 'Beatriz Lima Rocha'), pix: { type: 'email', key: 'nao-é-email' } }, T)).s === 400, 'chave Pix inválida recusada');
  ok((await req('PUT', `${V}/bank`, { ...bankFor(cpf, 'Beatriz Lima Rocha'), bank: { ...bankFor(cpf).bank, account_digit: '' } }, T)).s === 400, 'conta sem dígito recusada');
  v = (await req('PUT', `${V}/bank`, { ...bankFor(cpf, 'Beatriz Lima Rocha'), pix: { type: 'phone', key: '(11) 98888-7777' } }, T)).d.verification;
  ok(v.sections.banco && v.data.pix.key === '+5511988887777' && v.data.bank.bank_name === 'Nubank', 'conta e Pix salvos (telefone normalizado, banco pelo código)');

  // ── envio
  ok((await req('POST', `${V}/submit`, {}, T)).s === 400, 'sem aceitar os termos não envia');
  const sub = await req('POST', `${V}/submit`, { accept_terms: true }, T);
  ok(sub.s === 200 && sub.d.verification.status === 'pending' && !sub.d.verification.editable, 'enviado pra análise');
  ok(!JSON.stringify(sub.d).includes(cpf) && sub.d.verification.data.personal.cpf.startsWith('***'), 'depois de enviado, o CPF volta mascarado');
  ok((await req('PUT', `${V}/bank`, bankFor(cpf), T)).s === 409, 'não dá pra editar em análise');

  // ── criptografia em repouso
  const db = new Database(path.join(__dirname, '..', 'safecord.db'), { readonly: true });
  const row = db.prepare('SELECT * FROM seller_verifications WHERE user_id = ?').get(seller.id);
  ok(row.data_enc && !row.data_enc.includes(cpf) && !Buffer.from(row.data_enc, 'base64').toString('latin1').includes(cpf), 'CPF não fica aberto no banco');
  const files = JSON.parse(row.files);
  const raw = fs.readFileSync(path.join(__dirname, '..', 'private-files', 'kyc', files.doc_front));
  ok(raw[0] !== 0xff || raw[1] !== 0xd8, 'foto do documento fica criptografada no disco');
  db.close();

  // ── outra conta com o mesmo CPF
  await req('POST', '/market/my-store', { name: 'Clone', description: 'Tentando usar CPF dos outros', category: 'Outros' }, clone.token);
  await req('PUT', `${V}/personal`, personalFor(cpf, 'Beatriz Lima Rocha'), clone.token);
  await req('PUT', `${V}/document`, { doc_type: 'cnh' }, clone.token);
  await req('POST', `${V}/document/front`, form(await photo()), clone.token);
  await doLiveness(req, clone.token);
  await req('PUT', `${V}/bank`, bankFor(cpf, 'Beatriz Lima Rocha'), clone.token);
  const dup = await req('POST', `${V}/submit`, { accept_terms: true }, clone.token);
  ok(dup.s === 409 && /outra loja/.test(dup.d.error), 'mesmo CPF não abre segunda loja');

  // ── admin
  ok((await req('GET', `${V}/admin/list`, null, buyer.token)).s === 403, 'quem não é admin não vê a fila');
  ok((await req('GET', `${V}/admin/${seller.id}/file/doc_front`, null, buyer.token)).s === 403, 'quem não é admin não baixa documento');
  const list = await req('GET', `${V}/admin/list`, null, admin.token);
  ok(list.d.verifications.some((x) => x.user_id === seller.id) && list.d.counts.pending === 1, 'admin vê a verificação na fila');
  const det = (await req('GET', `${V}/admin/${seller.id}`, null, admin.token)).d.verification;
  ok(det.data.personal.cpf === cpf && det.files.length === 6 && det.data.bank.account === '1234567', 'admin vê dados completos e 6 fotos (frente, verso, 4 da prova de vida)');
  ok(det.flags.some((f) => /outra/.test(f.text)), 'admin é avisado do CPF repetido em outra conta');
  const img = await req('GET', `${V}/admin/${seller.id}/file/liveness-3`, null, admin.token, true);
  const imgBuf = Buffer.from(await img.arrayBuffer());
  ok(img.status === 200 && img.headers.get('content-type') === 'image/jpeg' && imgBuf[0] === 0xff && imgBuf[1] === 0xd8 && /no-store/.test(img.headers.get('cache-control')), 'admin abre a foto (descriptografada, sem cache)');

  // recusa
  ok((await req('POST', `${V}/admin/${seller.id}/reject`, { reason: '' }, admin.token)).s === 400, 'recusar exige motivo');
  const rej = await req('POST', `${V}/admin/${seller.id}/reject`, { reason: 'A foto do documento está desfocada', sections: ['documento'] }, admin.token);
  ok(rej.s === 200, 'admin recusa');
  v = (await req('GET', V, null, T)).d.verification;
  ok(v.status === 'rejected' && v.editable && v.reject_reason.includes('desfocada') && v.reject_sections[0] === 'documento' && !v.sections.documento, 'vendedor vê o motivo e precisa mandar o documento de novo');
  ok((await req('GET', '/market/my-store', null, T)).d.store.status === 'pending', 'loja continua escondida');
  ok((await req('POST', `${V}/submit`, { accept_terms: true }, T)).s === 400, 'sem documento novo não reenvia');
  await req('POST', `${V}/document/front`, form(await photo()), T);
  await req('POST', `${V}/document/back`, form(await photo()), T);
  ok((await req('POST', `${V}/submit`, { accept_terms: true }, T)).d.verification?.status === 'pending', 'reenviado depois de corrigir');

  // admin não "fura" a verificação reativando
  const ov = (await req('GET', '/market/admin/overview', null, admin.token)).d.stores.find((s) => s.owner?.id === seller.id);
  ok(ov && ov.can_receive === false && ov.verification_status === 'pending', 'painel de repasses: loja ainda não pode receber');
  const forced = await req('PUT', `/market/admin/stores/${ov.id}/status`, { status: 'active' }, admin.token);
  ok(forced.d.status === 'pending', 'reativar loja não verificada não coloca na vitrine');

  // aprova
  const ap = await req('POST', `${V}/admin/${seller.id}/approve`, {}, admin.token);
  ok(ap.s === 200 && ap.d.verification.status === 'approved', 'admin aprova');
  const my = (await req('GET', '/market/my-store', null, T)).d;
  ok(my.store.status === 'active' && my.store.verified && my.verification.status === 'approved', 'loja aparece e fica marcada como verificada');
  ok((await req('GET', '/market/products', null, buyer.token)).d.products.length === 1, 'produto entra na vitrine');
  const co = await req('POST', '/market/checkout', { productId: prod.id, address: addr }, buyer.token);
  ok(co.s === 200, 'agora dá pra comprar');
  const ov2 = (await req('GET', '/market/admin/overview', null, admin.token)).d.stores.find((s) => s.owner?.id === seller.id);
  ok(ov2.can_receive && ov2.payout.pix.key === '+5511988887777' && ov2.payout.bank.holder_name === 'Beatriz Lima Rocha', 'admin vê Pix e conta pra fazer o repasse');
  ok(!JSON.stringify((await req('GET', `/market/stores/${ov.id}`, null, buyer.token)).d).includes(cpf), 'página pública da loja não vaza nada do vendedor');
  ok((await req('POST', `${V}/admin/${seller.id}/approve`, {}, admin.token)).s === 409, 'não aprova duas vezes');
  const log = (await req('GET', `${V}/admin/${seller.id}`, null, admin.token)).d.verification.log.map((l) => l.action);
  ok(log.join(',') === 'approved,submitted,rejected,submitted', 'histórico registra envio, recusa e aprovação');

  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
})();
