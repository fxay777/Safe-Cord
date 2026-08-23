# 🛡️ SafeCord

Clone funcional do Discord, do zero: **servidores**, **canais de texto**, **chat em tempo real**, **canais de voz (WebRTC)** e presença online/offline. Monorepo com backend + cliente desktop (Electron) + cliente mobile (Expo/React Native).

```
safecord/
├── server/     → API REST + WebSocket (Node.js, Express, Socket.io, SQLite)
├── desktop/    → App de PC (Electron + React + Vite)
└── mobile/     → App de celular (Expo / React Native)
```

## Como rodar

### 1. Backend (obrigatório para tudo funcionar)

```bash
cd server
npm install
npm run dev
```

Sobe em `http://localhost:4000`. Usa SQLite (arquivo `server/safecord.db`, criado automaticamente) — **não precisa instalar banco de dados nenhum**.

### 2. Desktop (Electron)

```bash
cd desktop
npm install
npm run dev
```

Abre uma janela nativa de PC com o app rodando (Windows, Mac ou Linux). Para gerar o instalador (.exe/.dmg/.AppImage), veja a seção "Build para produção" abaixo.

### 3. Mobile (Expo)

```bash
cd mobile
npm install
npx expo install react-native-webrtc @config-plugins/react-native-webrtc
npm start
```

Escaneie o QR code com o app **Expo Go** (Android/iOS) ou rode num emulador.

> ⚠️ **Importante sobre o endereço do servidor:**
> - No app desktop e no simulador iOS: `http://localhost:4000` funciona direto.
> - No emulador Android: troque para `http://10.0.2.2:4000` em `mobile/src/api.js`.
> - Num celular físico: troque para o IP local do seu PC (ex: `http://192.168.0.15:4000`) em `desktop/src/api.js` e `mobile/src/api.js`, e libere a porta 4000 no firewall.

## O que já funciona

- ✅ Cadastro e login (senha com hash bcrypt, sessão via JWT)
- ✅ Criar servidor (gera automaticamente canal `#geral` e uma `Sala de Voz`)
- ✅ Entrar em servidor por código de convite
- ✅ Múltiplos canais de texto por servidor
- ✅ Chat em tempo real (Socket.io), com histórico persistido em banco
- ✅ Indicador de "digitando..."
- ✅ Lista de membros com status online/offline em tempo real
- ✅ Canais de voz com WebRTC (áudio, topologia mesh — ótima até uns 6-8 pessoas por sala)
- ✅ Mesma identidade visual (tema escuro + acento teal) no desktop e no mobile

## O que ainda não tem (próximos passos naturais)

- Vídeo/compartilhamento de tela (dá pra estender o `useVoiceChannel` pra adicionar `video: true`)
- Permissões/cargos (admin, moderador, etc.) — hoje todo mundo no servidor tem os mesmos poderes
- Upload de imagens/arquivos no chat
- Notificações push no mobile
- Editar/apagar mensagens
- Emojis/reações

## Build para produção

**Desktop:** adicione `electron-builder` (`npm i -D electron-builder`) e configure o `build` no `package.json` do `desktop/` pra gerar instaladores nativos.

**Mobile:** use `eas build` (Expo Application Services) pra gerar o `.apk`/`.ipa` final.

**Backend:** troque o `JWT_SECRET` (veja `server/src/auth.js`) por uma variável de ambiente forte antes de colocar em produção, e troque o SQLite por Postgres se esperar mais tráfego.
