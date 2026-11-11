// Ponte segura entre o processo principal e o React (context isolation ativo).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('safecord', {
  isDesktop: true,
  // Lista telas e janelas abertas, com miniatura, pro seletor de compartilhamento
  getScreenSources: () => ipcRenderer.invoke('screen:get-sources'),
  // Diz ao processo principal qual fonte entregar no próximo getDisplayMedia()
  selectScreenSource: (id) => ipcRenderer.invoke('screen:select-source', id),
});
