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
const { attachRealtime } = require('./realtime');

const app = express();
app.use(cors());
app.use(express.json());

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

const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const notifyUser = attachRealtime(io);
app.set('notifyUser', notifyUser);
app.set('io', io);

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => {
  console.log(`🛡️  SafeCord API rodando em http://localhost:${PORT}`);
});
