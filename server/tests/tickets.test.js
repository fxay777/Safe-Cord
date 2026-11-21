// Tickets sem bot + privacidade de canais. Servidor normal, banco zerado.
const { io } = require('socket.io-client');
const B = 'http://localhost:4000/api';
let n = 0, fails = 0;
const ok = (c, l) => { n++; console.log(`${n}) ${l}: ${c ? 'OK' : 'FALHOU'}`); if (!c) fails++; };
const req = async (m, p, body, t, raw) => {
  const r = await fetch(B + p, { method: m, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (raw) return r;
  let d = {}; try { d = await r.json(); } catch {} return { s: r.status, d };
};
const rnd = () => Math.random().toString(36).slice(2, 7);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function user(name) {
  const username = name + rnd();
  const r = await req('POST', '/auth/register', { username, password: 'senha123', email: `${username}@t.com` });
  await req('POST', '/auth/verify-email', { code: r.d.verification?.devCode }, r.d.token);
  const s = io('http://localhost:4000', { auth: { token: r.d.token }, transports: ['websocket'] });
  await new Promise((res) => s.on('connect', res));
  const got = [];
  s.on('message:new', (m) => got.push(m));
  const events = [];
  for (const e of ['channel:upsert', 'channel:removed', 'ticket:opened', 'message:rejected']) s.on(e, (p) => events.push([e, p]));
  return { token: r.d.token, id: r.d.user.id, username, sock: s, got, events };
}
const channelsOf = async (u, serverId) => ((await req('GET', '/servers', null, u.token)).d.servers.find((s) => s.id === serverId)?.channels) || [];

(async () => {
  const dono = await user('dono'), ana = await user('ana'), beto = await user('beto'), sup = await user('sup'), fora = await user('fora');
  const srv = (await req('POST', '/servers', { name: 'Loja do Dono' }, dono.token)).d.server;
  for (const u of [ana, beto, sup]) await req('POST', '/servers/join', { inviteCode: srv.invite_code }, u.token);
  const geral = srv.channels.find((c) => c.type === 'text');

  // ── privacidade básica (bug antigo)
  dono.sock.emit('message:send', { channelId: geral.id, content: 'olá geral' }); await wait(300);
  ok((await req('GET', `/messages/${geral.id}`, null, fora.token)).s === 404, 'quem não é do servidor não lê o histórico do canal');
  fora.sock.emit('channel:join', geral.id); await wait(150);
  dono.sock.emit('message:send', { channelId: geral.id, content: 'segredo' }); await wait(300);
  ok(!fora.got.some((m) => m.content === 'segredo'), 'quem não é do servidor não escuta o canal pelo socket');
  ok((await req('GET', `/messages/${geral.id}`, null, ana.token)).d.messages.length === 2, 'membro lê normalmente');

  // ── painel
  const role = (await req('POST', `/servers/${srv.id}/roles`, { name: 'Suporte', color: '#4CD6A0', permissions: [] }, dono.token)).d.role;
  await req('PUT', `/servers/${srv.id}/roles/members/${sup.id}`, { roleIds: [role.id] }, dono.token);
  const panelBody = {
    channel_id: geral.id, title: 'Central de ajuda', description: 'Abra um ticket pra falar com a equipe', staff_role_ids: [role.id],
    welcome_message: 'Oi! Já já alguém da equipe te responde.',
    options: [
      { label: 'Suporte', description: 'Dúvidas e problemas', icon: 'help', questions: [{ label: 'Qual o seu problema?', required: true, long: true }, { label: 'Número do pedido', required: false }] },
      { label: 'Denúncia', icon: 'alert', color: '#E5484D' },
    ],
  };
  ok((await req('POST', `/servers/${srv.id}/tickets/panels`, panelBody, ana.token)).s === 403, 'membro comum não cria painel');
  ok((await req('POST', `/servers/${srv.id}/tickets/panels`, { ...panelBody, options: [] }, dono.token)).s === 400, 'painel sem botões é recusado');
  const pr = await req('POST', `/servers/${srv.id}/tickets/panels`, panelBody, dono.token);
  ok(pr.s === 201 && pr.d.panel.options.length === 2 && pr.d.createdCategory, 'dono cria painel (e a categoria Tickets)');
  const panel = pr.d.panel;
  await wait(300);
  ok(ana.got.some((m) => m.kind === 'ticket_panel' && m.meta.panelId === panel.id), 'cartão do painel chega no canal em tempo real');
  const hist = (await req('GET', `/messages/${geral.id}`, null, ana.token)).d.messages;
  ok(hist.some((m) => m.kind === 'ticket_panel' && m.meta.panelId === panel.id), 'cartão do painel fica no histórico');

  // ── abrir
  const optSup = panel.options[0].id;
  ok((await req('POST', `/servers/${srv.id}/tickets/open`, { panelId: panel.id, optionId: optSup, answers: [''] }, ana.token)).s === 400, 'pergunta obrigatória sem resposta é recusada');
  ok((await req('POST', `/servers/${srv.id}/tickets/open`, { panelId: panel.id, optionId: optSup, answers: ['x'] }, fora.token)).s === 403, 'quem não é do servidor não abre ticket');
  const op = await req('POST', `/servers/${srv.id}/tickets/open`, { panelId: panel.id, optionId: optSup, answers: ['Meu pedido não chegou', '#123'] }, ana.token);
  ok(op.s === 201 && op.d.channel.name === 'ticket-0001' && op.d.ticket.number === 1, 'ticket aberto: canal ticket-0001');
  const tk = op.d.ticket, tch = op.d.channel;
  await wait(400);
  ok((await req('POST', `/servers/${srv.id}/tickets/open`, { panelId: panel.id, optionId: optSup, answers: ['de novo'] }, ana.token)).d.channelId === tch.id, 'segundo ticket no mesmo painel é barrado e aponta pro aberto');

  // ── quem vê
  ok((await channelsOf(ana, srv.id)).some((c) => c.id === tch.id && c.ticket?.number === 1), 'quem abriu vê o canal');
  ok((await channelsOf(sup, srv.id)).some((c) => c.id === tch.id), 'staff do painel vê o canal');
  ok((await channelsOf(dono, srv.id)).some((c) => c.id === tch.id), 'dono vê o canal');
  ok(!(await channelsOf(beto, srv.id)).some((c) => c.id === tch.id), 'outro membro NÃO vê o canal');
  ok((await req('GET', `/messages/${tch.id}`, null, beto.token)).s === 404, 'outro membro não lê o histórico do ticket');
  ok(sup.events.some(([e, p]) => e === 'ticket:opened' && p.ticket.number === 1) && !beto.events.some(([e]) => e === 'ticket:opened'), 'staff é avisada; outros não');
  const first = (await req('GET', `/messages/${tch.id}`, null, ana.token)).d.messages[0];
  ok(first?.kind === 'ticket_event' && first.meta.event === 'opened' && first.meta.answers[0].answer === 'Meu pedido não chegou' && first.meta.welcome.startsWith('Oi'), 'primeira mensagem traz as respostas e a boas-vindas');

  // ── conversa
  for (const u of [ana, sup, beto]) u.sock.emit('channel:join', tch.id);
  await wait(150);
  ana.sock.emit('message:send', { channelId: tch.id, content: 'alguém aí?' }); await wait(350);
  ok(sup.got.some((m) => m.content === 'alguém aí?') && !beto.got.some((m) => m.content === 'alguém aí?'), 'mensagem do ticket chega na staff e não em outros membros');
  beto.sock.emit('message:send', { channelId: tch.id, content: 'intrometido' }); await wait(300);
  ok(!(await req('GET', `/messages/${tch.id}`, null, ana.token)).d.messages.some((m) => m.content === 'intrometido'), 'outro membro não consegue mandar no ticket');

  // ── ações
  const base = `/servers/${srv.id}/tickets/${tk.id}`;
  ok((await req('POST', `${base}/claim`, null, ana.token)).s === 403, 'quem abriu não "assume" o próprio ticket');
  ok((await req('POST', `${base}/claim`, null, beto.token)).s === 404, 'quem não vê o ticket nem acha ele');
  const cl = await req('POST', `${base}/claim`, null, sup.token);
  ok(cl.d.ticket?.claimed_by?.id === sup.id, 'staff assume o atendimento');
  const add = await req('POST', `${base}/members`, { userId: beto.id }, sup.token);
  ok(add.s === 200 && (await channelsOf(beto, srv.id)).some((c) => c.id === tch.id), 'staff adiciona alguém e essa pessoa passa a ver');
  await wait(200);
  ok(beto.events.some(([e, p]) => e === 'channel:upsert' && p.channel.id === tch.id), 'pessoa adicionada recebe o canal na hora');
  await req('DELETE', `${base}/members/${beto.id}`, null, sup.token); await wait(200);
  ok(!(await channelsOf(beto, srv.id)).some((c) => c.id === tch.id) && beto.events.some(([e, p]) => e === 'channel:removed' && p.channelId === tch.id), 'removida, perde o acesso na hora');
  beto.got.length = 0;
  sup.sock.emit('message:send', { channelId: tch.id, content: 'só pra ana' }); await wait(300);
  ok(!beto.got.some((m) => m.content === 'só pra ana'), 'quem foi removido não recebe mais as mensagens, mesmo com o canal aberto');

  const close = await req('POST', `${base}/close`, { reason: 'Resolvido, pedido reenviado' }, ana.token);
  ok(close.d.ticket?.status === 'closed', 'quem abriu fecha o ticket');
  ana.sock.emit('message:send', { channelId: tch.id, content: 'depois de fechado' }); await wait(300);
  ok(ana.events.some(([e]) => e === 'message:rejected') && !(await req('GET', `/messages/${tch.id}`, null, ana.token)).d.messages.some((m) => m.content === 'depois de fechado'), 'ticket fechado não aceita mensagem');
  ok((await req('POST', `${base}/reopen`, null, ana.token)).s === 403, 'quem abriu não reabre (só staff)');
  ok((await req('POST', `${base}/reopen`, null, sup.token)).d.ticket?.status === 'open', 'staff reabre');
  ok((await req('DELETE', base, null, sup.token)).s === 409, 'não dá pra excluir ticket aberto');
  await req('POST', `${base}/close`, {}, sup.token);

  const tr = await req('GET', `${base}/transcript`, null, sup.token, true);
  const text = await tr.text();
  ok(tr.status === 200 && /ticket-0001\.txt/.test(tr.headers.get('content-disposition')) && text.includes('alguém aí?') && text.includes('Meu pedido não chegou') && text.includes('assumiu'), 'transcrição em .txt com conversa, respostas e eventos');
  ok((await req('GET', `${base}/transcript`, null, beto.token, true)).status === 404, 'quem não vê não baixa a transcrição');

  // segundo ticket numera certo e lista
  const op2 = await req('POST', `/servers/${srv.id}/tickets/open`, { panelId: panel.id, optionId: panel.options[1].id }, beto.token);
  ok(op2.d.channel?.name === 'ticket-0002', 'próximo ticket é o 0002 (opção sem perguntas)');
  const listSup = (await req('GET', `/servers/${srv.id}/tickets`, null, sup.token)).d;
  const listAna = (await req('GET', `/servers/${srv.id}/tickets`, null, ana.token)).d;
  ok(listSup.tickets.length === 2 && listSup.counts.open === 1 && listSup.counts.closed === 1, 'staff vê todos os tickets do painel');
  ok(listAna.tickets.length === 1 && listAna.tickets[0].number === 1, 'membro vê só os próprios');

  const del = await req('DELETE', base, null, sup.token); await wait(200);
  ok(del.s === 200 && !(await channelsOf(sup, srv.id)).some((c) => c.id === tch.id), 'staff exclui o canal do ticket fechado');
  ok((await req('GET', `/servers/${srv.id}/tickets?status=closed`, null, sup.token)).d.tickets.some((t) => t.number === 1 && !t.channel_id), 'registro do ticket fica no histórico');

  // apagar painel tira o cartão
  await req('DELETE', `/servers/${srv.id}/tickets/panels/${panel.id}`, null, dono.token);
  ok(!(await req('GET', `/messages/${geral.id}`, null, ana.token)).d.messages.some((m) => m.kind === 'ticket_panel'), 'excluir o painel tira o cartão do canal');
  ok((await channelsOf(beto, srv.id)).some((c) => c.id === op2.d.channel.id), 'tickets abertos continuam depois de excluir o painel');

  [dono, ana, beto, sup, fora].forEach((u) => u.sock.disconnect());
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
  process.exit(0);
})();
