const crypto = require('crypto');

// ─── Pagamentos do SafeCord ─────────────────────────────────────────────────
// Um lugar só pra cobrar, usado pela loja de Insígnias/Pro e pelo Mercado.
//
// Provedor principal: Mercado Pago (Checkout Pro) — o comprador paga com Pix, cartão ou
// boleto na página do próprio Mercado Pago. Se não houver token do Mercado Pago mas houver
// chave do Stripe, usa o Stripe (o que existia antes). Sem nenhum dos dois, pagamentos ficam
// desligados (ou simulados, no Mercado, com MARKET_DEV_PAYMENTS=1).
//
// Regra de ouro: NUNCA confiar no que chega no webhook ou na volta do checkout. Sempre
// consultamos o pagamento direto na API do provedor antes de liberar qualquer coisa.

const MP_TOKEN = process.env.MERCADOPAGO_ACCESS_TOKEN || '';
const MP_WEBHOOK_SECRET = process.env.MERCADOPAGO_WEBHOOK_SECRET || '';
const MP_API = (process.env.MERCADOPAGO_API_URL || 'https://api.mercadopago.com').replace(/\/$/, '');
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY || '';
const APP_URL = (process.env.APP_URL || 'http://localhost:4000').replace(/\/$/, '');
const PUBLIC_HTTPS = APP_URL.startsWith('https://');

let stripe = null;
if (!MP_TOKEN && STRIPE_KEY) {
  try { stripe = require('stripe')(STRIPE_KEY); } catch (e) { console.warn('Stripe indisponível:', e.message); }
}

function provider() {
  if (MP_TOKEN) return 'mercadopago';
  if (stripe) return 'stripe';
  return null;
}

function providerLabel() {
  return { mercadopago: 'Mercado Pago', stripe: 'Stripe' }[provider()] || null;
}

// ─── Mercado Pago ───────────────────────────────────────────────────────────
async function mp(method, path, body) {
  const res = await fetch(`${MP_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${MP_TOKEN}`,
      'Content-Type': 'application/json',
      // Evita cobrança duplicada se a mesma criação for reenviada
      ...(method === 'POST' ? { 'X-Idempotency-Key': crypto.randomUUID() } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = {};
  try { data = await res.json(); } catch { /* corpo vazio */ }
  if (!res.ok) {
    const msg = data?.message || data?.error || `HTTP ${res.status}`;
    throw new Error(`Mercado Pago: ${msg}`);
  }
  return data;
}

function returnUrls() {
  return {
    success: `${APP_URL}/api/shop/return?status=success`,
    failure: `${APP_URL}/api/shop/return?status=cancel`,
    pending: `${APP_URL}/api/shop/return?status=pending`,
  };
}

/**
 * Cria a cobrança e devolve { url, providerRef, provider }.
 * items: [{ title, description?, unitCents, quantity, imageUrl? }]
 * reference: nosso id (pedido/compra) — volta no pagamento como external_reference
 */
async function createCheckout({ reference, items, metadata = {} }) {
  const which = provider();
  if (which === 'mercadopago') {
    const preference = await mp('POST', '/checkout/preferences', {
      items: items.map((it) => ({
        title: it.title.slice(0, 250),
        ...(it.description ? { description: it.description.slice(0, 250) } : {}),
        quantity: it.quantity,
        unit_price: Number((it.unitCents / 100).toFixed(2)),
        currency_id: 'BRL',
        ...(it.imageUrl ? { picture_url: it.imageUrl } : {}),
      })),
      external_reference: reference,
      metadata: { ...metadata, reference },
      back_urls: returnUrls(),
      // O Mercado Pago só aceita voltar sozinho e mandar webhook pra endereços públicos (https)
      ...(PUBLIC_HTTPS ? {
        auto_return: 'approved',
        notification_url: `${APP_URL}/api/payments/mercadopago/webhook?source_news=webhooks`,
      } : {}),
      statement_descriptor: 'SAFECORD',
    });
    return { url: preference.init_point, providerRef: preference.id, provider: which };
  }

  if (which === 'stripe') {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: items.map((it) => ({
        price_data: {
          currency: 'brl',
          unit_amount: it.unitCents,
          product_data: {
            name: it.title,
            ...(it.description ? { description: it.description } : {}),
            ...(it.imageUrl ? { images: [it.imageUrl] } : {}),
          },
        },
        quantity: it.quantity,
      })),
      success_url: returnUrls().success,
      cancel_url: returnUrls().failure,
      metadata: { ...metadata, reference },
    });
    return { url: session.url, providerRef: session.id, provider: which };
  }

  throw new Error('Pagamentos não configurados');
}

/**
 * Consulta o provedor e diz se a cobrança já foi paga: 'paid' | 'pending' | 'failed'.
 */
async function checkStatus({ reference, providerRef, provider: which = provider() }) {
  if (which === 'mercadopago' && MP_TOKEN) {
    const data = await mp('GET', `/v1/payments/search?external_reference=${encodeURIComponent(reference)}&sort=date_created&criteria=desc`);
    const results = data.results || [];
    if (results.some((p) => p.status === 'approved' && p.external_reference === reference)) return 'paid';
    if (results.some((p) => ['pending', 'in_process', 'authorized'].includes(p.status))) return 'pending';
    if (results.length && results.every((p) => ['rejected', 'cancelled', 'refunded', 'charged_back'].includes(p.status))) return 'failed';
    return 'pending';
  }
  if (which === 'stripe' && stripe && providerRef) {
    const session = await stripe.checkout.sessions.retrieve(providerRef);
    return session.payment_status === 'paid' ? 'paid' : 'pending';
  }
  return 'pending';
}

/**
 * Confere a assinatura x-signature do webhook do Mercado Pago (quando o segredo está no .env).
 * Manifesto oficial: "id:[data.id];request-id:[x-request-id];ts:[ts];" com HMAC-SHA256.
 */
function validMercadoPagoSignature(req, dataId) {
  if (!MP_WEBHOOK_SECRET) return true; // sem segredo: seguimos, mas SEMPRE reconsultando na API
  const header = String(req.headers['x-signature'] || '');
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.trim().split('=').map((s) => s.trim())));
  if (!parts.ts || !parts.v1) return false;
  const requestId = req.headers['x-request-id'] || '';
  const id = /^[a-z0-9]+$/i.test(String(dataId)) ? String(dataId).toLowerCase() : String(dataId);
  let manifest = `id:${id};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${parts.ts};`;
  const expected = crypto.createHmac('sha256', MP_WEBHOOK_SECRET).update(manifest).digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1));
  } catch {
    return false;
  }
}

/**
 * Trata o webhook do Mercado Pago. Devolve a referência (nosso id) SE o pagamento foi
 * aprovado — conferido na API, não no corpo da notificação. Senão devolve null.
 */
async function resolveMercadoPagoWebhook(req) {
  const type = req.query.type || req.query.topic || req.body?.type;
  const dataId = req.query['data.id'] || req.query.id || req.body?.data?.id;
  if (type !== 'payment' || !dataId) return { ignored: true };
  if (!validMercadoPagoSignature(req, dataId)) return { invalidSignature: true };
  const payment = await mp('GET', `/v1/payments/${encodeURIComponent(dataId)}`);
  if (payment.status !== 'approved' || !payment.external_reference) return { reference: null };
  return { reference: payment.external_reference };
}

module.exports = {
  provider,
  providerLabel,
  createCheckout,
  checkStatus,
  resolveMercadoPagoWebhook,
  validMercadoPagoSignature,
  stripeClient: () => stripe,
  APP_URL,
};
