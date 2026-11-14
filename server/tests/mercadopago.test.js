const crypto = require('crypto');
const B = 'http://localhost:4000/api', MP = 'http://localhost:4999', SECRET = 'segredo-webhook';
let n = 0, fails = 0;
const ok = (c, l) => { n++; console.log(`${n}) ${l}: ${c ? 'OK' : 'FALHOU'}`); if (!c) fails++; };
const req = async (m, p, body, t, headers = {}) => {
  const isForm = body instanceof FormData;
  const r = await fetch(B + p, { method: m, headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}), ...headers }, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
  let d = {}; try { d = await r.json(); } catch {} return { s: r.status, d };
};
const pay = (reference, status) => fetch(MP + '/__pay', { method: 'POST', body: JSON.stringify({ reference, status }) }).then((r) => r.json());
const prefs = () => fetch(MP + '/__prefs').then((r) => r.json());
const sign = (id, reqId, ts, secret = SECRET) => `ts=${ts},v1=${crypto.createHmac('sha256', secret).update(`id:${id};request-id:${reqId};ts:${ts};`).digest('hex')}`;
const webhook = (id, { secret = SECRET, tamper = false } = {}) => {
  const ts = Date.now(), reqId = crypto.randomUUID();
  return req('POST', `/payments/mercadopago/webhook?data.id=${id}&type=payment`, { type: 'payment', action: 'payment.updated', data: { id: String(id) } }, null,
    { 'x-signature': sign(tamper ? id + 1 : id, reqId, ts, secret), 'x-request-id': reqId });
};
const rnd = () => Math.random().toString(36).slice(2, 7);
const { openVerifiedStore } = require('./helpers/kyc');
async function user(name, email) {
  const r = await req('POST', '/auth/register', { username: name + rnd(), password: 'senha123', email: email || `${name}${rnd()}@t.com` });
  await req('POST', '/auth/verify-email', { code: r.d.verification?.devCode }, r.d.token);
  return r.d.token;
}
const addr = { name: 'Ana', cep: '01310100', street: 'Av. Paulista', number: '1000', district: 'Bela Vista', city: 'São Paulo', state: 'SP' };
(async () => {
  const seller = await user('vend'), buyer = await user('comp');
  const cfg = (await req('GET', '/market/config', null, buyer)).d;
  ok(cfg.provider === 'Mercado Pago' && cfg.paymentsEnabled && !cfg.devPayments, 'Mercado Pago ativo (sem modo de teste)');
  const admin = await user('adm', 'admin@t.com'); // servidor com ADMIN_EMAILS=admin@t.com
  await openVerifiedStore(req, seller, admin, { name: 'Loja MP' });
  const phys = (await req('POST', '/market/products', { title: 'Caneca', type: 'physical', price_cents: 5000, shipping_cents: 1500, stock: 5 }, seller)).d.product;

  const co = await req('POST', '/market/checkout', { productId: phys.id, quantity: 2, address: addr }, buyer);
  ok(co.s === 200 && /mercadopago\.com\.br\/checkout/.test(co.d.checkoutUrl), 'checkout devolve o link do Mercado Pago');
  const pref = (await prefs()).at(-1);
  ok(pref.external_reference === co.d.orderId && pref.items.length === 2 && pref.items[0].unit_price === 50 && pref.items[0].quantity === 2 && pref.items[1].title === 'Frete' && pref.items[1].unit_price === 15, 'preferência certa: 2×R$50,00 + frete R$15,00, referência = pedido');
  ok(pref.back_urls?.success?.includes('/api/shop/return?status=success') && pref.idempotency, 'back_urls e chave de idempotência enviadas');
  ok((await req('POST', `/market/orders/${co.d.orderId}/dev-pay`, null, buyer)).s === 404, 'pagamento simulado desligado com Mercado Pago ativo');

  let c = await req('POST', `/market/orders/${co.d.orderId}/confirm`, null, buyer);
  ok(c.d.order.status === 'pending', '"Já paguei" antes de pagar: continua pendente');
  await pay(co.d.orderId, 'pending');
  c = await req('POST', `/market/orders/${co.d.orderId}/confirm`, null, buyer);
  ok(c.d.order.status === 'pending', 'Pix gerado mas não pago: continua pendente');
  await pay(co.d.orderId, 'approved');
  c = await req('POST', `/market/orders/${co.d.orderId}/confirm`, null, buyer);
  ok(c.d.order.status === 'paid', 'Pix aprovado: pedido pago');
  const stock = (await req('GET', `/market/products/${phys.id}`, null, buyer)).d.product.stock;
  ok(stock === 3, 'estoque baixou 2');

  // webhook
  const co2 = await req('POST', '/market/checkout', { productId: phys.id, quantity: 1, address: addr }, buyer);
  const p2 = await pay(co2.d.orderId, 'approved');
  ok((await webhook(p2.id, { secret: 'segredo-errado' })).s === 401, 'webhook com assinatura falsa é recusado');
  ok((await webhook(p2.id, { tamper: true })).s === 401, 'webhook com id adulterado é recusado');
  let o2 = (await req('GET', '/market/orders', null, buyer)).d;
  ok(o2.pending.some((o) => o.id === co2.d.orderId), 'pedido continua pendente depois dos webhooks falsos');
  ok((await webhook(p2.id)).s === 200, 'webhook verdadeiro aceito');
  await webhook(p2.id); // repetido (o Mercado Pago reenvia)
  o2 = (await req('GET', '/market/orders', null, buyer)).d;
  ok(o2.orders.find((o) => o.id === co2.d.orderId)?.status === 'paid', 'webhook liberou o pedido sozinho');
  ok((await req('GET', `/market/products/${phys.id}`, null, buyer)).d.product.stock === 2, 'webhook repetido não baixa estoque 2×');

  const co3 = await req('POST', '/market/checkout', { productId: phys.id, quantity: 1, address: addr }, buyer);
  const p3 = await pay(co3.d.orderId, 'rejected');
  await webhook(p3.id);
  o2 = (await req('GET', '/market/orders', null, buyer)).d;
  ok(o2.pending.some((o) => o.id === co3.d.orderId), 'pagamento recusado (cartão) não libera nada');

  // loja de insígnias
  const sh = await req('POST', '/shop/checkout', { productId: 'pro_monthly' }, buyer);
  ok(sh.s === 200 && /mercadopago/.test(sh.d.checkoutUrl), 'Pro também cobra pelo Mercado Pago');
  const sp = (await prefs()).at(-1);
  ok(sp.items[0].unit_price === 19.9 && sp.external_reference === sh.d.purchaseId, 'preferência do Pro: R$19,90');
  await pay(sh.d.purchaseId, 'approved');
  const conf = await req('POST', `/shop/purchases/${sh.d.purchaseId}/confirm`, null, buyer);
  ok(conf.d.status === 'paid' && conf.d.user.is_pro && conf.d.user.badges.some((b) => b.id === 'pro'), 'Pro liberado com insígnia de diamante');
  const sh2 = await req('POST', '/shop/checkout', { productId: 'badge_star' }, buyer);
  const ps = await pay(sh2.d.purchaseId, 'approved');
  await webhook(ps.id);
  const me = (await req('GET', '/auth/me', null, buyer)).d;
  ok((me.user || me).badges.some((b) => b.id === 'star'), 'insígnia liberada pelo webhook');

  const ret = await fetch(B + '/shop/return?status=pending').then((r) => r.text());
  ok(/Pagamento em processamento/.test(ret), 'página de volta mostra "em processamento" (Pix/boleto)');
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
})();
