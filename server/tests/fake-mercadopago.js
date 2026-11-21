// Mercado Pago falso pros testes: imita /checkout/preferences, /v1/payments/search, /v1/payments/:id
// e, pro pagamento direto, /oauth/token (code + refresh, com PKCE) e /users/me das contas dos vendedores.
const http = require('http');
const crypto = require('crypto');
const prefs = []; const payments = []; let nextId = 1000;
const PLATFORM = 'TEST-123';
const CLIENT_ID = 'CID-1'; const CLIENT_SECRET = 'CSECRET-1';
const codes = new Map();   // code → { challenge, seller }
const sellers = new Map(); // sellerId → { id, nickname, identification, token, refresh }
let refreshes = 0; let nextSeller = 501;

function ownerOf(auth) {
  const token = String(auth || '').replace(/^Bearer /, '');
  if (token === PLATFORM) return 'platform';
  for (const s of sellers.values()) if (s.token === token) return s.id;
  return null;
}

http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    const url = new URL(req.url, 'http://x');
    const send = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
    if (url.pathname.startsWith('/__')) {
      if (url.pathname === '/__prefs') return send(200, prefs);
      if (url.pathname === '/__refreshes') return send(200, { refreshes });
      if (url.pathname === '/__pay') {
        const { reference, status, owner = 'platform', amount } = JSON.parse(body);
        const p = { id: nextId++, status, external_reference: reference, owner, transaction_amount: amount ?? 9999 };
        payments.push(p); return send(200, p);
      }
      if (url.pathname === '/__code') { // "o vendedor autorizou": gera um code pra esse desafio PKCE
        const { challenge, identification = null, expiresIn = 15552000 } = JSON.parse(body);
        const id = String(nextSeller++);
        sellers.set(id, { id, nickname: `VENDEDOR${id}`, identification, token: null, refresh: null, expiresIn });
        const code = `TG-${crypto.randomBytes(6).toString('hex')}`;
        codes.set(code, { challenge, seller: id });
        return send(200, { code, sellerId: id });
      }
    }
    if (req.method === 'POST' && url.pathname === '/oauth/token') {
      const f = Object.fromEntries(new URLSearchParams(body));
      if (f.client_id !== CLIENT_ID || f.client_secret !== CLIENT_SECRET) return send(401, { message: 'invalid client' });
      let seller;
      if (f.grant_type === 'authorization_code') {
        const c = codes.get(f.code);
        if (!c) return send(400, { message: 'invalid_grant' });
        codes.delete(f.code);
        const challenge = crypto.createHash('sha256').update(f.code_verifier || '').digest('base64url');
        if (challenge !== c.challenge) return send(400, { message: 'invalid code_verifier' });
        if (!f.redirect_uri?.endsWith('/api/payments/mercadopago/oauth/callback')) return send(400, { message: 'bad redirect_uri' });
        seller = sellers.get(c.seller);
      } else if (f.grant_type === 'refresh_token') {
        seller = [...sellers.values()].find((s) => s.refresh === f.refresh_token);
        if (!seller) return send(400, { message: 'invalid refresh' });
        refreshes += 1;
      } else return send(400, { message: 'unsupported_grant_type' });
      seller.token = `APP_USR-${seller.id}-${crypto.randomBytes(4).toString('hex')}`;
      seller.refresh = `TG-R-${crypto.randomBytes(6).toString('hex')}`;
      return send(200, { access_token: seller.token, refresh_token: seller.refresh, user_id: Number(seller.id), expires_in: seller.expiresIn, live_mode: false, public_key: `APP_USR-pk-${seller.id}` });
    }

    const owner = ownerOf(req.headers.authorization);
    if (!owner) return send(401, { message: 'invalid access token' });
    if (req.method === 'GET' && url.pathname === '/users/me') {
      const s = sellers.get(owner);
      return s ? send(200, { id: Number(s.id), nickname: s.nickname, identification: s.identification }) : send(200, { id: 1, nickname: 'SAFECORD' });
    }
    if (req.method === 'POST' && url.pathname === '/checkout/preferences') {
      const p = JSON.parse(body); const id = `pref_${prefs.length + 1}`;
      prefs.push({ ...p, id, owner, idempotency: req.headers['x-idempotency-key'] });
      if (!Array.isArray(p.items) || !p.items.every((i) => i.currency_id === 'BRL' && typeof i.unit_price === 'number' && Number.isInteger(i.quantity))) return send(400, { message: 'items inválidos' });
      if (p.marketplace_fee !== undefined && owner === 'platform') return send(400, { message: 'marketplace_fee exige token do vendedor' });
      return send(201, { id, init_point: `https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=${id}` });
    }
    if (req.method === 'GET' && url.pathname === '/v1/payments/search') {
      const ref = url.searchParams.get('external_reference');
      return send(200, { results: payments.filter((p) => p.external_reference === ref && p.owner === owner).reverse() });
    }
    const m = /^\/v1\/payments\/(\d+)$/.exec(url.pathname);
    if (req.method === 'GET' && m) {
      const p = payments.find((x) => String(x.id) === m[1] && x.owner === owner);
      return p ? send(200, p) : send(404, { message: 'not found' });
    }
    send(404, { message: 'rota desconhecida' });
  });
}).listen(4999, () => console.log('fake MP on 4999'));
