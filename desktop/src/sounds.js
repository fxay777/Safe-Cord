// Efeitos sonoros gerados na hora com Web Audio API — não depende de nenhum arquivo de áudio
// externo (mais leve, funciona offline, e não pesa no pacote final do app).
let ctx = null;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone({ freq, start, duration, gain = 0.09, type = 'sine' }) {
  const audioCtx = getCtx();
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = audioCtx.currentTime + start;
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

// Dois bipes curtos subindo — "conectado"
export function playJoinSound() {
  try {
    tone({ freq: 587, start: 0, duration: 0.12 });
    tone({ freq: 880, start: 0.09, duration: 0.16 });
  } catch (e) { /* Web Audio pode não estar disponível — falha silenciosamente */ }
}

// Dois bipes curtos descendo — "desconectado"
export function playLeaveSound() {
  try {
    tone({ freq: 660, start: 0, duration: 0.12 });
    tone({ freq: 415, start: 0.09, duration: 0.18 });
  } catch (e) { /* idem */ }
}

// Bipe único e discreto — usado quando outra pessoa entra/sai da sala (mais sutil que o seu próprio)
export function playPeerJoinSound() {
  try { tone({ freq: 740, start: 0, duration: 0.1, gain: 0.05 }); } catch (e) {}
}
export function playPeerLeaveSound() {
  try { tone({ freq: 380, start: 0, duration: 0.12, gain: 0.05 }); } catch (e) {}
}

// Blip curto e seco caindo — "mudo"
export function playMuteSound() {
  try { tone({ freq: 520, start: 0, duration: 0.08, gain: 0.06, type: 'triangle' }); } catch (e) {}
}
// Blip curto e seco subindo — "desmutado"
export function playUnmuteSound() {
  try { tone({ freq: 700, start: 0, duration: 0.08, gain: 0.06, type: 'triangle' }); } catch (e) {}
}

// Dois tons graves e fechados — "ensurdecido" (não ouve mais ninguém)
export function playDeafenSound() {
  try {
    tone({ freq: 460, start: 0, duration: 0.08, gain: 0.07, type: 'triangle' });
    tone({ freq: 330, start: 0.06, duration: 0.12, gain: 0.07, type: 'triangle' });
  } catch (e) {}
}
// Dois tons abrindo de volta — "voltou a ouvir"
export function playUndeafenSound() {
  try {
    tone({ freq: 460, start: 0, duration: 0.08, gain: 0.07, type: 'triangle' });
    tone({ freq: 660, start: 0.06, duration: 0.12, gain: 0.07, type: 'triangle' });
  } catch (e) {}
}
