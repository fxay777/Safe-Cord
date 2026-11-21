const fs = require('fs');
const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../auth');
const { getPublicUser } = require('../userUtils');
const { isAdmin, requireAdmin } = require('../adminUtils');
const kyc = require('../sellerVerification');
const br = require('../brValidators');
const mpConnect = require('../mpConnect');
const {
  upload, uploadDigital, saveProductImage, saveStoreImage, digitalFilePath, removeIfLocalUpload, MAX_DIGITAL_BYTES,
} = require('../uploads');

// ─── Mercado do SafeCord ────────────────────────────────────────────────────
// Microempreendedores abrem uma loja e vendem produtos físicos ou digitais.
// O comprador paga pelo Stripe na conta do SafeCord; cada pedido guarda a parte do
// vendedor e a taxa da plataforma. O admin repassa o saldo manualmente (Pix etc.)
// e registra o repasse aqui.

const router = express.Router();

const payments = require('../payments');
const APP_URL = payments.APP_URL;
const FEE_PERCENT = Math.min(Math.max(Number(process.env.MARKET_FEE_PERCENT ?? 10), 0), 50);
// Pagamento simulado, só pra testar a loja localmente sem provedor. Nunca ativa se o Mercado Pago (ou Stripe) estiver configurado.
const DEV_PAYMENTS = !payments.provider() && process.env.MARKET_DEV_PAYMENTS === '1';
const RELEASE_DAYS_AFTER_SHIP = 14; // físico enviado e não confirmado: libera o saldo depois disso

const paymentsOn = () => Boolean(payments.provider());

const MIN_PRICE = 100;        // R$ 1,00
const MAX_PRICE = 5000000;    // R$ 50.000,00
const MAX_IMAGES = 6;
const MAX_QTY = 20;

// ─── helpers ────────────────────────────────────────────────────────────────

function parseJSON(text, fallback) {
  try { return text ? JSON.parse(text) : fallback; } catch { return fallback; }
}

function cents(value) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? n : NaN;
}

function myStore(userId) {
  return db.prepare('SELECT * FROM stores WHERE owner_id = ?').get(userId);
}

function publicStore(row, { includePrivate = false } = {}) {
  if (!row) return null;
  const owner = getPublicUser(row.owner_id);
  const stats = db.prepare(
    "SELECT COUNT(*) AS products FROM products WHERE store_id = ? AND active = 1"
  ).get(row.id);
  const sales = db.prepare(
    "SELECT COALESCE(SUM(quantity), 0) AS n FROM orders WHERE store_id = ? AND status IN ('paid','shipped','delivered')"
  ).get(row.id);
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    logo_url: row.logo_url,
    banner_url: row.banner_url,
    status: row.status,
    category: row.category || '',
    verified: !row.requires_verification || kyc.isApproved(row.owner_id),
    created_at: row.created_at,
    owner: owner ? {
      id: owner.id, username: owner.username, tag: owner.tag, display_name: owner.display_name,
      avatar_url: owner.avatar_url, avatar_color: owner.avatar_color, badges: owner.badges,
    } : null,
    product_count: stats.products,
    sales_count: sales.n,
    ...(includePrivate ? {
      payout_info: row.payout_info,
      contact_email: row.contact_email,
      contact_phone: row.contact_phone,
      requires_verification: Boolean(row.requires_verification),
    } : {}),
  };
}

function publicProduct(row, { forOwner = false } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    store_id: row.store_id,
    title: row.title,
    description: row.description,
    type: row.type,
    price_cents: row.price_cents,
    shipping_cents: row.shipping_cents,
    stock: row.stock,
    images: parseJSON(row.images, []),
    active: Boolean(row.active),
    sales_count: row.sales_count,
    created_at: row.created_at,
    has_file: Boolean(row.digital_file),
    ...(forOwner ? { digital_file_name: row.digital_file_name, digital_file_size: row.digital_file_size } : {}),
  };
}

function isReleased(order, now = Date.now()) {
  if (order.status === 'delivered') return true;
  if (order.status === 'shipped' && order.shipped_at && now - order.shipped_at > RELEASE_DAYS_AFTER_SHIP * 86400000) return true;
  return false;
}

