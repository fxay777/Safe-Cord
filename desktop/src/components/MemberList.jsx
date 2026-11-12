import React, { useState } from 'react';
import { resolveAssetUrl } from '../api';
import { statusMeta } from './UserProfilePopup';
import { SearchIcon, CrownIcon, MoreIcon, CloseIcon } from './Icons';

// "Visto há 5 min / 2h / 3 dias" a partir de quando a última conexão caiu
function lastSeenLabel(ts) {
  if (!ts) return 'Offline';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'Visto agora há pouco';
  if (min < 60) return `Visto há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `Visto há ${h}h`;
  const d = Math.floor(h / 24);
  if (d === 1) return 'Visto ontem';
  if (d < 30) return `Visto há ${d} dias`;
  return 'Visto há muito tempo';
}

export default function MemberList({ members, ownerId }) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [showOffline, setShowOffline] = useState(true);

  const q = query.trim().toLowerCase();
  const filtered = q
    ? members.filter((m) => `${m.display_name || ''} ${m.username}`.toLowerCase().includes(q))
    : members;
  const online = filtered.filter((m) => m.status && m.status !== 'offline');
  const offline = filtered
    .filter((m) => !m.status || m.status === 'offline')
    .sort((a, b) => (b.last_seen_at || 0) - (a.last_seen_at || 0));
  const totalOnline = members.filter((m) => m.status && m.status !== 'offline').length;

  return (
    <div style={styles.wrap}>
      <div style={styles.header}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={styles.title}>Membros</div>
          <div style={styles.subtitle}>{totalOnline} online</div>
        </div>
        <button
          type="button"
          className="sc-icon-btn"
          style={{ ...styles.iconBtn, ...(searching ? styles.iconBtnActive : {}) }}
          title="Buscar membro"
          onClick={() => { setSearching((v) => !v); setQuery(''); }}
        >
          <SearchIcon size={15} />
        </button>
        <button
          type="button"
          className="sc-icon-btn"
          style={styles.iconBtn}
          title={showOffline ? 'Esconder quem está offline' : 'Mostrar quem está offline'}
          onClick={() => setShowOffline((v) => !v)}
        >
          <MoreIcon size={15} />
        </button>
      </div>

      {searching && (
        <div style={styles.searchBox}>
          <SearchIcon size={13} style={{ color: 'var(--text-low)', flexShrink: 0 }} />
          <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar membro…" style={styles.searchInput} />
          {query && (
            <button type="button" style={styles.clearBtn} onClick={() => setQuery('')}><CloseIcon size={11} /></button>
          )}
        </div>
      )}

      <div style={styles.list}>
        <Group title={`Online — ${online.length}`} dotColor="var(--success)" members={online} ownerId={ownerId} />
        {showOffline && <Group title={`Offline — ${offline.length}`} dotColor="var(--text-low)" members={offline} ownerId={ownerId} dim />}
        {q && online.length === 0 && offline.length === 0 && <div style={styles.empty}>Ninguém com esse nome.</div>}
      </div>
    </div>
  );
}

function Group({ title, dotColor, members, ownerId, dim }) {
  if (members.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={styles.label}><span style={{ ...styles.labelDot, background: dotColor }} />{title}</div>
      {members.map((m) => {
        const displayName = m.display_name || m.username;
        const initials = (displayName || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
        const topRole = (m.roles && m.roles[0]) || null;
        const isOwner = m.is_owner || (ownerId && m.id === ownerId);
        const meta = statusMeta(m.status);
        const subtitle = dim
          ? lastSeenLabel(m.last_seen_at)
          : (m.bio ? m.bio.split('\n')[0] : meta.label);

        return (
          <div key={m.id} className="sc-member-row" style={styles.row}>
            <div style={styles.avatarWrap}>
              {m.avatar_url ? (
                <img src={resolveAssetUrl(m.avatar_url)} alt={displayName} style={{ ...styles.avatarImg, opacity: dim ? 0.55 : 1 }} />
              ) : (
                <div style={{ ...styles.avatar, background: m.avatar_color, opacity: dim ? 0.55 : 1 }}>{initials || '?'}</div>
              )}
              {!dim && <div style={{ ...styles.dot, background: meta.color }} />}
            </div>
            <div style={styles.nameCol}>
              <div style={styles.nameLine}>
                <span style={{ ...styles.name, color: dim ? 'var(--text-mid)' : (topRole?.color || 'var(--text-hi)') }}>{displayName}</span>
                {isOwner && <CrownIcon size={13} style={{ color: '#F0B429', flexShrink: 0 }} title="Dono do servidor" />}
              </div>
              <div style={styles.sub}>{subtitle}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  wrap: {
    width: 240, flexShrink: 0, background: 'var(--bg-base)', borderRadius: 'var(--radius-lg)',
    border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: { display: 'flex', alignItems: 'center', gap: 4, padding: '16px 12px 10px 16px' },
  title: { fontSize: 15, fontWeight: 700, color: 'var(--text-hi)' },
  subtitle: { fontSize: 12, color: 'var(--text-low)', marginTop: 1 },
  iconBtn: {
    width: 30, height: 30, borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--text-mid)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  },
  iconBtnActive: { background: 'var(--accent-soft)', color: 'var(--text-hi)' },
  searchBox: {
    display: 'flex', alignItems: 'center', gap: 7, margin: '0 12px 8px', height: 34, padding: '0 8px 0 10px',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10,
  },
  searchInput: { flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-hi)', fontSize: 12.5, fontFamily: 'inherit' },
  clearBtn: {
    width: 18, height: 18, borderRadius: 9, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-mid)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  list: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 8px 12px' },
  label: {
    display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--text-mid)',
    padding: '6px 8px 6px',
  },
  labelDot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 12, cursor: 'default' },
  avatarWrap: { position: 'relative', flexShrink: 0 },
  avatar: {
    width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 700, fontSize: 12, color: 'var(--on-color)',
  },
  avatarImg: { width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', display: 'block' },
  dot: { position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: '50%', border: '3px solid var(--bg-base)' },
  nameCol: { minWidth: 0, flex: 1 },
  nameLine: { display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 },
  name: { fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  sub: { fontSize: 11.5, color: 'var(--text-low)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginTop: 1 },
  empty: { fontSize: 12.5, color: 'var(--text-low)', textAlign: 'center', padding: '16px 0' },
};
