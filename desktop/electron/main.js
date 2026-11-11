const { app, BrowserWindow, session, desktopCapturer, ipcMain } = require('electron');
const path = require('path');

// Sem isso, o Chromium pode bloquear o autoplay do áudio dos outros participantes da
// call (o <audio> criado via JS pra tocar a voz recebida) sem mostrar nenhum erro — você
// entrava na call, via todo mundo, mas não ouvia ninguém. Precisa vir antes do app ficar pronto.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const isDev = !app.isPackaged;

// ─── Compartilhamento de tela ───────────────────────────────────────────────
// No Electron, navigator.mediaDevices.getDisplayMedia() NÃO funciona sozinho: o processo
// principal precisa dizer QUAL tela/janela entregar, via setDisplayMediaRequestHandler.
// Sem isso a chamada falha na hora — era por isso que o botão de compartilhar não fazia nada.
//
// O fluxo fica igual ao do Discord:
//   1. o app pede a lista de telas e janelas (com miniatura) → 'screen:get-sources'
//   2. a pessoa escolhe uma no seletor             → 'screen:select-source'
//   3. o app chama getDisplayMedia() e o handler abaixo entrega a fonte escolhida
let selectedSourceId = null;

ipcMain.handle('screen:get-sources', async () => {
  const sources = await desktopCapturer.getSources({
    types: ['screen', 'window'],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true,
  });
  return sources
    .filter((s) => s.name !== 'SafeCord') // não mostra a própria janela do app
    .map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.id.startsWith('screen:') ? 'screen' : 'window',
      thumbnail: s.thumbnail.isEmpty() ? null : s.thumbnail.toDataURL(),
      icon: s.appIcon && !s.appIcon.isEmpty() ? s.appIcon.toDataURL() : null,
    }));
});

ipcMain.handle('screen:select-source', (event, sourceId) => {
  selectedSourceId = typeof sourceId === 'string' ? sourceId : null;
  return true;
});

function installDisplayMediaHandler() {
  session.defaultSession.setDisplayMediaRequestHandler(async (request, callback) => {
    try {
      const sources = await desktopCapturer.getSources({ types: ['screen', 'window'] });
      const chosen = sources.find((s) => s.id === selectedSourceId)
        || sources.find((s) => s.id.startsWith('screen:'))
        || sources[0];
      selectedSourceId = null; // cada compartilhamento pede uma escolha nova

      if (!chosen) return callback({});

      // Áudio do sistema ("loopback") só existe no Windows; em outro SO vai só o vídeo.
      const wantsAudio = request.audioRequested && process.platform === 'win32';
      callback(wantsAudio ? { video: chosen, audio: 'loopback' } : { video: chosen });
    } catch (err) {
      console.error('Falha ao escolher a fonte de compartilhamento:', err);
      callback({});
    }
  });
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#DCEAFB',
    title: 'SafeCord',
    icon: path.join(__dirname, 'icon.png'),
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Microfone e tela: as duas checagens são necessárias. O "request" cobre o pedido
  // assíncrono (primeira vez que getUserMedia/getDisplayMedia é chamado) e o "check" cobre
  // a verificação síncrona que o Chromium faz por dentro — faltando uma delas, o pedido
  // pode ser negado sem erro nenhum aparecer no app.
  const allowed = new Set(['media', 'display-capture']);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(allowed.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => allowed.has(permission));

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  installDisplayMediaHandler();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
