// Gera os sons padrão do soundboard por síntese (originais, sem direitos de terceiros).
// Uso: node scripts/generate-default-sounds.js   (precisa do ffmpeg só pra converter pra mp3)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const RATE = 44100;
const OUT = path.join(__dirname, '..', 'static', 'sounds');
fs.mkdirSync(OUT, { recursive: true });

const env = (t, a, d) => (t < a ? t / a : Math.exp(-(t - a) / d));
const noise = () => Math.random() * 2 - 1;
const sq = (x) => (Math.sin(x) >= 0 ? 1 : -1);
const saw = (x) => 2 * ((x / (2 * Math.PI)) % 1) - 1;

function render(seconds, fn) {
  const n = Math.floor(seconds * RATE);
  const buf = new Float32Array(n);
  for (let i = 0; i < n; i += 1) buf[i] = fn(i / RATE);
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const g = peak > 0 ? 0.89 / peak : 1;
  for (let i = 0; i < n; i += 1) buf[i] *= g;
  return buf;
}

function wav(buf) {
  const data = Buffer.alloc(buf.length * 2);
  buf.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2));
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(RATE, 24);
  h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(data.length, 40);
  return Buffer.concat([h, data]);
}

// filtro passa-baixa simples pra ruído
function lowpass(fn, alpha) { let y = 0; return (t) => { y += alpha * (fn(t) - y); return y; }; }

const SOUNDS = {
  palmas: () => {
    const claps = Array.from({ length: 34 }, () => Math.random() * 2.2);
    const lp = lowpass(noise, 0.55);
    return render(2.6, (t) => {
      let a = 0;
      for (const c of claps) if (t >= c && t < c + 0.06) a += env(t - c, 0.002, 0.012);
      return lp(t) * a * env(t, 0.05, 1.6);
    });
  },
  'ba-dum-tss': () => render(1.9, (t) => {
    let v = 0;
    const hit = (s, f, d, amp) => { if (t >= s) { const u = t - s; v += Math.sin(2 * Math.PI * f * u * (1 - u * 2)) * env(u, 0.002, d) * amp; } };
    hit(0, 150, 0.09, 1); hit(0.22, 120, 0.12, 1);
    if (t >= 0.42) v += noise() * env(t - 0.42, 0.001, 0.5) * 0.6 * (0.5 + 0.5 * Math.sin(2 * Math.PI * 9000 * t));
    if (t >= 0.22) v += noise() * env(t - 0.22, 0.001, 0.05) * 0.5;
    return v;
  }),
  buzina: () => render(1.6, (t) => {
    const blast = (s, l) => (t >= s && t < s + l ? Math.min(1, (t - s) / 0.02, (s + l - t) / 0.04) : 0);
    const a = blast(0, 0.32) + blast(0.42, 0.32) + blast(0.84, 0.7);
    const vib = 1 + 0.004 * Math.sin(2 * Math.PI * 6 * t);
    return (saw(2 * Math.PI * 466 * vib * t) + saw(2 * Math.PI * 587 * vib * t) * 0.8 + saw(2 * Math.PI * 698 * vib * t) * 0.6) * a;
  }),
  moeda: () => render(0.7, (t) => {
    const f = t < 0.08 ? 988 : 1319;
    return sq(2 * Math.PI * f * t) * 0.5 * (t < 0.08 ? 1 : env(t - 0.08, 0.001, 0.18));
  }),
  tcharam: () => render(1.8, (t) => {
    const notes = [[0, 523], [0.12, 659], [0.24, 784], [0.36, 1047]];
    let v = 0;
    for (const [s, f] of notes) if (t >= s) { const u = t - s; v += (Math.sin(2 * Math.PI * f * u) + 0.3 * Math.sin(4 * Math.PI * f * u)) * env(u, 0.005, s === 0.36 ? 0.7 : 0.25); }
    return v;
  }),
  erro: () => render(1.1, (t) => {
    const seg = t < 0.35 ? 0 : t < 0.7 ? 1 : 2;
    const f = [311, 294, 262][seg];
    const u = t - seg * 0.35;
    return (sq(2 * Math.PI * f * t) * 0.4 + saw(2 * Math.PI * f * 0.5 * t) * 0.3) * (seg === 2 ? env(u, 0.01, 0.25) : Math.min(1, u / 0.01, (0.35 - u) / 0.03));
  }),
  sino: () => render(2.6, (t) => {
    const partials = [[1, 1, 1.4], [2.76, 0.5, 0.8], [5.4, 0.25, 0.4], [8.93, 0.12, 0.25]];
    return partials.reduce((acc, [m, a, d]) => acc + Math.sin(2 * Math.PI * 880 * m * t) * a * env(t, 0.002, d), 0);
  }),
  suspense: () => render(2.4, (t) => {
    const hits = [0, 0.45, 0.9];
    let v = 0;
    hits.forEach((s, i) => {
      if (t >= s) { const u = t - s; const f = [110, 104, 98][i]; v += (saw(2 * Math.PI * f * u) * 0.6 + Math.sin(2 * Math.PI * f * 0.5 * u)) * env(u, 0.01, i === 2 ? 0.9 : 0.3); }
    });
    return v * (1 + 0.15 * Math.sin(2 * Math.PI * 7 * t));
  }),
};

for (const [name, make] of Object.entries(SOUNDS)) {
  const tmp = path.join(OUT, `${name}.wav`);
  fs.writeFileSync(tmp, wav(make()));
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', tmp, '-codec:a', 'libmp3lame', '-b:a', '96k', path.join(OUT, `${name}.mp3`)]);
  fs.unlinkSync(tmp);
  console.log('ok', name, fs.statSync(path.join(OUT, `${name}.mp3`)).size, 'bytes');
}
