const db = require('./db');
const { hasPermission } = require('./permissions');

// Sons padrão (arquivos em static/sounds, gerados por síntese — sem direitos de terceiros)
const DEFAULT_SOUNDS = [
  { id: 'default:palmas', name: 'Palmas', color: '#F0B429', file: '/static/sounds/palmas.mp3', duration_ms: 2600 },
  { id: 'default:ba-dum-tss', name: 'Ba dum tss', color: '#B794FF', file: '/static/sounds/ba-dum-tss.mp3', duration_ms: 1900 },
  { id: 'default:buzina', name: 'Buzina', color: '#E5484D', file: '/static/sounds/buzina.mp3', duration_ms: 1600 },
  { id: 'default:moeda', name: 'Moeda', color: '#F5C542', file: '/static/sounds/moeda.mp3', duration_ms: 700 },
  { id: 'default:tcharam', name: 'Tcharam', color: '#4CD6A0', file: '/static/sounds/tcharam.mp3', duration_ms: 1800 },
  { id: 'default:erro', name: 'Errou', color: '#FF8A65', file: '/static/sounds/erro.mp3', duration_ms: 1100 },
  { id: 'default:sino', name: 'Sino', color: '#7CC4FF', file: '/static/sounds/sino.mp3', duration_ms: 2600 },
  { id: 'default:suspense', name: 'Suspense', color: '#5B3FD6', file: '/static/sounds/suspense.mp3', duration_ms: 2400 },
].map((s) => ({ ...s, volume: 80, is_default: true }));

const MAX_PER_SERVER = 24;
const MAX_DURATION_MS = 5200;
const COOLDOWN_MS = 2500;

function serverSounds(serverId) {
  const server = db.prepare('SELECT soundboard_defaults FROM servers WHERE id = ?').get(serverId);
  const own = db.prepare('SELECT * FROM server_sounds WHERE server_id = ? ORDER BY created_at ASC').all(serverId)
    .map((s) => ({ ...s, is_default: false }));
  return [...(server?.soundboard_defaults ? DEFAULT_SOUNDS : []), ...own];
}

/** Pode tocar som nessa sala? Devolve { sound } ou { error }. */
function resolvePlayable(roomId, soundId, userId) {
  if (String(soundId).startsWith('default:')) {
    const sound = DEFAULT_SOUNDS.find((s) => s.id === soundId);
    if (!sound) return { error: 'Som não encontrado' };
    if (roomId.startsWith('dm:')) return { sound }; // chamada privada: só os sons padrão
    const channel = db.prepare('SELECT server_id FROM channels WHERE id = ?').get(roomId);
    const server = channel && db.prepare('SELECT * FROM servers WHERE id = ?').get(channel.server_id);
    if (!server) return { error: 'Sala inválida' };
    if (!server.soundboard_defaults) return { error: 'Os sons padrão estão desligados nesse servidor' };
    if (!server.soundboard_everyone && !hasPermission(server.id, userId, 'gerenciar_soundboard')) return { error: 'O soundboard está liberado só pra alguns cargos' };
    return { sound };
  }
  if (roomId.startsWith('dm:')) return { error: 'Na chamada privada só dá pra usar os sons padrão' };
  const sound = db.prepare('SELECT * FROM server_sounds WHERE id = ?').get(soundId);
  const channel = db.prepare('SELECT server_id FROM channels WHERE id = ?').get(roomId);
  if (!sound || !channel || sound.server_id !== channel.server_id) return { error: 'Som não encontrado' };
  const server = db.prepare('SELECT * FROM servers WHERE id = ?').get(channel.server_id);
  if (!server.soundboard_everyone && !hasPermission(server.id, userId, 'gerenciar_soundboard')) return { error: 'O soundboard está liberado só pra alguns cargos' };
  db.prepare('UPDATE server_sounds SET uses = uses + 1 WHERE id = ?').run(sound.id);
  return { sound };
}

module.exports = { DEFAULT_SOUNDS, MAX_PER_SERVER, MAX_DURATION_MS, COOLDOWN_MS, serverSounds, resolvePlayable };
