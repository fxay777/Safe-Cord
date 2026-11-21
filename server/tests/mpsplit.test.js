// Pagamento direto (split) com a conta Mercado Pago do vendedor. Rode com o MP falso e:
// ADMIN_EMAILS=admin@t.com MERCADOPAGO_ACCESS_TOKEN=TEST-123 MERCADOPAGO_API_URL=http://localhost:4999
// MERCADOPAGO_CLIENT_ID=CID-1 MERCADOPAGO_CLIENT_SECRET=CSECRET-1 MERCADOPAGO_AUTH_URL=http://localhost:4999/auth
const Database = require('better-sqlite3');
const path = require('path');
const { openVerifiedStore, randomCPF } = require('./helpers/kyc');
const B = 'http://localhost:4000/api';
const FAKE = 'http://localhost:4999';
let n = 0, fails = 0;
const ok = (c, l) => { n++; console.log(`${n}) ${l}: ${c ? 'OK' : 'FALHOU'}`); if (!c) fails++; };
const req = async (m, p, body, t, raw) => {
  const isForm = body instanceof FormData;
  const r = await fetch(p.startsWith('http') ? p : B + p, { method: m, headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  if (raw) return r;
  let d = {}; try { d = await r.json(); } catch {} return { s: r.status, d };
};
const rnd = () => Math.random().toString(36).slice(2, 7);
async function user(name, email) {
  const r = await req('POST', '/auth/register', { username: name + rnd(), password: 'senha123', email: email || `${name}${rnd()}@t.com` });
  await req('POST', '/auth/verify-email', { code: r.d.verification?.devCode }, r.d.token);
  return { token: r.d.token, id: r.d.user.id };
}
const addr = { name: 'Comprador', cep: '01310100', street: 'Rua A', number: '1', district: 'Centro', city: 'São Paulo', state: 'SP' };
const fake = (p, body) => req(body ? 'POST' : 'GET', `${FAKE}${p}`, body);
async function authorize(t, identification) {
  const { d } = await req('POST', '/market/mp/connect', null, t);
  const u = new URL(d.url);
  const { d: c } = await fake('/__code', { challenge: u.searchParams.get('code_challenge'), identification, ...(identification?.expiresIn ? { expiresIn: identification.expiresIn } : {}) });
  return { u, code: c.code, state: u.searchParams.get('state') };
}

(async () => {
  const admin = await user('adm', 'admin@t.com'), seller = await user('vend'), buyer = await user('comp'), other = await user('outro');
  // antes de verificar não conecta
  ok((await req('POST', '/market/mp/connect', null, seller.token)).s === 403, 'vendedor não verificado não conecta o Mercado Pago');
  const { cpf, store } = await openVerifiedStore(req, seller.token, admin.token, { name: 'Loja Split' });
  const storeId = store.d.store.id;
  const st0 = (await req('GET', '/market/mp/status', null, seller.token)).d;
  ok(st0.available === true && st0.connected === false, 'status: disponível e ainda não conectado');

  // ── link de autorização
  const { u, code, state } = await authorize(seller.token, { type: 'CPF', number: cpf });
  ok(u.origin + u.pathname === `${FAKE}/auth/authorization` && u.searchParams.get('client_id') === 'CID-1' && u.searchParams.get('code_challenge_method') === 'S256'
    && u.searchParams.get('redirect_uri').endsWith('/api/payments/mercadopago/oauth/callback'), 'link de autorização com client_id, PKCE e redirect certo');

  const cb = (q) => req('GET', `/payments/mercadopago/oauth/callback?${new URLSearchParams(q)}`, null, null, true);
  ok((await cb({ code, state: 'state-falso' })).status === 400, 'state inventado é recusado');
  const good = await cb({ code, state });
  ok(good.status === 200 && (await good.text()).includes('Conta conectada'), 'volta do Mercado Pago conecta a conta');
  ok((await cb({ code, state })).status === 400, 'o mesmo link não serve duas vezes');
  const st1 = (await req('GET', '/market/mp/status', null, seller.token)).d;
  ok(st1.connected && /^VENDEDOR/.test(st1.nickname), 'status: conectado, com o apelido da conta');

  const db = new Database(path.join(__dirname, '..', 'safecord.db'), { readonly: true });
  const acc = db.prepare('SELECT tokens_enc FROM seller_mp_accounts WHERE user_id = ?').get(seller.id);
  ok(acc && !acc.tokens_enc.includes('APP_USR'), 'token do vendedor fica criptografado no banco');

  // conta MP em outro CPF é barrada
  const { store: { d: otherStore } } = await openVerifiedStore(req, other.token, admin.token, { name: 'Loja Outro' });
  const o = await authorize(other.token, { type: 'CPF', number: randomCPF() });
  const bad = await cb({ code: o.code, state: o.state });
  ok(bad.status === 400 && (await bad.text()).includes('outro CPF'), 'conta do Mercado Pago em CPF de outra pessoa é recusada');
  ok(!(await req('GET', '/market/mp/status', null, other.token)).d.connected, '...e não fica conectada');

  // ── venda com split
  const prod = (await req('POST', '/market/products', { title: 'Caneca', type: 'physical', price_cents: 10000, shipping_cents: 1500, stock: 5 }, seller.token)).d.product;
  const co = await req('POST', '/market/checkout', { productId: prod.id, address: addr }, buyer.token);
  ok(co.s === 200 && co.d.checkoutUrl, 'checkout criado');
  const pref = (await fake('/__prefs')).d.at(-1);
  ok(pref.owner !== 'platform' && pref.marketplace_fee === 10 && pref.external_reference === co.d.orderId, 'cobrança na conta do VENDEDOR com taxa do SafeCord (R$10 = 10% do produto, sem frete)');

  // webhook com pagamento na conta errada / valor menor é ignorado
  const sellerMpId = String(st1.mp_user_id);
  const wrong = (await fake('/__pay', { reference: co.d.orderId, status: 'approved', owner: 'platform', amount: 115 })).d;
  await req('POST', `/payments/mercadopago/webhook?type=payment&data.id=${wrong.id}&s=${storeId}`, {});
  const cheap = (await fake('/__pay', { reference: co.d.orderId, status: 'approved', owner: sellerMpId, amount: 1 })).d;
  await req('POST', `/payments/mercadopago/webhook?type=payment&data.id=${cheap.id}&s=${storeId}`, {});
  const otherStoreTag = await req('POST', `/payments/mercadopago/webhook?type=payment&data.id=${cheap.id}&s=${otherStore.store.id}`, {});
  let ord = db.prepare('SELECT status, split FROM orders WHERE id = ?').get(co.d.orderId);
  ok(ord.split === 1 && ord.status === 'pending', 'pagamento de outra conta, valor menor ou loja trocada NÃO libera o pedido');

  const pay = (await fake('/__pay', { reference: co.d.orderId, status: 'approved', owner: sellerMpId, amount: 115 })).d;
  const wh = await req('POST', `/payments/mercadopago/webhook?type=payment&data.id=${pay.id}&s=${storeId}`, {});
  ord = db.prepare('SELECT status FROM orders WHERE id = ?').get(co.d.orderId);
  ok(wh.s === 200 && ord.status === 'paid', 'webhook consulta a conta do vendedor e libera o pedido');

  const sum = (await req('GET', '/market/my-store', null, seller.token)).d.summary;
  ok(sum.direct_cents === 10500 && sum.available_cents === 0 && sum.pending_cents === 0, 'vendedor: R$105 recebidos direto, nada "a repassar"');
  const ov = (await req('GET', '/market/admin/overview', null, admin.token)).d;
  const row = ov.stores.find((s) => s.id === storeId);
  ok(ov.totals.to_pay_cents === 0 && ov.totals.fee_cents === 1000 && row.mercadopago.connected, 'admin: nada pra repassar, taxa de R$10 contabilizada');
  ok((await req('POST', '/market/admin/payouts', { storeId }, admin.token)).s >= 400, 'não dá pra registrar repasse manual de venda direta');

  // confirmação pela volta do checkout também usa a conta do vendedor
  const co2 = await req('POST', '/market/checkout', { productId: prod.id, address: addr }, buyer.token);
  await fake('/__pay', { reference: co2.d.orderId, status: 'approved', owner: sellerMpId, amount: 115 });
  ok((await req('POST', `/market/orders/${co2.d.orderId}/confirm`, null, buyer.token)).d.order?.status === 'paid', 'volta do checkout confere na conta do vendedor e libera');

  // renovação automática do token perto de vencer
  db.close();
  const w = new Database(path.join(__dirname, '..', 'safecord.db'));
  w.prepare('UPDATE seller_mp_accounts SET expires_at = ? WHERE user_id = ?').run(Date.now() + 86400000, seller.id);
  w.close();
  const before = (await fake('/__refreshes')).d.refreshes;
  const co3 = await req('POST', '/market/checkout', { productId: prod.id, address: addr }, buyer.token);
  const after = (await fake('/__refreshes')).d.refreshes;
  ok(co3.s === 200 && after === before + 1 && (await fake('/__prefs')).d.at(-1).owner !== 'platform', 'token perto de vencer é renovado sozinho e a venda segue direta');

  // desconectar volta pro repasse manual
  await req('POST', '/market/mp/disconnect', null, seller.token);
  const co4 = await req('POST', '/market/checkout', { productId: prod.id, address: addr }, buyer.token);
  const p4 = (await fake('/__prefs')).d.at(-1);
  ok(co4.s === 200 && p4.owner === 'platform' && p4.marketplace_fee === undefined, 'desconectado: cobrança volta pra conta do SafeCord (repasse manual)');

  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
})();
