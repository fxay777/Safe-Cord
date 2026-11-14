const B = 'http://localhost:4000/api';
let n = 0, fails = 0;
const ok = (cond, label) => { n++; if (cond) console.log(`${n}) ${label}: OK`); else { fails++; console.log(`${n}) ${label}: FALHOU`); } };
const req = async (m, p, body, t, raw) => {
  const r = await fetch(B + p, { method: m, headers: { ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined });
  if (raw) return r;
  let data = {}; try { data = await r.json(); } catch {}
  return { s: r.status, d: data };
};
const rnd = () => Math.random().toString(36).slice(2, 7);
async function user(name, email, verify = true) {
  const r = await req('POST', '/auth/register', { username: name + rnd(), password: 'senha123', email: email || `${name}${rnd()}@t.com` });
  if (verify) await req('POST', '/auth/verify-email', { code: r.d.verification?.devCode }, r.d.token);
  return r.d.token;
}
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const addr = { name: 'Ana', cep: '01310-100', street: 'Av. Paulista', number: '1000', district: 'Bela Vista', city: 'São Paulo', state: 'sp' };

(async () => {
  const seller = await user('vend'), buyer = await user('comp'), other = await user('outro');
  const unverified = await user('nv', null, false);
  const admin = await user('adm', 'admin@t.com');

  ok((await req('POST', '/market/my-store', { name: 'Loja X' }, unverified)).s === 403, 'sem email confirmado não abre loja');
  const st = await req('POST', '/market/my-store', { name: 'Doces da Ana', description: 'Brigadeiros', payout_info: 'pix: ana@pix' }, seller);
  ok(st.s === 201 && st.d.store.payout_info === 'pix: ana@pix', 'vendedor abre a loja');
  ok((await req('POST', '/market/my-store', { name: 'Outra' }, seller)).s === 409, 'não abre duas lojas');

  const bad = await req('POST', '/market/products', { title: 'X', type: 'physical', price_cents: 50 }, seller);
  ok(bad.s === 400, 'preço abaixo de R$1 recusado');
  const phys = (await req('POST', '/market/products', { title: 'Caixa de brigadeiro', type: 'physical', price_cents: 5000, shipping_cents: 1500, stock: 2 }, seller)).d.product;
  ok(phys && phys.stock === 2, 'cria produto físico com estoque');
  const fd = new FormData(); fd.append('image', new Blob([png], { type: 'image/png' }), 'a.png');
  const img = await req('POST', `/market/products/${phys.id}/images`, fd, seller);
  ok(img.s === 200 && img.d.product.images.length === 1, 'sobe foto do produto');

  const dig = (await req('POST', '/market/products', { title: 'E-book de receitas', type: 'digital', price_cents: 1990, shipping_cents: 999 }, seller)).d.product;
  ok(dig.shipping_cents === 0, 'produto digital ignora frete');
  let list = (await req('GET', '/market/products', null, buyer)).d.products;
  ok(list.length === 1, 'digital sem arquivo não aparece na vitrine');
  const fileFd = new FormData(); fileFd.append('file', new Blob([Buffer.from('CONTEUDO-SECRETO-123')], { type: 'application/pdf' }), 'receitas.pdf');
  const up = await req('POST', `/market/products/${dig.id}/file`, fileFd, seller);
  ok(up.s === 200 && up.d.product.has_file && up.d.product.digital_file_name === 'receitas.pdf', 'sobe arquivo do digital');
  list = (await req('GET', '/market/products', null, buyer)).d.products;
  ok(list.length === 2 && !('digital_file' in list[0]), 'vitrine mostra os 2 e não vaza o arquivo');
  ok((await req('GET', '/market/products?q=ebook', null, buyer)).d.products.length === 0 && (await req('GET', '/market/products?q=receitas', null, buyer)).d.products.length === 1, 'busca funciona');
  ok((await req('GET', '/market/products?type=digital', null, buyer)).d.products.length === 1, 'filtro por tipo');

  ok((await req('POST', '/market/checkout', { productId: phys.id, quantity: 1 }, seller)).s === 400, 'vendedor não compra da própria loja');
  ok((await req('POST', '/market/checkout', { productId: phys.id, quantity: 1 }, buyer)).s === 400, 'físico sem endereço recusado');
  ok((await req('POST', '/market/checkout', { productId: phys.id, quantity: 3, address: addr }, buyer)).s === 409, 'mais que o estoque recusado');
  const co = await req('POST', '/market/checkout', { productId: phys.id, quantity: 2, address: addr }, buyer);
  ok(co.s === 200 && co.d.devPayment, 'checkout do físico (pagamento de teste)');
  const paid = await req('POST', `/market/orders/${co.d.orderId}/dev-pay`, null, buyer);
  ok(paid.d.order.status === 'paid' && paid.d.order.total_cents === 11500, 'pago: 2×R$50 + R$15 frete = R$115');
  ok(!('fee_cents' in paid.d.order), 'comprador não vê a taxa/parte do vendedor');
  ok(paid.d.order.shipping_address.state === 'SP' && paid.d.order.shipping_address.cep === '01310100', 'endereço normalizado');
  const again = await req('POST', `/market/orders/${co.d.orderId}/dev-pay`, null, buyer);
  const prodAfter = (await req('GET', `/market/products/${phys.id}`, null, buyer)).d.product;
  ok(prodAfter.stock === 0 && prodAfter.sales_count === 2, 'estoque baixou uma vez só (pagar 2× não duplica)');
  ok((await req('POST', '/market/checkout', { productId: phys.id, quantity: 1, address: addr }, other)).s === 409, 'esgotado recusa nova compra');

  const pend = await req('POST', '/market/checkout', { productId: dig.id }, buyer);
  ok((await req('GET', `/market/orders/${pend.d.orderId}/download`, null, buyer)).s === 403, 'download bloqueado antes de pagar');
  await req('POST', `/market/orders/${pend.d.orderId}/dev-pay`, null, buyer);
  const dl = await req('GET', `/market/orders/${pend.d.orderId}/download`, null, buyer, true);
  const text = await dl.text();
  ok(dl.status === 200 && text === 'CONTEUDO-SECRETO-123' && /receitas\.pdf/.test(dl.headers.get('content-disposition') || ''), 'comprador baixa o arquivo depois de pagar');
  ok((await req('GET', `/market/orders/${pend.d.orderId}/download`, null, other)).s === 404, 'outra pessoa não baixa o arquivo do pedido');
  ok((await req('POST', '/market/checkout', { productId: dig.id }, buyer)).s === 409, 'não compra o mesmo digital 2×');
  const priv = await fetch('http://localhost:4000/private-files/digital/x.bin');
  ok(priv.status === 404, 'pasta privada não é servida pela web');

  const mine = (await req('GET', '/market/orders', null, buyer)).d.orders;
  ok(mine.length === 2 && mine.some((o) => o.can_download), 'Minhas compras lista os 2, digital com download');

  const so = (await req('GET', '/market/my-store/orders', null, seller)).d.orders;
  const physOrder = so.find((o) => o.product.type === 'physical');
  ok(so.length === 2 && physOrder.fee_cents === 1000 && physOrder.seller_cents === 10500, 'vendedor vê pedidos com taxa 10% (sem frete) e parte dele');
  let sum = (await req('GET', '/market/my-store', null, seller)).d.summary;
  ok(sum.available_cents === 1791 && sum.pending_cents === 10500 && sum.to_ship === 1, 'saldo: digital liberado, físico pendente');

  ok((await req('POST', `/market/orders/${physOrder.id}/ship`, { tracking_code: 'BR123' }, other)).s === 404, 'outra pessoa não marca envio');
  const sh = await req('POST', `/market/orders/${physOrder.id}/ship`, { tracking_code: 'BR123' }, seller);
  ok(sh.d.order.status === 'shipped' && sh.d.order.tracking_code === 'BR123', 'vendedor marca enviado com rastreio');
  const rec = await req('POST', `/market/orders/${physOrder.id}/received`, null, buyer);
  ok(rec.d.order.status === 'delivered', 'comprador confirma recebimento');
  sum = (await req('GET', '/market/my-store', null, seller)).d.summary;
  ok(sum.available_cents === 12291 && sum.pending_cents === 0, 'saldo todo liberado após entrega');

  ok((await req('GET', '/market/admin/overview', null, seller)).s === 403, 'não-admin não vê repasses');
  const cfg = (await req('GET', '/market/config', null, admin)).d;
  ok(cfg.isAdmin === true && cfg.feePercent === 10, 'admin reconhecido pelo email');
  const ov = (await req('GET', '/market/admin/overview', null, admin)).d;
  const storeRow = ov.stores.find((s) => s.name === 'Doces da Ana');
  ok(ov.totals.fee_cents === 1199 && ov.totals.to_pay_cents === 12291 && storeRow.payout_info === 'pix: ana@pix', 'painel: taxa total e quanto pagar, com Pix');
  const po = await req('POST', '/market/admin/payouts', { storeId: storeRow.id, note: 'pix enviado' }, admin);
  ok(po.s === 201 && po.d.payout.amount_cents === 12291 && po.d.payout.order_count === 2, 'registra repasse');
  ok((await req('POST', '/market/admin/payouts', { storeId: storeRow.id }, admin)).s === 409, 'não repassa o mesmo saldo 2×');
  sum = (await req('GET', '/market/my-store', null, seller)).d.summary;
  ok(sum.available_cents === 0 && sum.paid_out_cents === 12291, 'vendedor vê o valor como repassado');

  const del = await req('DELETE', `/market/products/${dig.id}`, null, seller);
  ok(del.d.archived === true, 'produto com vendas é arquivado, não apagado');
  const dl2 = await req('GET', `/market/orders/${pend.d.orderId}/download`, null, buyer, true);
  ok(dl2.status === 200, 'quem comprou ainda baixa depois de arquivado');

  await req('PUT', `/market/admin/stores/${storeRow.id}/status`, { status: 'suspended' }, admin);
  ok((await req('GET', '/market/products', null, buyer)).d.products.length === 0, 'loja suspensa some da vitrine');

  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
})();
