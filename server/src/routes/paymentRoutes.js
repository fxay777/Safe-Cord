const express = require('express');
const db = require('../db');
const payments = require('../payments');
const mpConnect = require('../mpConnect');

// Webhook do Mercado Pago: avisa quando um pagamento muda. Quem chama é o Mercado Pago
// (sem login). Nunca liberamos nada com base no corpo: resolveMercadoPagoWebhook consulta
// o pagamento na API e só devolve a referência se ele estiver APROVADO.
const router = express.Router();

router.post('/mercadopago/webhook', async (req, res) => {
  try {
    const result = await payments.resolveMercadoPagoWebhook(req, { tokenFor: mpConnect.tokenForStore });
    if (result.invalidSignature) return res.status(401).json({ error: 'Assinatura inválida' });
    if (result.reference) {
      // Confere se o pagamento é mesmo desse pedido: mesma conta (do SafeCord ou da loja) e valor cheio
      const order = db.prepare('SELECT store_id, split, total_cents FROM orders WHERE id = ?').get(result.reference);
      if (order) {
        const rightAccount = order.split ? result.sellerTag === order.store_id : !result.sellerTag;
        if (!rightAccount || (result.amountCents && result.amountCents + 1 < order.total_cents)) {
          console.warn(`[mercadopago] pagamento ignorado pro pedido ${result.reference}: conta ou valor não batem`);
          return res.status(200).json({ received: true, ignored: true });
        }
      }
      // A referência é o id de um pedido do Mercado ou de uma compra da loja de insígnias
      const { fulfillOrderById } = require('./marketRoutes');
      const { fulfillPurchaseById } = require('./shopRoutes');
      if (!fulfillOrderById(result.reference, req)) fulfillPurchaseById(result.reference);
    }
    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook Mercado Pago:', err.message);
    // 500 faz o Mercado Pago tentar de novo mais tarde
    res.status(500).json({ error: 'Falha ao processar' });
  }
});

// Volta da conexão da conta Mercado Pago do vendedor (aberta no navegador, sem login do app)
router.get('/mercadopago/oauth/callback', async (req, res) => {
  const result = await mpConnect.finishConnect(req.query.code, req.query.state);
  if (result.userId) req.app.get('io')?.to(`user:${result.userId}`).emit('market:mp-connected', { ok: !result.error });
  const ok = !result.error;
  res.status(ok ? 200 : 400).type('html').send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>SafeCord</title>
<style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0B1220;color:#E8EEF8;font-family:system-ui,sans-serif}
.c{max-width:420px;padding:32px;text-align:center;background:#121B2E;border:1px solid #22304A;border-radius:22px}
.i{width:64px;height:64px;border-radius:32px;margin:0 auto 16px;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;background:${ok ? '#1E9E6A' : '#C2414B'}}
h1{font-size:20px;margin:0 0 8px}p{color:#9AA8C2;line-height:1.5;margin:0}</style></head>
<body><div class="c"><div class="i">${ok ? '✓' : '!'}</div><h1>${ok ? 'Conta conectada!' : 'Não deu pra conectar'}</h1>
<p>${ok ? `A partir de agora, o dinheiro das suas vendas cai direto na sua conta do Mercado Pago${result.nickname ? ` (${String(result.nickname).replace(/[<>&"]/g, '')})` : ''}. Pode fechar esta aba e voltar pro SafeCord.` : String(result.error).replace(/[<>&"]/g, '')}</p></div></body></html>`);
});

module.exports = router;