function serializeOrder(row, viewerId) {
  const store = db.prepare('SELECT id, name, owner_id, logo_url FROM stores WHERE id = ?').get(row.store_id);
  const buyer = getPublicUser(row.buyer_id);
  const isBuyer = row.buyer_id === viewerId;
  const isSeller = store?.owner_id === viewerId;
  const snapshot = parseJSON(row.product_snapshot, {});
  return {
    id: row.id,
    status: row.status,
    quantity: row.quantity,
    unit_price_cents: row.unit_price_cents,
    shipping_cents: row.shipping_cents,
    total_cents: row.total_cents,
    ...(isSeller || isAdmin(viewerId) ? { fee_cents: row.fee_cents, seller_cents: row.seller_cents, paid_out: Boolean(row.payout_id) } : {}),
    product: { id: row.product_id, ...snapshot },
    store: store ? { id: store.id, name: store.name, logo_url: store.logo_url } : null,
    buyer: (isSeller || isBuyer) && buyer
      ? { id: buyer.id, username: buyer.username, tag: buyer.tag, display_name: buyer.display_name, avatar_url: buyer.avatar_url, avatar_color: buyer.avatar_color }
      : null,
    shipping_address: isBuyer || isSeller ? parseJSON(row.shipping_address, null) : null,
    tracking_code: row.tracking_code,
    can_download: isBuyer && snapshot.type === 'digital' && ['paid', 'delivered'].includes(row.status),
    released: isReleased(row),
    created_at: row.created_at,
    paid_at: row.paid_at,
    shipped_at: row.shipped_at,
    delivered_at: row.delivered_at,
  };
}

function notify(req, userId, event, payload) {
  req.app.get('io')?.to(`user:${userId}`).emit(event, payload);
}

function validateAddress(a) {
  if (!a || typeof a !== 'object') return 'Informe o endereço de entrega';
  const clean = {
    name: String(a.name || '').trim().slice(0, 80),
    cep: String(a.cep || '').replace(/\D/g, ''),
    street: String(a.street || '').trim().slice(0, 120),
    number: String(a.number || '').trim().slice(0, 12),
    complement: String(a.complement || '').trim().slice(0, 60),
    district: String(a.district || '').trim().slice(0, 60),
    city: String(a.city || '').trim().slice(0, 60),
    state: String(a.state || '').trim().toUpperCase().slice(0, 2),
  };
  if (!clean.name) return 'Informe o nome de quem vai receber';
  if (clean.cep.length !== 8) return 'CEP inválido (8 números)';
  if (!clean.street || !clean.number) return 'Informe rua e número';
  if (!clean.district || !clean.city) return 'Informe bairro e cidade';
  if (!/^[A-Z]{2}$/.test(clean.state)) return 'Informe a UF (ex.: SP)';
  return clean;
}

/**
 * Marca o pedido como pago (chamado pelo webhook, pela confirmação ou pelo pagamento de teste).
 * Tudo numa transação, e só se ainda estiver pendente — chamar duas vezes não cobra/baixa estoque duas vezes.
 */
function fulfillOrder(orderId, req) {
  const result = db.transaction(() => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order || order.status !== 'pending') return null;
    const snapshot = parseJSON(order.product_snapshot, {});
    const now = Date.now();
    // Digital é entregue na hora (download liberado); físico espera o envio
    const nextStatus = snapshot.type === 'digital' ? 'delivered' : 'paid';
    db.prepare('UPDATE orders SET status = ?, paid_at = ?, delivered_at = ? WHERE id = ?')
      .run(nextStatus, now, nextStatus === 'delivered' ? now : null, order.id);
    if (order.product_id) {
      db.prepare(`UPDATE products SET sales_count = sales_count + ?,
        stock = CASE WHEN stock IS NULL THEN NULL ELSE MAX(stock - ?, 0) END WHERE id = ?`)
        .run(order.quantity, order.quantity, order.product_id);
    }
    return { ...order, status: nextStatus };
  })();

  if (result && req) {
    const store = db.prepare('SELECT owner_id FROM stores WHERE id = ?').get(result.store_id);
    if (store) notify(req, store.owner_id, 'market:new-order', { orderId: result.id });
    notify(req, result.buyer_id, 'market:order-updated', { orderId: result.id, status: result.status });
  }
  return result;
}

/** Usado pelo webhook do Stripe (que fica em shopRoutes): só pedidos do mercado. */
async function handleStripeSession(session, req) {
  if (session?.metadata?.kind !== 'market' || !session.metadata.orderId) return false;
  if (session.payment_status !== 'paid') return true;
  fulfillOrder(session.metadata.orderId, req);
  return true;
}

// ─── rotas ──────────────────────────────────────────────────────────────────
router.use(requireAuth);

router.get('/config', (req, res) => {
  res.json({
    feePercent: FEE_PERCENT,
    paymentsEnabled: paymentsOn() || DEV_PAYMENTS,
    devPayments: DEV_PAYMENTS,
    provider: payments.providerLabel(),
    isAdmin: isAdmin(req.user.id),
    maxDigitalMB: Math.round(MAX_DIGITAL_BYTES / 1024 / 1024),
  });
});

