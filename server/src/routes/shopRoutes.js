const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../auth');
const { getPublicUser, grantBadge } = require('../userUtils');

const router = express.Router();

// --- Stripe (modo teste) ---
// A chave vem do .env (STRIPE_SECRET_KEY, use a sk_test_...). Sem chave, a loja continua
// navegável e as rotas respondem com um erro claro em vez de quebrar o servidor.
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
const APP_URL = process.env.APP_URL || 'http://localhost:4000';

let stripe = null;
if (STRIPE_SECRET_KEY) {
  try {
    stripe = require('stripe')(STRIPE_SECRET_KEY);
  } catch (e) {
    console.warn('Stripe não pôde ser carregado:', e.message);
  }
}
const stripeEnabled = () => Boolean(stripe);

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
  if (!stripeEnabled()) return res.status(503).json({ error: 'Stripe não configurado' });

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

router.use(requireAuth);

router.get('/products', (req, res) => {
  const owned = new Set(
    db.prepare('SELECT badge_id FROM user_badges WHERE user_id = ?').all(req.user.id).map((r) => r.badge_id)
  );
  const products = allProducts().map((p) => ({
    ...p,
    owned: p.kind === 'badge' ? owned.has(p.badge_id) : false,
  }));
  res.json({ products, stripeEnabled: stripeEnabled() });
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
      error: 'Pagamentos indisponíveis: configure STRIPE_SECRET_KEY no .env do servidor (use a chave sk_test_ do modo teste).',
    });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'brl',
          unit_amount: product.amount_cents,
          product_data: { name: `SafeCord — ${product.name}`, description: product.description },
        },
        quantity: 1,
      }],
      success_url: `${APP_URL}/api/shop/return?purchase=${purchaseId}&status=success`,
      cancel_url: `${APP_URL}/api/shop/return?purchase=${purchaseId}&status=cancel`,
      metadata: { purchaseId, userId: req.user.id, productId: product.id },
    });

    db.prepare(
      `INSERT INTO purchases (id, user_id, product_id, amount_cents, currency, status, stripe_session_id, created_at)
       VALUES (?, ?, ?, ?, 'brl', 'pending', ?, ?)`
    ).run(purchaseId, req.user.id, product.id, product.amount_cents, session.id, Date.now());

    res.json({ checkoutUrl: session.url, purchaseId });
  } catch (err) {
    res.status(502).json({ error: `Stripe recusou a cobrança: ${err.message}` });
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

  if (stripeEnabled() && purchase.stripe_session_id) {
    try {
      const session = await stripe.checkout.sessions.retrieve(purchase.stripe_session_id);
      if (session.payment_status === 'paid') {
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
router.get('/return', (req, res) => {
  const ok = req.query.status === 'success';
  res.set('Content-Type', 'text/html; charset=utf-8').send(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>SafeCord</title></head>
<body style="margin:0;display:flex;align-items:center;justify-content:center;height:100vh;background:#0B0F14;color:#EAF2F1;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
  <div style="text-align:center;max-width:380px;padding:28px;background:#161C25;border:1px solid #262E3B;border-radius:20px;">
    <div style="margin:0 auto 12px;width:52px;height:52px;border-radius:16px;display:flex;align-items:center;justify-content:center;background:${ok ? 'rgba(52,211,153,0.14)' : 'rgba(159,176,174,0.12)'};">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="${ok ? '#34D399' : '#9FB0AE'}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        ${ok ? '<path d="M5 12.5 10 17.5 19 7"/>' : '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-2"/>'}
      </svg>
    </div>
    <h1 style="font-size:19px;margin:0 0 8px;">${ok ? 'Pagamento concluído!' : 'Compra cancelada'}</h1>
    <p style="color:#9FB0AE;font-size:13.5px;line-height:1.55;margin:0;">
      ${ok ? 'Pode fechar esta janela e voltar pro SafeCord — sua compra já está liberada.' : 'Nada foi cobrado. Pode fechar esta janela.'}
    </p>
  </div>
</body></html>`);
});

module.exports = router;
