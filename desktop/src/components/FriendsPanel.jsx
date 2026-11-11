import React, { useCallback, useEffect, useRef, useState } from 'react';
import { resolveAssetUrl } from '../api';
import { statusMeta } from './UserProfilePopup';
import { EmptyFriendsArt } from './EmptyStateArt';

export default function FriendsPanel({ api, socket, currentUserId, onOpenDM }) {
  const [friends, setFriends] = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [outgoing, setOutgoing] = useState([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [addError, setAddError] = useState('');
  const [addSuccess, setAddSuccess] = useState('');
  const debounceRef = useRef(null);

  const loadFriends = useCallback(async () => {
    const { data } = await api.get('/friends');
    setFriends(data.friends);
    setIncoming(data.incoming);
    setOutgoing(data.outgoing);
  }, [api]);

  useEffect(() => {
    loadFriends();
  }, [loadFriends]);

  // Reage em tempo real a pedidos/aceites/recusas — sem precisar recarregar a página
  useEffect(() => {
    if (!socket) return;
    const refresh = () => loadFriends();
    socket.on('friend:request', refresh);
    socket.on('friend:accepted', refresh);
    socket.on('friend:declined', refresh);
    socket.on('friend:removed', refresh);
    socket.on('presence:update', ({ userId, status }) => {
      setFriends((prev) => prev.map((f) => (f.id === userId ? { ...f, status } : f)));
    });
    return () => {
      socket.off('friend:request', refresh);
      socket.off('friend:accepted', refresh);
      socket.off('friend:declined', refresh);
      socket.off('friend:removed', refresh);
      socket.off('presence:update');
    };
  }, [socket, loadFriends]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query || query.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/friends/search', { params: { q: query.trim() } });
        setResults(data.users);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query, api]);

  const knownIds = new Set([
    currentUserId,
    ...friends.map((f) => f.id),
    ...incoming.map((f) => f.id),
    ...outgoing.map((f) => f.id),
  ]);

  async function sendRequest(username) {
    setAddError('');
    setAddSuccess('');
    try {
      await api.post('/friends/request', { username });
      setAddSuccess(`Pedido enviado para ${username}`);
      setQuery('');
      setResults([]);
      loadFriends();
    } catch (err) {
      setAddError(err?.response?.data?.error || 'Não foi possível enviar o pedido');
    }
  }

  async function accept(id) {
    await api.post(`/friends/${id}/accept`);
    loadFriends();
  }

  async function decline(id) {
    await api.post(`/friends/${id}/decline`);
    loadFriends();
  }

  async function removeFriend(id) {
    await api.delete(`/friends/${id}`);
    loadFriends();
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <span style={styles.title}>Amigos</span>
      </div>

      <div style={styles.addBox}>
        <label style={styles.label}>Adicionar amigo</label>
        <div style={styles.searchRow}>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setAddError('');
              setAddSuccess('');
            }}
            placeholder="Buscar por nome de usuário"
            style={styles.input}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && query.trim()) sendRequest(query.trim());
            }}
          />
        </div>
        {addError && <div style={styles.errorText}>{addError}</div>}
        {addSuccess && <div style={styles.successText}>{addSuccess}</div>}

        {(searching || results.length > 0) && (
          <div style={styles.resultsBox}>
            {searching && <div style={styles.hintText}>Buscando…</div>}
            {!searching &&
              results
                .filter((u) => !knownIds.has(u.id))
                .map((u) => (
                  <div key={u.id} style={styles.resultRow}>
                    <PersonBadge user={u} />
                    <button type="button" style={styles.smallPrimaryBtn} onClick={() => sendRequest(u.username)}>
                      Adicionar
                    </button>
                  </div>
                ))}
            {!searching && results.length === 0 && <div style={styles.hintText}>Nenhum usuário encontrado</div>}
          </div>
        )}
      </div>

      {incoming.length > 0 && (
        <Section title={`Pedidos recebidos — ${incoming.length}`}>
          {incoming.map((u) => (
            <div key={u.friendship_id} style={styles.row}>
              <PersonBadge user={u} />
              <div style={styles.rowActions}>
                <button type="button" style={styles.smallPrimaryBtn} onClick={() => accept(u.friendship_id)}>Aceitar</button>
                <button type="button" style={styles.smallGhostBtn} onClick={() => decline(u.friendship_id)}>Recusar</button>
              </div>
            </div>
          ))}
        </Section>
      )}

      {outgoing.length > 0 && (
        <Section title={`Pedidos enviados — ${outgoing.length}`}>
          {outgoing.map((u) => (
            <div key={u.friendship_id} style={styles.row}>
              <PersonBadge user={u} />
              <div style={styles.rowActions}>
                <button type="button" style={styles.smallGhostBtn} onClick={() => decline(u.friendship_id)}>Cancelar</button>
              </div>
            </div>
          ))}
        </Section>
      )}

      <Section title={`Todos os amigos — ${friends.length}`}>
        {friends.length === 0 && (
          <div style={styles.emptyState}>
            <EmptyFriendsArt />
            <div style={styles.hintText}>Você ainda não tem amigos adicionados.</div>
          </div>
        )}
        {friends.map((u) => (
          <div key={u.friendship_id} style={styles.row}>
            <PersonBadge user={u} showStatus />
            <div style={styles.rowActions}>
              <button type="button" style={styles.smallPrimaryBtn} onClick={() => onOpenDM?.(u.id)}>Mensagem</button>
              <button type="button" style={styles.smallGhostBtn} onClick={() => removeFriend(u.friendship_id)}>Remover</button>
            </div>
          </div>
        ))}
      </Section>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionLabel}>{title}</div>
      {children}
    </div>
  );
}

