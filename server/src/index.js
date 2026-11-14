require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const authRoutes = require('./routes/authRoutes');
const serverRoutes = require('./routes/serverRoutes');
const messageRoutes = require('./routes/messageRoutes');
const friendRoutes = require('./routes/friendRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const roleRoutes = require('./routes/roleRoutes');
const categoryRoutes = require('./routes/categoryRoutes');
const dmRoutes = require('./routes/dmRoutes');
const spotifyRoutes = require('./routes/spotifyRoutes');
const badgeRoutes = require('./routes/badgeRoutes');
const shopRoutes = require('./routes/shopRoutes');
const marketRoutes = require('./routes/marketRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const userRoutes = require('./routes/userRoutes');
const { attachRealtime } = require('./realtime');
const { isSmtpConfigured } = require('./mailer');

const app = express();
// Content-Disposition exposto: sem isso o app não lê o nome do arquivo baixado (produto digital)
app.use(cors({ exposedHeaders: ['Content-Disposition'] }));

// O webhook do Stripe precisa do corpo CRU pra validar a assinatura. Em vez de montar a
// loja inteira antes do parser (o que deixaria req.body vazio nas outras rotas dela),
// guardamos uma cópia crua durante o parse e o webhook usa essa cópia.
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; },
}));

// Arquivos de avatar/banner otimizados (webp) ficam aqui e são servidos como estáticos
app.use(
  '/uploads',
  express.static(path.join(__dirname, '..', 'uploads'), {
    maxAge: '7d', // otimização: navegador cacheia a imagem por 7 dias
    immutable: true,
  })
);

app.get('/health', (req, res) => res.json({ ok: true, name: 'SafeCord API' }));
app.use('/api/auth', authRoutes);
app.use('/api/servers', serverRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/servers/:serverId/roles', roleRoutes);
app.use('/api/servers/:serverId/categories', categoryRoutes);
app.use('/api/dms', dmRoutes);
app.use('/api/spotify', spotifyRoutes);
app.use('/api/badges', badgeRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/market', marketRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users', userRoutes);

// Rede de segurança: sem isso, um erro em QUALQUER rota (ex: um INSERT que viola uma
// constraint) derruba o processo inteiro e todo mundo cai junto. Aqui o pedido falha
// sozinho, com uma resposta clara, e o servidor continua de pé.
app.use((err, req, res, next) => {
  console.error(`Erro em ${req.method} ${req.originalUrl}:`, err.message);
  if (res.headersSent) return next(err);
  // Erros de upload (multer): arquivo grande demais ou formato recusado viram mensagem clara
  if (err.name === 'MulterError') {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Arquivo grande demais' : 'Upload inválido';
    return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: msg });
  }
  if (/^Formato/.test(err.message || '')) return res.status(400).json({ error: err.message });
  res.status(500).json({ error: 'Algo deu errado no servidor' });
});

process.on('unhandledRejection', (reason) => {
  console.error('Promise rejeitada sem tratamento:', reason);
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const notifyUser = attachRealtime(io);
app.set('notifyUser', notifyUser);
app.set('io', io);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`SafeCord API rodando em http://localhost:${PORT}`);
  console.log(`   Email: ${isSmtpConfigured() ? 'SMTP configurado (ok)' : 'sem SMTP — códigos saem aqui no console'}`);
  const payProvider = require('./payments').providerLabel();
  console.log(`   Pagamentos: ${payProvider ? `${payProvider} configurado (ok)` : 'sem MERCADOPAGO_ACCESS_TOKEN — pagamentos desligados'}`);
});
