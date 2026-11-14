// Mercado Pago falso pros testes: imita /checkout/preferences, /v1/payments/search e /v1/payments/:id
const http = require('http');
const prefs = []; const payments = []; let nextId = 1000;
const TOKEN = 'TEST-123';
http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const send = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (url.pathname.startsWith('/__')) {
      if (url.pathname === '/__prefs') return send(200, prefs);
      if (url.pathname === '/__pay') { const { reference, status } = JSON.parse(body); const p = { id: nextId++, status, external_reference: reference }; payments.push(p); return send(200, p); }
    }
    if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(401, { message: 'invalid access token' });
    if (req.method === 'POST' && url.pathname === '/checkout/preferences') {
      const p = JSON.parse(body); const id = `pref_${prefs.length + 1}`;
      prefs.push({ ...p, id, idempotency: req.headers['x-idempotency-key'] });
      if (!Array.isArray(p.items) || !p.items.every((i) => i.currency_id === 'BRL' && typeof i.unit_price === 'number' && Number.isInteger(i.quantity))) return send(400, { message: 'items inválidos' });
      return send(201, { id, init_point: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${id}` });
    }
    if (req.method === 'GET' && url.pathname === '/v1/payments/search') {
      const ref = url.searchParams.get('external_reference');
      return send(200, { results: payments.filter((p) => p.external_reference === ref).reverse() });
    }
    const m = /^\/v1\/payments\/(\d+)$/.exec(url.pathname);
    if (req.method === 'GET' && m) { const p = payments.find((x) => String(x.id) === m[1]); return p ? send(200, p) : send(404, { message: 'not found' }); }
    send(404, { message: 'rota desconhecida' });
  });
}).listen(4999, () => console.log('fake MP on 4999'));
