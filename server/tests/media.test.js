// Anexos de mensagem: GIF animado, vídeo de verdade x arquivo falso. Servidor normal, banco zerado.
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const B = 'http://localhost:4000';
let n = 0, fails = 0;
const ok = (c, l) => { n++; console.log(`${n}) ${l}: ${c ? 'OK' : 'FALHOU'}`); if (!c) fails++; };
const req = async (m, p, body, t) => { const isForm = body instanceof FormData; const r = await fetch(B + '/api' + p, { method: m, headers: { ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...(t ? { Authorization: `Bearer ${t}` } : {}) }, body: body ? (isForm ? body : JSON.stringify(body)) : undefined }); let d = {}; try { d = await r.json(); } catch {} return { s: r.status, d }; };
const up = (t, file, type, meta = {}) => { const fd = new FormData(); for (const [k, v] of Object.entries(meta)) fd.append(k, String(v)); fd.append('file', new Blob([fs.readFileSync(path.join(__dirname, 'fixtures', file))], { type }), file); return req('POST', '/uploads/message-attachment', fd, t); };
(async () => {
  const r = await req('POST', '/auth/register', { username: 'midia' + Date.now(), password: 'senha123', email: `m${Date.now()}@t.com` });
  const t = r.d.token;
  const gif = await up(t, 'anim.gif', 'image/gif');
  ok(gif.s === 200 && gif.d.attachment.animated === true && gif.d.attachment.width === 320 && gif.d.attachment.height === 240, 'GIF continua animado (e com o tamanho certo)');
  const buf = Buffer.from(await (await fetch(B + gif.d.attachment.url)).arrayBuffer());
  const meta = await sharp(buf, { animated: true }).metadata();
  ok(meta.pages > 5, `arquivo salvo tem várias quadros (${meta.pages})`);
  const vid = await up(t, 'clip.mp4', 'video/mp4', { width: 640, height: 360, duration: 2.0 });
  ok(vid.s === 200 && vid.d.attachment.type === 'video/mp4' && vid.d.attachment.width === 640 && vid.d.attachment.duration === 2, 'vídeo MP4 aceito com largura/altura/duração');
  const range = await fetch(B + vid.d.attachment.url, { headers: { Range: 'bytes=0-99' } });
  ok(range.status === 206, 'vídeo aceita pedaços (Range) — dá pra pular pro meio');
  const fake = await up(t, 'fake.mp4', 'video/mp4');
  ok(fake.s === 400 && /não é um vídeo/.test(fake.d.error), 'arquivo qualquer com nome .mp4 é recusado');
  const bad = await up(t, 'beep.mp3', 'audio/mpeg');
  ok(bad.s === 400, 'tipo não suportado é recusado');
  console.log(fails ? `\n${fails} FALHA(S)` : '\nTUDO OK');
})();
