// Moderação (expulsar/banir) e campos novos do perfil. Rode com o servidor ligado.
const B = 'http://localhost:4000/api';
let n = 0, fails = 0;
const ok = (c, l) => { n++; console.log(`${n}) ${l}: ${c ? 'OK' : 'FALHOU'}`); if (!c) fails++; };
const req = async (m, p, body, t) => {
  const r = await fetch(B + p, { method: m, headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let d = {}; try { d = await r.json(); } catch {} return { s: r.status, d };
};
const rnd = () => Math.random().toString(36).slice(2, 7);
async function user(name) {
  const r = await req('POST', '/auth/register', { username: name + rnd(), password: 'senha123', email: `${name}${rnd()}@t.com` });
  await req('POST', '/auth/verify-email', { code: r.d.verification?.devCode }, r.d.token);
  return { token: r.d.token, id: r.d.user.id };
}
(async () => {
  const owner = await user('dono'), mod = await user('mod'), mod2 = await user('modb'), a = await user('ana'), b = await user('bia');
  const srv = (await req('POST', '/servers', { name: 'Teste Mod' }, owner.token)).d.server;
  for (const u of [mod, mod2, a, b]) await req('POST', '/servers/join', { inviteCode: srv.invite_code }, u.token);
  const role = (await req('POST', `/servers/${srv.id}/roles`, { name: 'Moderador', color: '#1E7BFF', permissions: ['banir_membros'] }, owner.token)).d.role;
  await req('PUT', `/servers/${srv.id}/roles/members/${mod.id}`, { roleIds: [role.id] }, owner.token);
  await req('PUT', `/servers/${srv.id}/roles/members/${mod2.id}`, { roleIds: [role.id] }, owner.token);

  ok((await req('POST', `/servers/${srv.id}/members/${b.id}/kick`, null, a.token)).s === 403, 'membro comum não expulsa ninguém');
  ok((await req('POST', `/servers/${srv.id}/members/${owner.id}/kick`, null, mod.token)).s === 403, 'ninguém expulsa o dono');
  ok((await req('POST', `/servers/${srv.id}/members/${mod.id}/kick`, null, mod.token)).s === 400, 'não expulsa a si mesmo');
  ok((await req('POST', `/servers/${srv.id}/members/${mod2.id}/ban`, null, mod.token)).s === 403, 'moderador não bane outro moderador');
  ok((await req('POST', `/servers/${srv.id}/members/${a.id}/kick`, null, mod.token)).s === 200, 'moderador expulsa membro');
  let members = (await req('GET', `/servers/${srv.id}/members`, null, owner.token)).d.members;
  ok(!members.some((m) => m.id === a.id), 'expulso some da lista');
  ok((await req('POST', '/servers/join', { inviteCode: srv.invite_code }, a.token)).s === 200, 'expulso pode voltar com convite');

  ok((await req('POST', `/servers/${srv.id}/members/${b.id}/ban`, { reason: 'spam' }, mod.token)).s === 200, 'moderador bane membro');
  ok((await req('POST', '/servers/join', { inviteCode: srv.invite_code }, b.token)).s === 403, 'banido não entra de novo');
  ok((await req('GET', `/servers/${srv.id}/members`, null, b.token)).s === 403, 'banido não vê mais os membros');
  const bans = (await req('GET', `/servers/${srv.id}/bans`, null, owner.token)).d.bans;
  ok(bans.length === 1 && bans[0].reason === 'spam' && bans[0].user_id === b.id, 'lista de banidos com motivo');
  ok((await req('GET', `/servers/${srv.id}/bans`, null, a.token)).s === 403, 'membro comum não vê banidos');
  ok((await req('DELETE', `/servers/${srv.id}/bans/${b.id}`, null, owner.token)).s === 200, 'dono desbane');
  ok((await req('POST', '/servers/join', { inviteCode: srv.invite_code }, b.token)).s === 200, 'desbanido entra de novo');
  ok((await req('POST', `/servers/${srv.id}/members/${mod2.id}/kick`, null, owner.token)).s === 200, 'dono expulsa moderador');

  // perfil
  const up = await req('PUT', '/auth/me/profile', { display_name: 'Ana', bio: 'oi', pronouns: 'ela/dela', status_text: 'jogando valorant', theme_primary: '#1E7BFF', theme_secondary: '#FF7EB6' }, a.token);
  ok(up.d.user.pronouns === 'ela/dela' && up.d.user.status_text === 'jogando valorant' && up.d.user.theme_primary === '#1E7BFF', 'salva pronomes, status e tema');
  const bad = await req('PUT', '/auth/me/profile', { display_name: 'Ana', theme_primary: 'red; background:url(x)' }, a.token);
  ok(bad.d.user.theme_primary === '#1E7BFF', 'cor inválida é ignorada (mantém a anterior)');
  const cleared = await req('PUT', '/auth/me/profile', { display_name: 'Ana', theme_primary: null, theme_secondary: null }, a.token);
  ok(cleared.d.user.theme_primary === null && cleared.d.user.pronouns === 'ela/dela', 'limpa o tema sem perder o resto');
  members = (await req('GET', `/servers/${srv.id}/members`, null, owner.token)).d.members;
  ok(members.find((m) => m.id === a.id)?.status_text === 'jogando valorant', 'status aparece na lista de membros');
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
})();
