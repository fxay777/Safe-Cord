// Busca de músicas do Spotify via Client Credentials Flow — não precisa de login do
// usuário, só de um app registrado (grátis) em https://developer.spotify.com/dashboard.
// O token é em nome do APP, não da pessoa, então só dá pra buscar/ler catálogo público
// (é exatamente o que a "música do perfil" precisa: nome, capa, artista, prévia de 30s).

let cachedToken = null; // { value, expiresAt }

function isConfigured() {
  return Boolean(process.env.SPOTIFY_CLIENT_ID && process.env.SPOTIFY_CLIENT_SECRET);
}

async function getAccessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 5000) {
    return cachedToken.value;
  }

  const basic = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    throw new Error(`Falha ao autenticar com o Spotify (${res.status})`);
  }

  const data = await res.json();
  cachedToken = { value: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 };
  return cachedToken.value;
}

// Devolve só os campos que a UI precisa — nunca o payload cru do Spotify.
function simplifyTrack(t) {
  return {
    id: t.id,
    name: t.name,
    artists: t.artists.map((a) => a.name).join(', '),
    album: t.album?.name || '',
    image: t.album?.images?.[2]?.url || t.album?.images?.[1]?.url || t.album?.images?.[0]?.url || null,
    duration_ms: t.duration_ms,
    preview_url: t.preview_url,
    external_url: t.external_urls?.spotify || null,
  };
}

async function searchTracks(query, limit = 20) {
  const token = await getAccessToken();
  const params = new URLSearchParams({ q: query, type: 'track', limit: String(limit) });
  const res = await fetch(`https://api.spotify.com/v1/search?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Falha na busca do Spotify (${res.status})`);
  }

  const data = await res.json();
  return (data.tracks?.items || []).map(simplifyTrack);
}

async function getTrack(trackId) {
  const token = await getAccessToken();
  const res = await fetch(`https://api.spotify.com/v1/tracks/${encodeURIComponent(trackId)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return simplifyTrack(data);
}

module.exports = { isConfigured, searchTracks, getTrack };
