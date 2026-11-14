// Ajudante dos testes: abre uma loja e passa o vendedor pela verificação completa (aprovada pelo admin).
const sharp = require('sharp');

function randomCPF() {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
  const calc = (arr) => { const len = arr.length; const s = arr.reduce((a, n, i) => a + n * (len + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  d.push(calc(d)); d.push(calc(d));
  return d.join('');
}

async function photo(w = 900, h = 600) {
  const c = () => Math.floor(Math.random() * 256);
  const noise = Buffer.alloc(w * h * 3);
  for (let i = 0; i < noise.length; i += 1) noise[i] = c();
  return sharp(noise, { raw: { width: w, height: h, channels: 3 } }).jpeg({ quality: 70 }).toBuffer();
}

function form(buf, extra = {}) {
  const fd = new FormData();
  fd.append('image', new Blob([buf], { type: 'image/jpeg' }), 'foto.jpg');
  for (const [k, v] of Object.entries(extra)) fd.append(k, String(v));
  return fd;
}

const personalFor = (cpf, name = 'Ana Maria Souza') => ({
  person_type: 'pf',
  personal: { full_name: name, cpf, birth_date: '1995-04-20', phone: '11987654321' },
  address: { cep: '01310-100', street: 'Av. Paulista', number: '1000', district: 'Bela Vista', city: 'São Paulo', state: 'SP' },
});
const bankFor = (cpf, name = 'Ana Maria Souza') => ({
  bank: { bank_code: '260', agency: '0001', account: '1234567', account_digit: '8', account_type: 'pagamento', holder_name: name, holder_document: cpf },
  pix: { type: 'cpf', key: cpf },
});

async function doLiveness(req, token) {
  const start = await req('POST', '/market/verification/liveness/start', null, token);
  let last;
  for (let i = 0; i < start.d.steps.length; i += 1) {
    last = await req('POST', `/market/verification/liveness/${start.d.challengeId}/frame`, form(await photo(640, 480), { index: i }), token);
  }
  return { start, last };
}

/** Faz tudo: loja → dados → documento → prova de vida → banco → envia → admin aprova. */
async function openVerifiedStore(req, token, adminToken, storeBody = {}, { approve = true } = {}) {
  const store = await req('POST', '/market/my-store', {
    name: 'Loja Teste', description: 'Uma loja de teste com produtos legais', category: 'Artesanato', ...storeBody,
  }, token);
  const cpf = randomCPF();
  await req('PUT', '/market/verification/personal', personalFor(cpf), token);
  await req('PUT', '/market/verification/document', { doc_type: 'cnh' }, token);
  await req('POST', '/market/verification/document/front', form(await photo()), token);
  await doLiveness(req, token);
  await req('PUT', '/market/verification/bank', bankFor(cpf), token);
  const sub = await req('POST', '/market/verification/submit', { accept_terms: true }, token);
  const me = await req('GET', '/auth/me', null, token);
  const userId = (me.d.user || me.d).id;
  if (approve) await req('POST', `/market/verification/admin/${userId}/approve`, {}, adminToken);
  return { store, cpf, userId, submitted: sub };
}

module.exports = { randomCPF, photo, form, personalFor, bankFor, doLiveness, openVerifiedStore };
