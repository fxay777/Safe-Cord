const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../auth');
const { getPublicUser, grantBadge } = require('../userUtils');

const router = express.Router();

// --- Pagamentos ---
// Quem cobra é o módulo ../payments (Mercado Pago; Stripe como alternativa).
const payments = require('../payments');
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const stripeEnabled = () => Boolean(payments.provider());

// Catálogo. Assinatura (pro) dá a insígnia de diamante e marca pro_until; as demais dão a insígnia.
const PRO_DAYS = 30;
const PRODUCTS = {
  pro_monthly: {
    id: 'pro_monthly',
    kind: 'subscription',
    name: 'SafeCord Pro — 1 mês',
    description: 'Insígnia de diamante ao lado do seu nome por 30 dias e apoio direto ao projeto. Pagamento único, sem renovação automática.',
    amount_cents: 1990,
    icon: 'diamond',
    color: '#3A9BFF',
  },
};

// As insígnias compráveis do banco viram produtos automaticamente.
function allProducts() {
  const badgeProducts = db
    .prepare('SELECT * FROM badges WHERE purchasable = 1 AND price_cents IS NOT NULL ORDER BY position ASC')
    .all()
    .map((b) => ({
      id: `badge_${b.id}`,
      kind: 'badge',
      badge_id: b.id,
      name: b.name,
      description: b.description,
      amount_cents: b.price_cents,
      icon: b.icon,
      color: b.color,
    }));
  return [PRODUCTS.pro_monthly, ...badgeProducts];
}

function findProduct(productId) {
  return allProducts().find((p) => p.id === productId) || null;
}

/** Aplica o que foi comprado (chamado pelo webhook ou pela confirmação manual). */
function fulfillPurchase(purchase) {
  if (purchase.status === 'paid') return; // já processado

  const product = findProduct(purchase.product_id);
  if (!product) return;

  if (product.kind === 'subscription') {
    const row = db.prepare('SELECT pro_until FROM users WHERE id = ?').get(purchase.user_id);
    const base = row?.pro_until && row.pro_until > Date.now() ? row.pro_until : Date.now();
    const until = base + PRO_DAYS * 24 * 60 * 60 * 1000;
    db.prepare('UPDATE users SET pro_until = ? WHERE id = ?').run(until, purchase.user_id);
    grantBadge(purchase.user_id, 'pro');
  } else if (product.kind === 'badge') {
    grantBadge(purchase.user_id, product.badge_id);
  }

  grantBadge(purchase.user_id, 'supporter'); // quem compra qualquer coisa vira apoiador
  db.prepare("UPDATE purchases SET status = 'paid', paid_at = ? WHERE id = ?").run(Date.now(), purchase.id);
}

// Webhook do Stripe. A assinatura é validada sobre o corpo CRU (req.rawBody), que o
// express.json guarda pra gente lá no index.js — por isso esta rota vem antes do requireAuth:
// quem chama é o Stripe, não um usuário logado.
router.post('/webhook', async (req, res) => {
  const stripe = payments.stripeClient();
  if (!stripe) return res.status(503).json({ error: 'Stripe não configurado' });

  let event;
  try {
    if (STRIPE_WEBHOOK_SECRET && req.rawBody) {
      event = stripe.webhooks.constructEvent(req.rawBody, req.headers['stripe-signature'], STRIPE_WEBHOOK_SECRET);
    } else {
      // Sem segredo de webhook (comum em teste local), aceitamos o corpo já parseado.
      event = req.body;
    }
  } catch (err) {
    return res.status(400).json({ error: `Webhook inválido: ${err.message}` });
  }

  if (event?.type === 'checkout.session.completed') {
    let session = event.data?.object;
    // Sem segredo de webhook não dá pra confiar no corpo: confere a sessão direto no Stripe
    if (!STRIPE_WEBHOOK_SECRET) {
      try {
        session = await stripe.checkout.sessions.retrieve(session?.id);
      } catch {
        return res.status(400).json({ error: 'Sessão desconhecida' });
      }
    }
    // Pedido do Mercado?
    const { handleStripeSession } = require('./marketRoutes');
    const handled = await handleStripeSession(session, req);
    if (!handled && session.payment_status === 'paid') {
      const purchase = db.prepare('SELECT * FROM purchases WHERE stripe_session_id = ?').get(session.id);
      if (purchase) fulfillPurchase(purchase);
    }
  }

  res.json({ received: true });
});