// Vitrine: produtos ativos de lojas ativas, com busca e filtros
router.get('/products', (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const type = ['physical', 'digital'].includes(req.query.type) ? req.query.type : null;
  const sort = String(req.query.sort || 'new');
  const order = {
    popular: 'p.sales_count DESC, p.created_at DESC',
    price_asc: 'p.price_cents ASC',
    price_desc: 'p.price_cents DESC',
  }[sort] || 'p.created_at DESC';

  const where = ["p.active = 1", "s.status = 'active'", "(p.type = 'physical' OR p.digital_file IS NOT NULL)"];
  const params = [];
  if (type) { where.push('p.type = ?'); params.push(type); }
  if (q) {
    where.push('(LOWER(p.title) LIKE ? OR LOWER(p.description) LIKE ? OR LOWER(s.name) LIKE ?)');
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  const rows = db.prepare(
    `SELECT p.*, s.name AS store_name, s.logo_url AS store_logo FROM products p
     JOIN stores s ON s.id = p.store_id
     WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 120`
  ).all(...params);

  res.json({
    products: rows.map((r) => ({ ...publicProduct(r), store: { id: r.store_id, name: r.store_name, logo_url: r.store_logo } })),
  });
});

router.get('/products/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Produto não encontrado' });
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(row.store_id);
  const isOwner = store?.owner_id === req.user.id;
  if ((!row.active || store?.status !== 'active') && !isOwner) {
    return res.status(404).json({ error: 'Produto indisponível' });
  }
  const more = db.prepare(
    'SELECT * FROM products WHERE store_id = ? AND active = 1 AND id != ? ORDER BY sales_count DESC LIMIT 4'
  ).all(row.store_id, row.id);
  res.json({ product: publicProduct(row, { forOwner: isOwner }), store: publicStore(store), more: more.map((p) => publicProduct(p)) });
});

router.get('/stores/by-owner/:userId', (req, res) => {
  const row = db.prepare("SELECT * FROM stores WHERE owner_id = ? AND status = 'active'").get(req.params.userId);
  res.json({ store: row ? publicStore(row) : null });
});

router.get('/stores/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
  if (!row || (row.status !== 'active' && row.owner_id !== req.user.id)) {
    return res.status(404).json({ error: 'Loja não encontrada' });
  }
  const products = db.prepare(
    "SELECT * FROM products WHERE store_id = ? AND active = 1 AND (type = 'physical' OR digital_file IS NOT NULL) ORDER BY created_at DESC"
  ).all(row.id);
  res.json({ store: publicStore(row), products: products.map((p) => publicProduct(p)) });
});

// ─── minha loja (vendedor) ──────────────────────────────────────────────────
function sellerSummary(storeId) {
  const rows = db.prepare(
    "SELECT * FROM orders WHERE store_id = ? AND status IN ('paid','shipped','delivered')"
  ).all(storeId);
  const now = Date.now();
  let available = 0; let pending = 0; let paidOut = 0; let gross = 0;
  for (const o of rows) {
    gross += o.total_cents;
    if (o.payout_id) paidOut += o.seller_cents;
    else if (isReleased(o, now)) available += o.seller_cents;
    else pending += o.seller_cents;
  }
  let direct = 0;
  for (const o of rows) {
    if (!o.split) continue;
    // pagamento direto: já caiu na conta do vendedor — não entra em "a repassar"
    direct += o.seller_cents;
    if (o.payout_id) paidOut -= o.seller_cents;
    else if (isReleased(o, now)) available -= o.seller_cents;
    else pending -= o.seller_cents;
  }
  const toShip = db.prepare("SELECT COUNT(*) AS n FROM orders WHERE store_id = ? AND status = 'paid'").get(storeId).n;
  return { available_cents: available, pending_cents: pending, paid_out_cents: paidOut, direct_cents: direct, gross_cents: gross, orders: rows.length, to_ship: toShip };
}

router.get('/my-store', (req, res) => {
  const row = myStore(req.user.id);
  if (!row) return res.json({ store: null, verification: kyc.ownerView(req.user.id) });
  const products = db.prepare('SELECT * FROM products WHERE store_id = ? ORDER BY created_at DESC').all(row.id);
  res.json({
    store: publicStore(row, { includePrivate: true }),
    products: products.map((p) => publicProduct(p, { forOwner: true })),
    summary: sellerSummary(row.id),
    verification: kyc.ownerView(req.user.id),
    mercadopago: mpConnect.statusFor(req.user.id),
  });
});

// ─── pagamento direto (conta Mercado Pago do vendedor) ──────────────────────
router.get('/mp/status', (req, res) => res.json(mpConnect.statusFor(req.user.id)));

