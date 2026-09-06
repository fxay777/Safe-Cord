const express = require('express');
const { requireAuth } = require('../auth');
const spotify = require('../spotify');

const router = express.Router();
router.use(requireAuth);

// Diz pro front se a busca tá disponível (sem credenciais configuradas, mostramos um aviso
// em vez de um campo de busca que nunca vai retornar nada).
router.get('/status', (req, res) => {
  res.json({ configured: spotify.isConfigured() });
});

router.get('/search', async (req, res) => {
  if (!spotify.isConfigured()) {
    return res.status(503).json({ error: 'Busca do Spotify não configurada no servidor.' });
  }
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ tracks: [] });

  try {
    const tracks = await spotify.searchTracks(q);
    res.json({ tracks });
  } catch (err) {
    console.error('Erro na busca do Spotify:', err.message);
    res.status(502).json({ error: 'Não foi possível buscar no Spotify agora.' });
  }
});

router.get('/track/:id', async (req, res) => {
  if (!spotify.isConfigured()) {
    return res.status(503).json({ error: 'Busca do Spotify não configurada no servidor.' });
  }
  try {
    const track = await spotify.getTrack(req.params.id);
    if (!track) return res.status(404).json({ error: 'Música não encontrada' });
    res.json({ track });
  } catch (err) {
    console.error('Erro ao buscar faixa do Spotify:', err.message);
    res.status(502).json({ error: 'Não foi possível buscar essa música agora.' });
  }
});

module.exports = router;
