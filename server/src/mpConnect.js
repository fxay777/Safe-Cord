const crypto = require('crypto');
const db = require('./db');
const { encryptJSON, decryptJSON } = require('./secureData');
const payments = require('./payments');
const kyc = require('./sellerVerification');

// ─── Conectar a conta Mercado Pago do vendedor (OAuth) ──────────────────────
// Com a conta conectada, cada venda é cobrada no nome do vendedor e o dinheiro cai
// direto pra ele; o Mercado Pago separa a taxa do SafeCord (marketplace_fee) sozinho.
//
// Precisa de uma aplicação "Marketplace" no painel de desenvolvedores do Mercado Pago:
//   MERCADOPAGO_CLIENT_ID e MERCADOPAGO_CLIENT_SECRET (credenciais da aplicação),
//   e a URL de redirecionamento cadastrada lá igual a: APP_URL + /api/payments/mercadopago/oauth/callback

const CLIENT_ID = process.env.MERCADOPAGO_CLIENT_ID || '';
const CLIENT_SECRET = process.env.MERCADOPAGO_CLIENT_SECRET || '';
const AUTH_URL = (process.env.MERCADOPAGO_AUTH_URL || 'https://auth.mercadopago.com.br').replace(/\/$/, '');
const REDIRECT_URI = `${payments.APP_URL}/api/payments/mercadopago/oauth/callback`;
const STATE_TTL_MS = 10 * 60 * 1000;
const REFRESH_BEFORE_MS = 7 * 86400000; // renova quando faltar uma semana

function enabled() {
  return Boolean(CLIENT_ID && CLIENT_SECRET && payments.provider() === 'mercadopago');
}