router.post('/mp/connect', (req, res) => {
  if (!mpConnect.enabled()) return res.status(503).json({ error: 'Pagamento direto ainda não está ligado no servidor (falta MERCADOPAGO_CLIENT_ID/SECRET)' });
  if (!kyc.isApproved(req.user.id)) return res.status(403).json({ error: 'Termine a verificação da loja antes de conectar o Mercado Pago' });
  res.json({ url: mpConnect.startConnect(req.user.id) });
});

router.post('/mp/disconnect', (req, res) => {
  mpConnect.disconnect(req.user.id);
  res.json(mpConnect.statusFor(req.user.id));
});

function readStoreBody(body, current = {}) {
  const name = body.name !== undefined ? String(body.name).trim().slice(0, 50) : current.name;
  if (!name || name.length < 2) return { error: 'Dê um nome pra sua loja (2 letras ou mais)' };
  const description = body.description !== undefined ? String(body.description).trim().slice(0, 500) : (current.description || '');
  const category = body.category !== undefined ? String(body.category) : (current.category || '');
  if (category && !kyc.STORE_CATEGORIES.includes(category)) return { error: 'Categoria inválida' };
  const email = body.contact_email !== undefined ? String(body.contact_email).trim().toLowerCase().slice(0, 120) : (current.contact_email || '');
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return { error: 'Email de contato inválido' };
  const phone = body.contact_phone !== undefined ? br.onlyDigits(body.contact_phone) : (current.contact_phone || '');
  if (phone && !br.isValidPhone(phone)) return { error: 'Telefone de contato inválido — use DDD + número' };
  const payout = body.payout_info !== undefined ? String(body.payout_info).trim().slice(0, 300) : (current.payout_info || '');
  return { name, description, category, contact_email: email, contact_phone: phone, payout_info: payout };
}

router.post('/my-store', (req, res) => {
  if (myStore(req.user.id)) return res.status(409).json({ error: 'Você já tem uma loja' });
  const me = db.prepare('SELECT email_verified FROM users WHERE id = ?').get(req.user.id);
  if (!me?.email_verified) return res.status(403).json({ error: 'Confirme seu email antes de abrir uma loja' });
  const body = readStoreBody(req.body || {});
  if (body.error) return res.status(400).json({ error: body.error });
  if (!body.category) return res.status(400).json({ error: 'Escolha a categoria da loja' });
  if (body.description.length < 20) return res.status(400).json({ error: 'Conte um pouco sobre a loja (20 letras ou mais)' });
  const id = uuidv4();
  // Loja nova fica escondida (pending) até a verificação do vendedor ser aprovada
  const status = kyc.isApproved(req.user.id) ? 'active' : 'pending';
  db.prepare(`INSERT INTO stores (id, owner_id, name, description, category, contact_email, contact_phone, payout_info,
    status, requires_verification, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`)
    .run(id, req.user.id, body.name, body.description, body.category, body.contact_email, body.contact_phone, body.payout_info, status, Date.now());
  res.status(201).json({ store: publicStore(myStore(req.user.id), { includePrivate: true }), verification: kyc.ownerView(req.user.id) });
});

router.put('/my-store', (req, res) => {
  const row = myStore(req.user.id);
  if (!row) return res.status(404).json({ error: 'Você ainda não tem loja' });
  const body = readStoreBody(req.body || {}, row);
  if (body.error) return res.status(400).json({ error: body.error });
  db.prepare('UPDATE stores SET name = ?, description = ?, category = ?, contact_email = ?, contact_phone = ?, payout_info = ? WHERE id = ?')
    .run(body.name, body.description, body.category, body.contact_email, body.contact_phone, body.payout_info, row.id);
  res.json({ store: publicStore(myStore(req.user.id), { includePrivate: true }) });
});

router.post('/my-store/image/:kind', upload.single('image'), async (req, res) => {
  const kind = req.params.kind === 'banner' ? 'banner' : req.params.kind === 'logo' ? 'logo' : null;
  const row = myStore(req.user.id);
  if (!kind) return res.status(400).json({ error: 'Tipo de imagem inválido' });
  if (!row) return res.status(404).json({ error: 'Você ainda não tem loja' });
  if (!req.file) return res.status(400).json({ error: 'Envie uma imagem' });
  const url = await saveStoreImage(req.file.buffer, row.id, kind);
  const column = kind === 'banner' ? 'banner_url' : 'logo_url';
  removeIfLocalUpload(row[column]);
  db.prepare(`UPDATE stores SET ${column} = ? WHERE id = ?`).run(url, row.id);
  res.json({ store: publicStore(myStore(req.user.id), { includePrivate: true }) });
});

function ownProduct(req) {
  const store = myStore(req.user.id);
  if (!store) return { error: [404, 'Você ainda não tem loja'] };
  const product = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ?').get(req.params.id, store.id);
  if (!product) return { error: [404, 'Produto não encontrado'] };
  return { store, product };
}

