// Soundboard: sons do servidor, permissões, duração, tocar na call. Servidor normal, banco zerado.
const fs = require('fs');
const path = require('path');
const { io } = require('socket.io-client');
const B = 'http://localhost:4000/api';
let n = 0, fails = 0;
const ok = (c, l) => { n++; console.log(`${n}) ${l}: ${c ? 'OK' : 'FALHOU'}`); if (!c) fails++; };
const req = async (m, p, body, t) => { const isForm = body instanceof FormData; const r = await fetch(B + p, { method: m, headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: body ? (isForm ? body : JSON.stringify(body)) : undefined }); let d = {}; try { d = await r.json(); } catch {} return { s: r.status, d }; };
const rnd = () => Math.random().toString(36).slice(2, 7);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function user(name) {
  const username = name + rnd();
  const r = await req('POST', '/auth/register', { username, password: 'senha123', email: `${username}@t.com` });
  await req('POST', '/auth/verify-email', { code: r.d.verification?.devCode }, r.d.token);
  const s = io('http://localhost:4000', { auth: { token: r.d.token }, transports: ['websocket'] });
  await new Promise((res) => s.on('connect', res));
  const heard = []; s.on('voice:sound', (p) => heard.push(p));
  return { token: r.d.token, id: r.d.user.id, username, tag: r.d.user.tag, sock: s, heard };
}
const form = (file, fields) => { const fd = new FormData(); fd.append('sound', new Blob([fs.readFileSync(path.join(__dirname, 'fixtures', file))], { type: 'audio/mpeg' }), file); for (const [k, v] of Object.entries(fields)) fd.append(k, v); return fd; };
const join = (u, channelId) => new Promise((r) => u.sock.emit('voice:join', { channelId }, r));
const play = (u, soundId) => new Promise((r) => u.sock.emit('voice:soundboard', { soundId }, r));

(async () => {
  const dono = await user('dono'), ana = await user('ana'), beto = await user('beto');
  const srv = (await req('POST', '/servers', { name: 'Som' }, dono.token)).d.server;
  for (const u of [ana, beto]) await req('POST', '/servers/join', { inviteCode: srv.invite_code }, u.token);
  const voz = srv.channels.find((c) => c.type === 'voice');

  const list0 = (await req('GET', `/servers/${srv.id}/sounds`, null, ana.token)).d;
  ok(list0.sounds.length === 8 && list0.sounds.every((s) => s.is_default) && list0.canPlay && !list0.canManage, '8 sons padrão; membro pode tocar mas não gerenciar');
  const mp3 = await fetch(`http://localhost:4000${list0.sounds[0].file}`);
  ok(mp3.status === 200 && (await mp3.arrayBuffer()).byteLength > 5000, 'arquivo do som padrão é servido');

  ok((await req('POST', `/servers/${srv.id}/sounds`, form('beep.mp3', { name: 'Bip' }), ana.token)).s === 403, 'membro comum não adiciona som');
  const longo = await req('POST', `/servers/${srv.id}/sounds`, form('longo.mp3', { name: 'Longo' }), dono.token);
  ok(longo.s === 400 && /no máximo 5 segundos/.test(longo.d.error), 'som de 7s é recusado (máx. 5s)');
  const up = await req('POST', `/servers/${srv.id}/sounds`, form('beep.mp3', { name: 'Bip do dono', volume: '60', color: '#E5484D' }), dono.token);
  ok(up.s === 201 && up.d.sound.duration_ms > 1000 && up.d.sound.duration_ms < 1500 && up.d.sound.volume === 60, 'dono adiciona som de 1,2s com volume 60');
  const bip = up.d.sound;

  // tocar
  ok((await play(ana, 'default:moeda')).error, 'fora da call não toca');
  await join(ana, voz.id); await join(beto, voz.id);
  const p1 = await play(ana, 'default:moeda'); await wait(200);
  ok(p1.ok && beto.heard.some((h) => h.soundId === 'default:moeda' && h.by.id === ana.id) && ana.heard.length === 1, 'Ana toca "Moeda" e todo mundo da call ouve (ela também)');
  ok((await play(ana, bip.id)).error?.includes('Calma'), 'tocar de novo em seguida: espera (anti-spam)');
  await wait(2600);
  const p2 = await play(ana, bip.id); await wait(200);
  ok(p2.ok && beto.heard.some((h) => h.soundId === bip.id && h.volume === 60), 'som do servidor toca com o volume definido');

  // só cargos
  ok((await req('PUT', `/servers/${srv.id}/sounds/settings`, { everyone: false }, ana.token)).s === 403, 'membro não muda quem pode tocar');
  await req('PUT', `/servers/${srv.id}/sounds/settings`, { everyone: false }, dono.token);
  await wait(2600);
  ok((await play(ana, 'default:moeda')).error?.includes('alguns cargos'), 'soundboard só pra cargos: Ana não toca');
  const role = (await req('POST', `/servers/${srv.id}/roles`, { name: 'DJ', color: '#B794FF', permissions: ['gerenciar_soundboard'] }, dono.token)).d.role;
  await req('PUT', `/servers/${srv.id}/roles/members/${ana.id}`, { roleIds: [role.id] }, dono.token);
  ok((await play(ana, 'default:moeda')).ok, 'com o cargo DJ ela toca de novo');
  await req('PUT', `/servers/${srv.id}/sounds/settings`, { everyone: true, defaults: false }, dono.token);
  ok((await req('GET', `/servers/${srv.id}/sounds`, null, beto.token)).d.sounds.length === 1, 'sons padrão desligados: só aparece o do servidor');
  await wait(2600);
  ok((await play(beto, 'default:buzina')).error, 'som padrão desligado não toca');

  // som de outro servidor não toca aqui
  const outro = (await req('POST', '/servers', { name: 'Outro' }, beto.token)).d.server;
  const alheio = (await req('POST', `/servers/${outro.id}/sounds`, form('beep.mp3', { name: 'Alheio' }), beto.token)).d.sound;
  ok((await play(beto, alheio.id)).error, 'som de outro servidor não toca nessa call');

  // chamada privada: só os padrão
  const fr = await req('POST', '/friends/request', { username: `${beto.username}#${beto.tag}` }, ana.token);
  await req('POST', `/friends/${fr.d.friendship_id}/accept`, null, beto.token);
  const conv = (await req('POST', `/dms/${beto.id}`, null, ana.token)).d.conversation;
  await join(ana, `dm:${conv.id}`); await wait(2600);
  ok((await play(ana, 'default:sino')).ok, 'na chamada privada os sons padrão funcionam');
  await wait(2600);
  ok((await play(ana, bip.id)).error, 'na chamada privada som de servidor não toca');

  const del = await req('DELETE', `/servers/${srv.id}/sounds/${bip.id}`, null, dono.token);
  ok(del.s === 200 && (await req('GET', `/servers/${srv.id}/sounds`, null, dono.token)).d.sounds.length === 0, 'dono exclui o som');

  [dono, ana, beto].forEach((u) => u.sock.disconnect());
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
  process.exit(0);
})();
