const express = require('express');
const payments = require('../payments');

// Webhook do Mercado Pago: avisa quando um pagamento muda. Quem chama é o Mercado Pago
// (sem login). Nunca liberamos nada com base no corpo: resolveMercadoPagoWebhook consulta
// o pagamento na API e só devolve a referência se ele estiver APROVADO.
const router = express.Router();

router.post('/mercadopago/webhook', async (req, res) => {
  try {
    const result = await payments.resolveMercadoPagoWebhook(req);
    if (result.invalidSignature) return res.status(401).json({ error: 'Assinatura inválida' });
    if (result.reference) {
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

module.exports = router;