function readProductBody(body, current = {}) {
  const title = body.title !== undefined ? String(body.title).trim().slice(0, 80) : current.title;
  const description = body.description !== undefined ? String(body.description).trim().slice(0, 2000) : (current.description || '');
  const type = current.type || (body.type === 'digital' ? 'digital' : body.type === 'physical' ? 'physical' : null);
  const price = body.price_cents !== undefined ? cents(body.price_cents) : current.price_cents;
  let shipping = body.shipping_cents !== undefined ? cents(body.shipping_cents) : (current.shipping_cents || 0);
  let stock = body.stock !== undefined ? (body.stock === null || body.stock === '' ? null : cents(body.stock)) : current.stock;
  const active = body.active !== undefined ? (body.active ? 1 : 0) : (current.active ?? 1);

  if (!title || title.length < 2) return { error: 'Dê um nome pro produto' };
  if (!type) return { error: 'Escolha se o produto é físico ou digital' };
  if (!Number.isFinite(price) || price < MIN_PRICE || price > MAX_PRICE) return { error: 'Preço deve ficar entre R$ 1,00 e R$ 50.000,00' };
  if (type === 'digital') shipping = 0;
  if (!Number.isFinite(shipping) || shipping < 0 || shipping > 100000) return { error: 'Frete inválido' };
  if (stock !== null && stock !== undefined && (!Number.isFinite(stock) || stock < 0 || stock > 100000)) return { error: 'Estoque inválido' };
  return { title, description, type, price, shipping, stock: stock ?? null, active };
}

