// Regras das chamadas: quem entra, limite de pessoas, chamadas privadas. Servidor normal, banco zerado.
const { io } = require('socket.io-client');
const B = 'http://localhost:4000/api';
let n = 0, fails = 0;
const ok = (c, l) => { n++; console.log(`${n}) ${l}: ${c ? 'OK' : 'FALHOU'}`); if (!c) fails++; };
const req = async (m, p, body, t) => { const r = await fetch(B + p, { method: m, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: body ? JSON.stringify(body) : undefined }); let d = {}; try { d = await r.json(); } catch {} return { s: r.status, d }; };
const rnd = () => Math.random().toString(36).slice(2, 7);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function user(name) {
  const username = name + rnd();
  const r = await req('POST', '/auth/register', { username, password: 'senha123', email: `${username}@t.com` });
  await req('POST', '/auth/verify-email', { code: r.d.verification?.devCode }, r.d.token);
  const s = io('http://localhost:4000', { auth: { token: r.d.token }, transports: ['websocket'] });
  await new Promise((res) => s.on('connect', res));
  const events = [];
  for (const e of ['voice:signal', 'dm:call:incoming', 'dm:call:state', 'dm:call:declined', 'voice:peer-joined']) s.on(e, (p) => events.push([e, p]));
  return { token: r.d.token, id: r.d.user.id, username, tag: r.d.user.tag, sock: s, events };
}
const join = (u, channelId) => new Promise((r) => u.sock.emit('voice:join', { channelId }, r));
const check = (u, channelId) => new Promise((r) => u.sock.emit('voice:join-check', { channelId }, r));
const leave = (u) => { u.sock.emit('voice:leave'); return wait(150); };

(async () => {
  const dono = await user('dono'), ana = await user('ana'), beto = await user('beto'), fora = await user('fora');
  const srv = (await req('POST', '/servers', { name: 'Voz' }, dono.token)).d.server;
  for (const u of [ana, beto]) await req('POST', '/servers/join', { inviteCode: srv.invite_code }, u.token);
  const voz = srv.channels.find((c) => c.type === 'voice');
  const texto = srv.channels.find((c) => c.type === 'text');

  ok((await join(fora, voz.id)).error, 'quem não é do servidor não entra no canal de voz');
  ok((await join(ana, texto.id)).error, 'canal de texto não vira sala de voz');
  ok((await join(ana, 'id-inventado')).error, 'sala inventada é recusada');

  // limite
  ok((await req('PUT', `/servers/${srv.id}/channels/${voz.id}`, { user_limit: 150 }, dono.token)).s === 400, 'limite acima de 99 é recusado');
  ok((await req('PUT', `/servers/${srv.id}/channels/${voz.id}`, { user_limit: 1, bitrate: 96 }, ana.token)).s === 403, 'membro comum não muda o limite');
  const up = await req('PUT', `/servers/${srv.id}/channels/${voz.id}`, { user_limit: 1, bitrate: 96 }, dono.token);
  ok(up.d.channel?.user_limit === 1 && up.d.channel?.bitrate === 96, 'dono define limite 1 e áudio 96 kbps');
  const j1 = await join(ana, voz.id);
  ok(j1.ok && j1.userLimit === 1 && j1.bitrate === 96, 'Ana entra e recebe limite/qualidade');
  const c2 = await check(beto, voz.id);
  ok(c2.error === 'Canal cheio (1/1)', 'checagem antes do microfone já avisa "Canal cheio (1/1)"');
  ok((await join(beto, voz.id)).error, 'Beto não entra com o canal cheio');
  ok((await join(dono, voz.id)).ok, 'quem gerencia canais passa do limite (como no Discord)');
  await leave(dono); await leave(ana);
  ok((await join(beto, voz.id)).ok, 'liberou vaga, Beto entra');

  // sinalização só dentro da sala
  fora.sock.emit('voice:signal', { to: 'qualquer', signal: { type: 'offer' } });
  ana.sock.emit('voice:signal', { to: [...beto.sock.id].join(''), signal: { type: 'offer', sdp: 'x' } }); await wait(200);
  ok(!beto.events.some(([e]) => e === 'voice:signal'), 'quem está fora da sala não manda sinal pra quem está dentro');
  await leave(beto);

  // chamadas privadas
  const fr = await req('POST', '/friends/request', { username: `${beto.username}#${beto.tag}` }, ana.token);
  await req('POST', `/friends/${fr.d.friendship_id}/accept`, null, beto.token);
  const conv = (await req('POST', `/dms/${beto.id}`, null, ana.token)).d.conversation;
  const room = `dm:${conv.id}`;
  ok((await join(fora, room)).error, 'quem não está na conversa não entra na chamada privada');
  ana.sock.emit('dm:call:ring', { conversationId: conv.id }); await wait(200);
  ok(!beto.events.some(([e]) => e === 'dm:call:incoming'), 'não dá pra "tocar" sem estar na chamada');
  ok((await join(ana, room)).ok, 'Ana entra na chamada privada');
  ana.sock.emit('dm:call:ring', { conversationId: conv.id }); await wait(250);
  const inc = beto.events.find(([e]) => e === 'dm:call:incoming');
  ok(inc && inc[1].caller.id === ana.id && !inc[1].isGroup, 'Beto recebe a chamada da Ana');
  ok(beto.events.some(([e, p]) => e === 'dm:call:state' && p.conversationId === conv.id && p.participants.length === 1), 'Beto vê que a conversa está "em chamada"');
  beto.sock.emit('dm:call:decline', { conversationId: conv.id }); await wait(200);
  ok(ana.events.some(([e, p]) => e === 'dm:call:declined' && p.userId === beto.id), 'Ana fica sabendo que o Beto recusou');
  ok((await join(beto, room)).ok, 'Beto entra depois mesmo assim');
  await wait(150);
  ok(ana.events.some(([e, p]) => e === 'voice:peer-joined'), 'Ana vê o Beto entrar');
  await leave(ana); await leave(beto); await wait(200);
  ok(ana.events.filter(([e]) => e === 'dm:call:state').at(-1)[1].participants.length === 0, 'chamada vazia: some o "em chamada"');

  [dono, ana, beto, fora].forEach((u) => u.sock.disconnect());
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
  process.exit(0);
})();
