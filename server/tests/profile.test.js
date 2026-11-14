// Cartão de perfil de outras pessoas: privacidade e dados de membro. Rode com o servidor ligado.
const B = 'http://localhost:4000/api';
let n = 0, fails = 0;
const ok = (c, l) => { n++; console.log(`${n}) ${l}: ${c ? 'OK' : 'FALHOU'}`); if (!c) fails++; };
const req = async (m, p, body, t) => {
  const r = await fetch(B + p, { method: m, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = {}; try { d = await r.json(); } catch {} return { s: r.status, d };
};
const rnd = () => Math.random().toString(36).slice(2, 7);
async function user(name) {
  const username = name + rnd();
  const r = await req('POST', '/auth/register', { username, password: 'senha123', email: `${name}${rnd()}@t.com` });
  await req('POST', '/auth/verify-email', { code: r.d.verification?.devCode }, r.d.token);
  return { token: r.d.token, id: r.d.user.id, username, tag: r.d.user.tag };
}
(async () => {
  const dono = await user('dono'), ana = await user('ana'), estranho = await user('estranho'), amigo = await user('amigo');
  const srv = (await req('POST', '/servers', { name: 'Perfis' }, dono.token)).d.server;
  await req('POST', '/servers/join', { inviteCode: srv.invite_code }, ana.token);
  const role = (await req('POST', `/servers/${srv.id}/roles`, { name: 'Artista', color: '#FF7EB6', permissions: [] }, dono.token)).d.role;
  await req('PUT', `/servers/${srv.id}/roles/members/${ana.id}`, { roleIds: [role.id] }, dono.token);
  await req('PUT', '/auth/me/profile', { display_name: 'Ana', pronouns: 'ela/dela', status_text: 'desenhando', theme_primary: '#7CC4FF', theme_secondary: '#1E7BFF' }, ana.token);

  const p = await req('GET', `/users/${ana.id}/profile?serverId=${srv.id}`, null, dono.token);
  ok(p.s === 200, 'membro do mesmo servidor vê o perfil');
  ok(p.d.user && !('email' in p.d.user) && !('email_verified' in p.d.user), 'perfil não traz email');
  ok(p.d.user?.pronouns === 'ela/dela' && p.d.user?.status_text === 'desenhando' && p.d.user?.theme_primary === '#7CC4FF', 'traz pronomes, recado e tema');
  ok(p.d.member?.roles?.some((r) => r.name === 'Artista') && p.d.member?.joined_at, 'traz cargos e data de entrada no servidor');
  ok(p.d.mutual_servers?.length === 1 && p.d.mutual_servers[0].id === srv.id, 'lista servidores em comum');
  const pd = await req('GET', `/users/${dono.id}/profile?serverId=${srv.id}`, null, ana.token);
  ok(pd.d.member?.is_owner === true, 'marca o dono do servidor');

  ok((await req('GET', `/users/${ana.id}/profile`, null, estranho.token)).s === 403, 'quem não tem relação não vê o perfil');
  const outro = (await req('POST', '/servers', { name: 'Do estranho' }, estranho.token)).d.server;
  const sneaky = await req('GET', `/users/${ana.id}/profile?serverId=${outro.id}`, null, estranho.token);
  ok(sneaky.s === 403, 'serverId de outro servidor não libera nada');

  const fr = await req('POST', '/friends/request', { username: `${ana.username}#${ana.tag}` }, amigo.token);
  ok((await req('GET', `/users/${ana.id}/profile`, null, amigo.token)).s === 403, 'pedido pendente ainda não libera o perfil');
  await req('POST', `/friends/${fr.d.friendship_id}/accept`, null, ana.token);
  const fp = await req('GET', `/users/${ana.id}/profile`, null, amigo.token);
  ok(fp.s === 200 && fp.d.friendship === 'accepted' && fp.d.member === null, 'amigo vê o perfil (sem dados de servidor)');

  await req('PUT', '/auth/me/status', { status_mode: 'invisible' }, ana.token);
  const inv = await req('GET', `/users/${ana.id}/profile`, null, dono.token);
  ok(inv.d.user?.status_mode === 'offline', 'quem está invisível aparece offline para os outros');
  const me = await req('GET', `/users/${ana.id}/profile`, null, ana.token);
  ok(me.s === 200 && me.d.mutual_servers.length === 0, 'abrir o próprio perfil funciona');
  ok((await req('GET', `/users/nao-existe/profile`, null, dono.token)).s === 403, 'id inexistente não vaza nada');
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
})();
