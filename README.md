# 🛡️ SafeCord

Um app de chat estilo Discord, feito do zero: servidores com canais de texto e voz,
conversas diretas e em grupo, chamadas com compartilhamento de tela, verificação de
email, nicks com `#0000`, insígnias e loja.

```
safecord/
├── server/     → API REST + WebSocket (Node, Express, Socket.io, SQLite)
├── desktop/    → App de PC (Electron + React + Vite)
└── mobile/     → App de celular (Expo / React Native)
```

## Rodando

### 1. Backend (precisa estar rodando pra qualquer coisa funcionar)

```bash
cd server
npm install
cp .env.example .env     # opcional, mas recomendado
npm run dev
```

Sobe em `http://localhost:4000` e usa SQLite (arquivo criado sozinho) — **não precisa
instalar banco de dados nenhum**. Ao iniciar, ele diz no console se email e pagamentos
estão configurados.

### 2. Desktop

```bash
cd desktop
npm install
npm run dev
```

### 3. Mobile

```bash
cd mobile
npm install
npm start
```

> No emulador Android troque `localhost` por `10.0.2.2` em `mobile/src/api.js`.
> Num celular físico, use o IP da sua máquina na rede (ex: `192.168.0.15`).

## O que tem pronto

**Contas e perfil**
- Cadastro com **email + verificação por código de 6 dígitos**
- **Nicks estilo Discord**: dois "joao" podem existir, o que identifica é `joao#1234`
- Login por nome, por `nome#0000` ou por email
- Perfil com apelido, bio, foto, banner, cor, status (online/ausente/não perturbe/invisível),
  música do Spotify e contas conectadas
- **Insígnias** no perfil e ao lado do nome nas mensagens

**Conversas**
- Servidores com categorias, canais de texto e voz, cargos e permissões
- **Conversas diretas e em grupo** (até 10 pessoas, com nome e avatar em mosaico)
- **Anexar imagem e vídeo** (otimizados no servidor), **emoji picker**, "digitando…",
  contador de não lidas

**Voz e vídeo**
- Canais de voz por WebRTC (malha), com mudo, ensurdecer, escolha de microfone/saída,
  controle de volume e sons de entrar/sair
- **Compartilhamento de tela de verdade** (`getDisplayMedia`), com aviso de quem está
  compartilhando e player pra assistir
- Servidores STUN + TURN de reserva, pra funcionar em redes mais fechadas

**Loja**
- SafeCord Pro e insígnias compráveis, via **Stripe Checkout** (modo teste)

## Configuração opcional (`server/.env`)

Tudo abaixo é opcional — sem nada configurado o app funciona, só com essas partes em
modo de desenvolvimento. O `.env.example` tem o passo a passo de cada uma.

| Variável | Pra quê | Sem ela |
|---|---|---|
| `SMTP_*` | Enviar o email de verificação | O código aparece no console do servidor **e já vem preenchido na tela** |
| `STRIPE_SECRET_KEY` | Pagamentos de verdade (use a `sk_test_`) | A loja aparece, mas comprar avisa que falta configurar |
| `SPOTIFY_*` | Busca de música no perfil | Só essa busca fica indisponível |
| `JWT_SECRET` | Assinar os tokens de login | Usa um valor padrão — **troque antes de colocar no ar** |

No modo de teste do Stripe, use o cartão `4242 4242 4242 4242`, qualquer validade futura
e CVC `123`. Nada é cobrado de verdade.

## Antes de colocar no ar

1. Troque o `JWT_SECRET` por um valor aleatório e forte
2. Configure SMTP (senão ninguém consegue verificar o email de verdade)
3. Troque a chave do Stripe de `sk_test_` pra `sk_live_` e configure o webhook
4. Troque o SQLite por Postgres se esperar bastante gente
5. Publique o backend em algum host e aponte `API_URL` (em `desktop/src/api.js` e
   `mobile/src/api.js`) pra ele

## Próximos passos possíveis

- Chamada de vídeo com câmera (a base de WebRTC já está pronta, falta a track de vídeo da webcam)
- Anexos no mobile (hoje só o desktop)
- Notificações push
- Editar e apagar mensagens, reações com emoji
