import React, { useEffect, useState } from 'react';
import { resolveAssetUrl } from '../api';
import { CloseIcon, CheckIcon } from './Icons';

const MAX_MEMBERS = 9; // 9 convidados + você = 10

export default function CreateGroupModal({ api, onClose, onCreate }) {
  const [friends, setFriends] = useState([]);
  const [selected, setSelected] = useState([]);
  const [name, setName] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/friends')
      .then(({ data }) => setFriends(data.friends || []))
      .catch(() => setError('Não foi possível carregar seus amigos'))
      .finally(() => setLoading(false));
  }, [api]);

  function toggle(friendId) {
    setError('');
    setSelected((prev) => {
      if (prev.includes(friendId)) return prev.filter((id) => id !== friendId);
      if (prev.length >= MAX_MEMBERS) {
        setError(`Um grupo cabe no máximo ${MAX_MEMBERS + 1} pessoas`);
        return prev;
      }
      return [...prev, friendId];
    });
  }

  async function submit() {
    if (selected.length === 0) {
      setError('Escolha pelo menos um amigo');
      return;
    }
    setCreating(true);
    setError('');
    try {
      await onCreate(selected, name.trim() || null);
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível criar o grupo');
      setCreating(false);
    }
  }

  const visible = friends.filter((f) => {
    const label = `${f.display_name || ''} ${f.username}#${f.tag}`.toLowerCase();
    return label.includes(search.trim().toLowerCase());
  });

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div>
            <div style={styles.title}>Criar um grupo</div>
            <div style={styles.subtitle}>
              {selected.length > 0 ? `${selected.length} selecionado(s)` : 'Escolha quem entra na conversa'}
            </div>
          </div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Fechar"><CloseIcon size={16} /></button>
        </div>

        <div style={styles.body}>
          <input
            style={styles.input}
            placeholder="Nome do grupo (opcional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
          />
          <input
            style={{ ...styles.input, marginTop: 8 }}
            placeholder="Buscar amigo…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />

          <div style={styles.friendList}>
            {loading && <div style={styles.hint}>Carregando amigos…</div>}
            {!loading && friends.length === 0 && (
              <div style={styles.hint}>Você ainda não tem amigos pra adicionar. Adicione alguém primeiro!</div>
            )}
            {!loading && friends.length > 0 && visible.length === 0 && (
              <div style={styles.hint}>Nenhum amigo com esse nome.</div>
            )}

            {visible.map((f) => {
              const checked = selected.includes(f.id);
              const label = f.display_name || f.username;
              const avatarUrl = resolveAssetUrl(f.avatar_url);
              return (
                <button
                  key={f.id}
                  type="button"
                  style={{ ...styles.friendRow, ...(checked ? styles.friendRowActive : {}) }}
                  onClick={() => toggle(f.id)}
                >
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="" style={styles.avatarImg} />
                  ) : (
                    <div style={{ ...styles.avatar, background: f.avatar_color || 'var(--accent)' }}>
                      {label[0]?.toUpperCase()}
                    </div>
                  )}
                  <div style={styles.friendMeta}>
                    <div style={styles.friendName}>{label}</div>
                    <div style={styles.friendTag}>{f.username}#{f.tag}</div>
                  </div>
                  <span style={{ ...styles.checkbox, ...(checked ? styles.checkboxOn : {}) }}>
                    {checked ? <CheckIcon size={12} /> : null}
                  </span>
                </button>
              );
            })}
          </div>

          {error && <div style={styles.error}>{error}</div>}

          <button style={styles.submit} onClick={submit} disabled={creating || selected.length === 0}>
            {creating ? 'Criando…' : `Criar grupo${selected.length ? ` (${selected.length + 1})` : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'var(--scrim)', 
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 120,
  },
  modal: {
    width: 440, maxHeight: '76vh', background: 'var(--bg-surface)',
    border: '1px solid var(--border)', borderRadius: 22, display: 'flex',
    flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
    padding: '18px 20px 12px', borderBottom: '1px solid var(--border)',
  },
  title: { fontSize: 16.5, fontWeight: 750, color: 'var(--text-hi)' },
  subtitle: { fontSize: 12, color: 'var(--text-low)', marginTop: 3 },
  closeBtn: {
    background: 'transparent', border: 'none', color: 'var(--text-mid)',
    cursor: 'pointer', fontSize: 15,
  },
  body: { padding: '14px 20px 20px', display: 'flex', flexDirection: 'column', minHeight: 0 },
  input: {
    width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 14, padding: '10px 12px', color: 'var(--text-hi)', fontSize: 13.5, outline: 'none',
  },
  friendList: { marginTop: 12, overflowY: 'auto', maxHeight: 280, display: 'flex', flexDirection: 'column', gap: 2 },
  hint: { fontSize: 12.5, color: 'var(--text-low)', padding: '18px 4px', textAlign: 'center', lineHeight: 1.5 },
  friendRow: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    background: 'transparent', border: '1px solid transparent', borderRadius: 14,
    padding: '8px 10px', cursor: 'pointer', textAlign: 'left',
  },
  friendRowActive: { background: 'color-mix(in srgb, var(--accent) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--accent) 35%, transparent)' },
  avatar: {
    width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontWeight: 800, fontSize: 12, color: 'var(--on-color)', flexShrink: 0,
  },
  avatarImg: { width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  friendMeta: { flex: 1, minWidth: 0 },
  friendName: { fontSize: 13.5, fontWeight: 650, color: 'var(--text-hi)' },
  friendTag: { fontSize: 11, color: 'var(--text-low)' },
  checkbox: {
    width: 20, height: 20, borderRadius: 7, border: '1px solid var(--border)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 12, color: 'transparent', flexShrink: 0,
  },
  checkboxOn: { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--accent-contrast, #052622)' },
  error: {
    marginTop: 10, fontSize: 12, color: 'var(--danger)',
    background: 'rgba(240,101,79,0.1)', borderRadius: 10, padding: '7px 10px',
  },
  submit: {
    marginTop: 14, width: '100%', background: 'var(--accent)',
    color: 'var(--accent-contrast, #052622)', fontWeight: 750, border: 'none',
    borderRadius: 14, padding: '11px 0', cursor: 'pointer', fontSize: 13.5,
  },
};
