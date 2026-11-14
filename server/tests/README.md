# Testes de pagamento e do Mercado

Rodam contra o servidor ligado em `http://localhost:4000`, com o banco zerado.

**Mercado Pago (com um Mercado Pago falso, sem internet):**
```bash
node tests/fake-mercadopago.js &           # sobe o falso na porta 4999
rm -f safecord.db*
MERCADOPAGO_ACCESS_TOKEN=TEST-123 MERCADOPAGO_WEBHOOK_SECRET=segredo-webhook \
MERCADOPAGO_API_URL=http://localhost:4999 node src/index.js &
node tests/mercadopago.test.js
```

**Mercado (lojas, pedidos, repasses) no modo de pagamento simulado:**
```bash
rm -f safecord.db*
MARKET_DEV_PAYMENTS=1 ADMIN_EMAILS=admin@t.com node src/index.js &
node tests/market.test.js
```