async function oauthToken(params) {
  const res = await fetch(`${payments.MP_API}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params }).toString(),
  });
  let data = {};
  try { data = await res.json(); } catch { /* vazio */ }
  if (!res.ok || !data.access_token) throw new Error(data.message || data.error_description || data.error || `HTTP ${res.status}`);
  return data;
}

/** Link pra mandar o vendedor autorizar. Usa PKCE e um state de uso único. */
function startConnect(userId) {
  if (!enabled()) throw new Error('Pagamento direto não está configurado no servidor');
  const state = crypto.randomBytes(24).toString('base64url');
  const verifier = crypto.randomBytes(48).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  db.prepare('DELETE FROM mp_oauth_states WHERE user_id = ? OR created_at < ?').run(userId, Date.now() - STATE_TTL_MS);
  db.prepare('INSERT INTO mp_oauth_states (state, user_id, code_verifier, created_at) VALUES (?, ?, ?, ?)').run(state, userId, verifier, Date.now());
  const q = new URLSearchParams({
    client_id: CLIENT_ID, response_type: 'code', platform_id: 'mp', state, redirect_uri: REDIRECT_URI,
    code_challenge: challenge, code_challenge_method: 'S256',
  });
  return `${AUTH_URL}/authorization?${q.toString()}`;
}

/** Volta do Mercado Pago: troca o code pelo token e guarda (criptografado). */
async function finishConnect(code, state) {
  const row = state && db.prepare('SELECT * FROM mp_oauth_states WHERE state = ?').get(String(state));
  if (!row) return { error: 'Link expirado ou já usado. Volte no SafeCord e clique em conectar de novo.' };
  db.prepare('DELETE FROM mp_oauth_states WHERE state = ?').run(row.state); // uso único
  if (Date.now() - row.created_at > STATE_TTL_MS) return { error: 'Link expirado. Volte no SafeCord e tente de novo.' };
  if (!code) return { error: 'Você não autorizou a conexão.' };

  let tok;
  try {
    tok = await oauthToken({ grant_type: 'authorization_code', code: String(code), redirect_uri: REDIRECT_URI, code_verifier: row.code_verifier });
  } catch (err) {
    return { error: `O Mercado Pago recusou a conexão (${err.message}).` };
  }

  // A conta precisa ser de quem foi verificado (mesmo CPF/CNPJ) — evita receber em conta de terceiro
  let me = {};
  try { me = await payments.mpRequest('GET', '/users/me', null, tok.access_token); } catch { /* segue sem os dados */ }
  const idNumber = String(me?.identification?.number || '').replace(/\D/g, '');
  const data = kyc.readData(kyc.getRow(row.user_id));
  const allowed = [data.personal?.cpf, data.business?.cnpj].filter(Boolean);
  if (idNumber && allowed.length && !allowed.includes(idNumber)) {
    return { error: 'Essa conta do Mercado Pago está em outro CPF/CNPJ. Conecte a conta que está no seu nome (o mesmo da verificação).', userId: row.user_id };
  }

  save(row.user_id, tok, me);
  return { userId: row.user_id, nickname: me?.nickname || null };
}

function save(userId, tok, me = null) {
  const tokens = { access_token: tok.access_token, refresh_token: tok.refresh_token || null, public_key: tok.public_key || null };
  const expires = Date.now() + (Number(tok.expires_in) || 15552000) * 1000;
  const existing = db.prepare('SELECT * FROM seller_mp_accounts WHERE user_id = ?').get(userId);
  if (existing) {
    db.prepare(`UPDATE seller_mp_accounts SET mp_user_id = ?, nickname = COALESCE(?, nickname), tokens_enc = ?, expires_at = ?,
      live_mode = ?, status = 'active', refreshed_at = ? WHERE user_id = ?`)
      .run(String(tok.user_id || existing.mp_user_id), me?.nickname || null, encryptJSON(tokens), expires, tok.live_mode ? 1 : 0, Date.now(), userId);
  } else {
    db.prepare(`INSERT INTO seller_mp_accounts (user_id, mp_user_id, nickname, tokens_enc, expires_at, live_mode, connected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(userId, String(tok.user_id || ''), me?.nickname || null, encryptJSON(tokens), expires, tok.live_mode ? 1 : 0, Date.now());
  }
  kyc.ensureRow(userId);
  db.prepare("UPDATE seller_verifications SET payout_mode = 'mercadopago', mp_user_id = ?, mp_connected_at = ? WHERE user_id = ?")
    .run(String(tok.user_id || ''), Date.now(), userId);
}

/** Token válido do vendedor (renova sozinho perto de vencer). null = sem pagamento direto agora. */
async function sellerToken(userId) {
  if (!enabled()) return null;
  const acc = db.prepare("SELECT * FROM seller_mp_accounts WHERE user_id = ? AND status = 'active'").get(userId);
  if (!acc) return null;
  const tokens = decryptJSON(acc.tokens_enc, null);
  if (!tokens?.access_token) return null;
  if (acc.expires_at - Date.now() > REFRESH_BEFORE_MS) return tokens.access_token;
  if (!tokens.refresh_token) {
    if (acc.expires_at > Date.now()) return tokens.access_token;
    markExpired(userId);
    return null;
  }
  try {
    const tok = await oauthToken({ grant_type: 'refresh_token', refresh_token: tokens.refresh_token });
    save(userId, tok);
    return tok.access_token;
  } catch (err) {
    console.warn(`[mercadopago] não renovou o token do vendedor ${userId}: ${err.message}`);
    if (acc.expires_at > Date.now()) return tokens.access_token; // ainda vale; tenta de novo depois
    markExpired(userId);
    return null;
  }
}

function markExpired(userId) {
  db.prepare("UPDATE seller_mp_accounts SET status = 'expired' WHERE user_id = ?").run(userId);
  db.prepare("UPDATE seller_verifications SET payout_mode = 'manual' WHERE user_id = ?").run(userId);
}

function disconnect(userId) {
  db.prepare('DELETE FROM seller_mp_accounts WHERE user_id = ?').run(userId);
  db.prepare("UPDATE seller_verifications SET payout_mode = 'manual', mp_user_id = NULL, mp_connected_at = NULL WHERE user_id = ?").run(userId);
}

function statusFor(userId) {
  const acc = db.prepare('SELECT mp_user_id, nickname, status, connected_at, expires_at, live_mode FROM seller_mp_accounts WHERE user_id = ?').get(userId);
  return {
    available: enabled(),
    connected: Boolean(acc && acc.status === 'active'),
    expired: acc?.status === 'expired',
    nickname: acc?.nickname || null,
    mp_user_id: acc?.mp_user_id || null,
    connected_at: acc?.connected_at || null,
    test_account: acc ? !acc.live_mode : false,
  };
}

/** Pro webhook: a notificação vem com ?s=<loja>; achamos o token do dono dela. */
async function tokenForStore(storeId) {
  const store = db.prepare('SELECT owner_id FROM stores WHERE id = ?').get(storeId);
  return store ? sellerToken(store.owner_id) : null;
}

module.exports = { enabled, startConnect, finishConnect, sellerToken, disconnect, statusFor, tokenForStore, REDIRECT_URI };