// Página de volta do checkout: quem abre é o navegador, sem login — por isso vem antes do requireAuth
router.get('/return', (req, res) => {
  const state = { success: 'success', pending: 'pending' }[req.query.status] || 'cancel';
  const view = {
    success: { color: '#34C77B', title: 'Pagamento concluído!', text: 'Pode fechar esta janela e voltar pro SafeCord — clique em "Já paguei" lá.', icon: '<path d="M5 12.5 10 17.5 19 7"/>' },
    pending: { color: '#F0B429', title: 'Pagamento em processamento', text: 'Pix e boleto podem levar alguns minutos pra confirmar. Assim que cair, é só clicar em "Já paguei" no SafeCord.', icon: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>' },
    cancel: { color: '#8C9CB8', title: 'Pagamento não concluído', text: 'Nada foi cobrado. Pode fechar esta janela e tentar de novo no SafeCord.', icon: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-2"/>' },
  }[state];
  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SafeCord</title></head>
<body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:radial-gradient(ellipse at 50% 40%,#0E1A33 0%,#08101F 45%,#050A14 100%);color:#EEF3FB;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;padding:20px;box-sizing:border-box;">
  <div style="text-align:center;max-width:400px;padding:32px 28px;background:linear-gradient(180deg,rgba(22,34,58,.75),rgba(12,20,38,.8));border:1px solid rgba(80,150,255,.35);border-radius:22px;box-shadow:0 0 50px rgba(30,123,255,.2);">
    <div style="margin:0 auto 14px;width:56px;height:56px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:${view.color}22;">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="${view.color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${view.icon}</svg>
    </div>
    <h1 style="font-size:20px;margin:0 0 8px;">${view.title}</h1>
    <p style="color:#9FB0CC;font-size:14px;line-height:1.55;margin:0;">${view.text}</p>
  </div>
</body></html>`);
});

router.use(requireAuth);

router.get('/products', (req, res) => {
  const owned = new Set(
    db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ?').all(req.user.id).map((r) => r.badge_id)
  );
  const products = allProducts().map((p) => ({
    ...p,
    owned: p.kind === 'badge' ? owned.has(p.badge_id) : false,
  }));
  res.json({ products, stripeEnabled: stripeEnabled(), paymentsEnabled: stripeEnabled(), provider: payments.providerLabel() });
});

router.get('/purchases', (req, res) => {
  const purchases = db
    .prepare('SELECT * FROM purchases WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
    .all(req.user.id);
  res.json({ purchases });
});

// Cria a sessão de pagamento no Stripe e devolve a URL do checkout.
router.post('/checkout', async (req, res) => {
  const { productId } = req.body || {};
  const product = findProduct(productId);
  if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

  if (product.kind === 'badge') {
    const alreadyOwned = db
      .prepare('SELECT 1 FROM user_badges WHERE user_id = ? AND badge_id = ?')
      .get(req.user.id, product.badge_id);
    if (alreadyOwned) return res.status(409).json({ error: 'Você já tem essa insígnia' });
  }

  const purchaseId = uuidv4();

  if (!stripeEnabled()) {
    return res.status(503).json({
      error: 'Pagamentos indisponíveis: configure MERCADOPAGO_ACCESS_TOKEN no .env do servidor.',
    });
  }

  try {
    const checkout = await payments.createCheckout({
      reference: purchaseId,
      items: [{ title: `SafeCord — ${product.name}`, description: product.description, unitCents: product.amount_cents, quantity: 1 }],
      metadata: { kind: 'shop', userId: req.user.id, productId: product.id },
    });

    db.prepare(
      `INSERT INTO purchases (id, user_id, product_id, amount_cents, currency, status, stripe_session_id, payment_provider, created_at)
       VALUES (?, ?, ?, ?, 'brl', 'pending', ?, ?, ?)`
    ).run(purchaseId, req.user.id, product.id, product.amount_cents, checkout.providerRef, checkout.provider, Date.now());

    res.json({ checkoutUrl: checkout.url, purchaseId });
  } catch (err) {
    res.status(502).json({ error: `Não foi possível criar a cobrança: ${err.message}` });
  }
});

// Depois de voltar do checkout, o app chama isso pra saber se o pagamento caiu.
// Em produção quem confirma é o webhook; aqui também consultamos o Stripe direto,
// porque em teste local o webhook raramente está configurado.
router.post('/purchases/:purchaseId/confirm', async (req, res) => {
  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ? AND user_id = ?')
    .get(req.params.purchaseId, req.user.id);
  if (!purchase) return res.status(404).json({ error: 'Compra não encontrada' });

  if (purchase.status === 'paid') {
    return res.json({ status: 'paid', user: getPublicUser(req.user.id) });
  }

  if (stripeEnabled()) {
    try {
      const status = await payments.checkStatus({
        reference: purchase.id,
        providerRef: purchase.stripe_session_id,
        provider: purchase.payment_provider || undefined,
      });
      if (status === 'paid') {
        fulfillPurchase(purchase);
        return res.json({ status: 'paid', user: getPublicUser(req.user.id) });
      }
    } catch (err) {
      return res.status(502).json({ error: `Não foi possível checar o pagamento: ${err.message}` });
    }
  }

  res.json({ status: purchase.status, user: getPublicUser(req.user.id) });
});

// Página simples que o Stripe abre depois do pagamento — o app desktop só precisa
// que exista algo pra onde voltar.
module.exports = router;
module.exports.fulfillPurchaseById = (id) => {
  const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(id);
  if (purchase) fulfillPurchase(purchase);
  return Boolean(purchase);
};
