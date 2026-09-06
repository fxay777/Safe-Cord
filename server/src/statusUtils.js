// Invisível é reportado como offline pros outros, mesmo com o app aberto — igual ao Discord.
// Compartilhado entre realtime.js e as rotas HTTP pra nunca ficarem dessincronizados.
function effectiveStatus(statusMode, connected) {
  if (!connected) return 'offline';
  return statusMode === 'invisible' ? 'offline' : (statusMode || 'online');
}

module.exports = { effectiveStatus };