function PersonBadge({ user, showStatus }) {
  const name = user.display_name || user.username;
  const initials = (name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const avatarUrl = resolveAssetUrl(user.avatar_url);

  return (
    <div style={styles.person}>
      <div style={styles.avatarWrap}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} style={styles.avatarImg} />
        ) : (
          <div style={{ ...styles.avatar, background: user.avatar_color || 'var(--accent)' }}>{initials || '?'}</div>
        )}
        {showStatus && (
          <div style={{ ...styles.dot, background: statusMeta(user.status).color }} />
        )}
      </div>
      <div style={styles.personMeta}>
        <div style={styles.personName}>{name}</div>
        <div style={styles.personTag}>#{user.tag}</div>
      </div>
    </div>
  );
}

const styles = {
  wrap: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', overflowY: 'auto', padding: '22px 26px' },
  header: { marginBottom: 14 },
  title: { fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 22, color: 'var(--text-hi)' },
  addBox: {
    background: 'var(--bg-base)',
    border: 'none',
    borderRadius: 'var(--radius-lg)',
    padding: 16,
    marginBottom: 20,
  },
  label: { display: 'block', fontSize: 13, fontWeight: 650, color: 'var(--text-hi)', marginBottom: 10 },
  searchRow: { display: 'flex', gap: 8 },
  input: {
    flex: 1,
    background: 'var(--bg-elevated)',
    border: '1px solid transparent',
    borderRadius: 'var(--radius-pill)',
    padding: '11px 16px',
    color: 'var(--text-hi)',
    fontSize: 14,
    outline: 'none',
  },
  errorText: { color: 'var(--danger)', fontSize: 12, marginTop: 8 },
  successText: { color: 'var(--success)', fontSize: 12, marginTop: 8 },
  resultsBox: { marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' },
  resultRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '6px 4px' },
  hintText: { fontSize: 12.5, color: 'var(--text-low)', padding: '4px 2px' },
  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '24px 0' },
  section: { marginBottom: 22 },
  sectionLabel: { fontSize: 12.5, fontWeight: 650, color: 'var(--text-low)', marginBottom: 6, padding: '0 10px' },
  row: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', borderRadius: 18, marginBottom: 2 },
  rowActions: { display: 'flex', gap: 8 },
  person: { display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: { width: 38, height: 38, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 650, fontSize: 14, color: 'var(--on-color)' },
  avatarImg: { width: 38, height: 38, borderRadius: '50%', objectFit: 'cover' },
  dot: { position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: '50%', border: '3px solid var(--bg-surface)' },
  personMeta: { minWidth: 0 },
  personName: { fontSize: 14.5, fontWeight: 600, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  personTag: { fontSize: 12, color: 'var(--text-low)' },
  smallPrimaryBtn: { border: 'none', background: 'var(--accent)', color: 'var(--accent-contrast)', fontWeight: 600, fontSize: 13, padding: '8px 16px', borderRadius: 'var(--radius-pill)', cursor: 'pointer' },
  smallGhostBtn: { border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-mid)', fontSize: 13, fontWeight: 550, padding: '8px 16px', borderRadius: 'var(--radius-pill)', cursor: 'pointer' },
};