router.post('/products', (req, res) => {
  const store = myStore(req.user.id);
  if (!store) return res.status(404).json({ error: 'Abra sua loja primeiro' });
  const data = readProductBody(req.body || {});
  if (data.error) return res.status(400).json({ error: data.error });
  const id = uuidv4();
  const now = Date.now();
  db.prepare(`INSERT INTO products (id, store_id, title, description, type, price_cents, shipping_cents, stock, active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(id, store.id, data.title, data.description, data.type, data.price, data.shipping, data.stock, data.active, now, now);
  res.status(201).json({ product: publicProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(id), { forOwner: true }) });
});

router.put('/products/:id', (req, res) => {
  const { error, product } = ownProduct(req);
  if (error) return res.status(error[0]).json({ error: error[1] });
  const data = readProductBody(req.body || {}, product);
  if (data.error) return res.status(400).json({ error: data.error });
  db.prepare(`UPDATE products SET title = ?, description = ?, price_cents = ?, shipping_cents = ?, stock = ?, active = ?, updated_at = ? WHERE id = ?`)
    .run(data.title, data.description, data.price, data.shipping, data.stock, data.active, Date.now(), product.id);
  res.json({ product: publicProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(product.id), { forOwner: true }) });
});

router.delete('/products/:id', (req, res) => {
  const { error, product } = ownProduct(req);
  if (error) return res.status(error[0]).json({ error: error[1] });
  const hasOrders = db.prepare('SELECT 1 FROM orders WHERE product_id = ? LIMIT 1').get(product.id);
  if (hasOrders) {
    // Quem já comprou um produto digital precisa continuar baixando — então só tiramos da vitrine.
    db.prepare('UPDATE products SET active = 0, updated_at = ? WHERE id = ?').run(Date.now(), product.id);
    return res.json({ archived: true });
  }
  for (const url of parseJSON(product.images, [])) removeIfLocalUpload(url);
  if (product.digital_file) fs.rm(digitalFilePath(product.digital_file), { force: true }, () => {});
  db.prepare('DELETE FROM products WHERE id = ?').run(product.id);
  res.json({ deleted: true });
});

router.post('/products/:id/images', upload.single('image'), async (req, res) => {
  const { error, product, store } = ownProduct(req);
  if (error) return res.status(error[0]).json({ error: error[1] });
  if (!req.file) return res.status(400).json({ error: 'Envie uma imagem' });
  const images = parseJSON(product.images, []);
  if (images.length >= MAX_IMAGES) return res.status(400).json({ error: `Máximo de ${MAX_IMAGES} fotos por produto` });
  const url = await saveProductImage(req.file.buffer, store.id);
  images.push(url);
  db.prepare('UPDATE products SET images = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(images), Date.now(), product.id);
  res.json({ product: publicProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(product.id), { forOwner: true }) });
});

router.delete('/products/:id/images', (req, res) => {
  const { error, product } = ownProduct(req);
  if (error) return res.status(error[0]).json({ error: error[1] });
  const target = String(req.body?.url || '');
  const images = parseJSON(product.images, []);
  if (!images.includes(target)) return res.status(404).json({ error: 'Foto não encontrada' });
  removeIfLocalUpload(target);
  db.prepare('UPDATE products SET images = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(images.filter((u) => u !== target)), Date.now(), product.id);
  res.json({ product: publicProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(product.id), { forOwner: true }) });
});

router.post('/products/:id/file', (req, res, next) => {
  const { error, product } = ownProduct(req);
  if (error) return res.status(error[0]).json({ error: error[1] });
  if (product.type !== 'digital') return res.status(400).json({ error: 'Só produto digital tem arquivo' });
  req.marketProduct = product;
  next();
}, uploadDigital.single('file'), (req, res) => {
  const product = req.marketProduct;
  if (!req.file) return res.status(400).json({ error: 'Envie o arquivo do produto' });
  if (product.digital_file) fs.rm(digitalFilePath(product.digital_file), { force: true }, () => {});
  const original = String(req.file.originalname || 'arquivo').replace(/[\\/\r\n"]/g, '_').slice(0, 120);
  db.prepare('UPDATE products SET digital_file = ?, digital_file_name = ?, digital_file_size = ?, updated_at = ? WHERE id = ?')
    .run(req.file.filename, original, req.file.size, Date.now(), product.id);
  res.json({ product: publicProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(product.id), { forOwner: true }) });
});

router.get('/my-store/orders', (req, res) => {
  const store = myStore(req.user.id);
  if (!store) return res.json({ orders: [] });
  const rows = db.prepare(
    "SELECT * FROM orders WHERE store_id = ? AND status != 'pending' ORDER BY created_at DESC LIMIT 200"
  ).all(store.id);
  res.json({ orders: rows.map((r) => serializeOrder(r, req.user.id)) });
});

router.post('/orders/:id/ship', (req, res) => {
  const store = myStore(req.user.id);
  const order = store && db.prepare('SELECT * FROM orders WHERE id = ? AND store_id = ?').get(req.params.id, store.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.status !== 'paid') return res.status(409).json({ error: 'Esse pedido não está aguardando envio' });
  const tracking = String(req.body?.tracking_code || '').trim().slice(0, 60);
  db.prepare("UPDATE orders SET status = 'shipped', shipped_at = ?, tracking_code = ? WHERE id = ?")
    .run(Date.now(), tracking || null, order.id);
  notify(req, order.buyer_id, 'market:order-updated', { orderId: order.id, status: 'shipped' });
  res.json({ order: serializeOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id), req.user.id) });
});

// ─── compras (comprador) ────────────────────────────────────────────────────
router.post('/checkout', async (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.body?.productId);
  const store = product && db.prepare('SELECT * FROM stores WHERE id = ?').get(product.store_id);
  if (!product || !product.active || store?.status !== 'active') return res.status(404).json({ error: 'Produto indisponível' });
  if (store.owner_id === req.user.id) return res.status(400).json({ error: 'Você não pode comprar da sua própria loja' });
  if (product.type === 'digital' && !product.digital_file) return res.status(409).json({ error: 'Esse produto ainda não está disponível' });

  const quantity = product.type === 'digital' ? 1 : Math.min(Math.max(parseInt(req.body?.quantity, 10) || 1, 1), MAX_QTY);
  if (product.stock !== null && product.stock < quantity) {
    return res.status(409).json({ error: product.stock === 0 ? 'Produto esgotado' : `Só restam ${product.stock} unidade(s)` });
  }
  if (product.type === 'digital') {
    const already = db.prepare(
      "SELECT 1 FROM orders WHERE buyer_id = ? AND product_id = ? AND status IN ('paid','delivered')"
    ).get(req.user.id, product.id);
    if (already) return res.status(409).json({ error: 'Você já comprou esse produto — ele está em Minhas compras' });
  }

  let address = null;
  if (product.type === 'physical') {
    address = validateAddress(req.body?.address);
    if (typeof address === 'string') return res.status(400).json({ error: address });
  }

  if (!paymentsOn() && !DEV_PAYMENTS) {
    return res.status(503).json({ error: 'Pagamentos indisponíveis: configure MERCADOPAGO_ACCESS_TOKEN no .env do servidor.' });
  }

  const subtotal = product.price_cents * quantity;
  const shipping = product.type === 'physical' ? product.shipping_cents : 0;
  const fee = Math.round(subtotal * FEE_PERCENT / 100);
  const images = parseJSON(product.images, []);
  const snapshot = { title: product.title, type: product.type, image: images[0] || null };
  const orderId = uuidv4();

  const insert = (providerRef, providerName) => db.prepare(`INSERT INTO orders
    (id, buyer_id, store_id, product_id, product_snapshot, quantity, unit_price_cents, shipping_cents, total_cents,
     fee_cents, seller_cents, status, shipping_address, stripe_session_id, payment_provider, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`)
    .run(orderId, req.user.id, store.id, product.id, JSON.stringify(snapshot), quantity, product.price_cents, shipping,
      subtotal + shipping, fee, subtotal - fee + shipping, address ? JSON.stringify(address) : null, providerRef, providerName, Date.now());

  if (!paymentsOn()) {
    insert(null, 'dev');
    return res.json({ orderId, devPayment: true });
  }

  try {
    const items = [{
      title: product.title,
      description: `Vendido por ${store.name} no SafeCord`,
      unitCents: product.price_cents,
      quantity,
      ...(images[0] && APP_URL.startsWith('https://') ? { imageUrl: `${APP_URL}${images[0]}` } : {}),
    }];
    if (shipping > 0) items.push({ title: 'Frete', unitCents: shipping, quantity: 1 });
    // Vendedor com Mercado Pago conectado: cobra na conta dele, taxa do SafeCord separada na hora
    const sellerToken = await mpConnect.sellerToken(store.owner_id);
    const checkout = await payments.createCheckout({
      reference: orderId,
      items,
      metadata: { kind: 'market', orderId, userId: req.user.id },
      split: sellerToken ? { sellerToken, feeCents: fee, notifyTag: store.id } : null,
    });
    insert(checkout.providerRef, checkout.provider);
    if (sellerToken) db.prepare('UPDATE orders SET split = 1 WHERE id = ?').run(orderId);
    res.json({ orderId, checkoutUrl: checkout.url });
  } catch (err) {
    res.status(502).json({ error: `Não foi possível criar a cobrança: ${err.message}` });
  }
});

// Pagamento simulado (MARKET_DEV_PAYMENTS=1 e sem Stripe) — só pra testar localmente
router.post('/orders/:id/dev-pay', (req, res) => {
  if (!DEV_PAYMENTS) return res.status(404).json({ error: 'Não disponível' });
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND buyer_id = ?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  fulfillOrder(order.id, req);
  res.json({ order: serializeOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id), req.user.id) });
});

// Volta do checkout: consulta o Stripe direto (o webhook nem sempre está configurado em teste)
router.post('/orders/:id/confirm', async (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND buyer_id = ?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.status === 'pending' && paymentsOn() && order.payment_provider !== 'dev') {
    try {
      const owner = order.split ? db.prepare('SELECT owner_id FROM stores WHERE id = ?').get(order.store_id) : null;
      const status = await payments.checkStatus({
        reference: order.id,
        providerRef: order.stripe_session_id,
        provider: order.payment_provider || undefined,
        token: owner ? await mpConnect.sellerToken(owner.owner_id) : null,
      });
      if (status === 'paid') fulfillOrder(order.id, req);
    } catch (err) {
      return res.status(502).json({ error: `Não foi possível checar o pagamento: ${err.message}` });
    }
  }
  res.json({ order: serializeOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id), req.user.id) });
});

router.get('/orders', (req, res) => {
  const rows = db.prepare(
    "SELECT * FROM orders WHERE buyer_id = ? AND status != 'pending' ORDER BY created_at DESC LIMIT 200"
  ).all(req.user.id);
  const pending = db.prepare(
    "SELECT * FROM orders WHERE buyer_id = ? AND status = 'pending' AND created_at > ? ORDER BY created_at DESC LIMIT 5"
  ).all(req.user.id, Date.now() - 86400000);
  res.json({
    orders: rows.map((r) => serializeOrder(r, req.user.id)),
    pending: pending.map((r) => serializeOrder(r, req.user.id)),
  });
});

router.post('/orders/:id/received', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND buyer_id = ?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (!['paid', 'shipped'].includes(order.status)) return res.status(409).json({ error: 'Esse pedido não pode ser confirmado agora' });
  db.prepare("UPDATE orders SET status = 'delivered', delivered_at = ? WHERE id = ?").run(Date.now(), order.id);
  const store = db.prepare('SELECT owner_id FROM stores WHERE id = ?').get(order.store_id);
  if (store) notify(req, store.owner_id, 'market:order-updated', { orderId: order.id, status: 'delivered' });
  res.json({ order: serializeOrder(db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id), req.user.id) });
});

router.post('/orders/:id/cancel', (req, res) => {
  const order = db.prepare("SELECT * FROM orders WHERE id = ? AND buyer_id = ? AND status = 'pending'").get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Pedido pendente não encontrado' });
  db.prepare("UPDATE orders SET status = 'canceled' WHERE id = ?").run(order.id);
  res.json({ canceled: true });
});

router.get('/orders/:id/download', (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND buyer_id = ?').get(req.params.id, req.user.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  const snapshot = parseJSON(order.product_snapshot, {});
  if (snapshot.type !== 'digital' || !['paid', 'delivered'].includes(order.status)) {
    return res.status(403).json({ error: 'Download liberado só depois do pagamento' });
  }
  const product = order.product_id && db.prepare('SELECT digital_file, digital_file_name FROM products WHERE id = ?').get(order.product_id);
  if (!product?.digital_file) return res.status(410).json({ error: 'O vendedor removeu o arquivo. Fale com a loja.' });
  const filePath = digitalFilePath(product.digital_file);
  if (!fs.existsSync(filePath)) return res.status(410).json({ error: 'Arquivo não encontrado. Fale com a loja.' });
  res.download(filePath, product.digital_file_name || 'arquivo');
});

// ─── admin: repasses ────────────────────────────────────────────────────────
// Pra onde mandar o dinheiro: conta/Pix verificados; lojas antigas (antes da verificação) usam o texto livre.
function canReceivePayout(store) {
  return !store.requires_verification || kyc.isApproved(store.owner_id);
}

router.get('/admin/overview', requireAdmin, (req, res) => {
  const stores = db.prepare('SELECT * FROM stores ORDER BY created_at DESC').all();
  const list = stores.map((s) => ({
    ...publicStore(s, { includePrivate: true }),
    summary: sellerSummary(s.id),
    payout: kyc.payoutDestination(s.owner_id),
    verification_status: kyc.getRow(s.owner_id)?.status || (s.requires_verification ? 'draft' : 'legacy'),
    can_receive: canReceivePayout(s),
    mercadopago: mpConnect.statusFor(s.owner_id),
  }));
  const totals = db.prepare(
    "SELECT COALESCE(SUM(total_cents),0) AS gross, COALESCE(SUM(fee_cents),0) AS fees, COUNT(*) AS n FROM orders WHERE status IN ('paid','shipped','delivered')"
  ).get();
  res.json({
    stores: list,
    totals: {
      gross_cents: totals.gross,
      fee_cents: totals.fees,
      orders: totals.n,
      to_pay_cents: list.reduce((sum, s) => sum + s.summary.available_cents, 0),
    },
    feePercent: FEE_PERCENT,
  });
});

router.post('/admin/payouts', requireAdmin, (req, res) => {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.body?.storeId);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  if (!canReceivePayout(store)) return res.status(409).json({ error: 'O vendedor ainda não foi verificado — sem conta bancária confirmada pra receber' });
  const now = Date.now();
  const payout = db.transaction(() => {
    const rows = db.prepare(
      "SELECT * FROM orders WHERE store_id = ? AND payout_id IS NULL AND split = 0 AND status IN ('paid','shipped','delivered')"
    ).all(store.id).filter((o) => isReleased(o, now));
    if (!rows.length) return null;
    const id = uuidv4();
    const amount = rows.reduce((sum, o) => sum + o.seller_cents, 0);
    db.prepare('INSERT INTO payouts (id, store_id, amount_cents, order_count, note, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, store.id, amount, rows.length, String(req.body?.note || '').slice(0, 200), req.user.id, now);
    const mark = db.prepare('UPDATE orders SET payout_id = ? WHERE id = ?');
    for (const o of rows) mark.run(id, o.id);
    return { id, amount_cents: amount, order_count: rows.length };
  })();
  if (!payout) return res.status(409).json({ error: 'Essa loja não tem saldo liberado pra repassar' });
  notify(req, store.owner_id, 'market:payout', payout);
  res.status(201).json({ payout });
});

router.get('/admin/payouts', requireAdmin, (req, res) => {
  const rows = db.prepare(
    'SELECT p.*, s.name AS store_name FROM payouts p JOIN stores s ON s.id = p.store_id ORDER BY p.created_at DESC LIMIT 100'
  ).all();
  res.json({ payouts: rows });
});

router.put('/admin/stores/:id/status', requireAdmin, (req, res) => {
  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(req.params.id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  let status = req.body?.status === 'suspended' ? 'suspended' : 'active';
  // Reativar uma loja de vendedor não verificado volta pra "pending", não pra vitrine
  if (status === 'active' && !canReceivePayout(store)) status = 'pending';
  db.prepare('UPDATE stores SET status = ? WHERE id = ?').run(status, store.id);
  res.json({ status });
});

module.exports = router;
module.exports.handleStripeSession = handleStripeSession;
module.exports.fulfillOrderById = (id, req) => {
  const exists = db.prepare('SELECT 1 FROM orders WHERE id = ?').get(id);
  if (exists) fulfillOrder(id, req);
  return Boolean(exists);
};
