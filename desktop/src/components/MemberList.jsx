import React from 'react';
import { resolveAssetUrl } from '../api';
import { statusMeta } from './UserProfilePopup';

export default function MemberList({ members }) {
  const online = members.filter((m) => m.status && m.status !== 'offline');
  const offline = members.filter((m) => !m.status || m.status === 'offline');

  return (
    <div style={styles.wrap}>
      <Group title={`Online — ${online.length}`} members={online} />
      <Group title={`Offline — ${offline.length}`} members={offline} dim />
    </div>
  );
}

function Group({ title, members, dim }) {
  if (members.length === 0) return null;
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={styles.label}>{title}</div>
      {members.map((m) => {
        const displayName = m.display_name || m.username;
        const initials = (displayName || '?')
          .split(' ')
          .map((part) => part[0])
          .join('')
          .slice(0, 2)
          .toUpperCase();
        const topRole = (m.roles && m.roles[0]) || null;
        const dotColor = dim ? 'var(--text-low)' : statusMeta(m.status).color;

        return (
          <div key={m.id} style={styles.row}>
            <div style={styles.avatarWrap}>
              {m.avatar_url ? (
                <img src={resolveAssetUrl(m.avatar_url)} alt={displayName} style={{ ...styles.avatarImg, opacity: dim ? 0.4 : 1 }} />
              ) : (
                <div style={{ ...styles.avatar, background: m.avatar_color, opacity: dim ? 0.4 : 1 }}>
                  {initials || '?'}
                </div>
              )}
              <div style={{ ...styles.dot, background: dotColor }} />
            </div>
            <div style={styles.nameCol}>
              <span style={{ fontSize: 13.5, fontWeight: topRole ? 700 : 400, color: dim ? 'var(--text-low)' : (topRole?.color || 'var(--text-hi)') }}>
                {displayName}
              </span>
              {m.is_owner && <span style={styles.ownerTag}>DONO</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

const styles = {
  wrap: { width: 216, background: 'var(--bg-base)', borderLeft: '1px solid var(--border)', padding: '16px 12px', overflowY: 'auto' },
  label: { fontSize: 11, fontWeight: 700, color: 'var(--text-low)', textTransform: 'uppercase', marginBottom: 8, letterSpacing: 0.4 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '5px 4px' },
  avatarWrap: { position: 'relative' },
  avatar: { width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 11, color: '#0B0F14' },
  avatarImg: { width: 28, height: 28, borderRadius: '50%', objectFit: 'cover', display: 'block', border: '1px solid rgba(255,255,255,0.12)' },
  dot: { position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', border: '2px solid var(--bg-base)' },
  nameCol: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 },
  ownerTag: { fontSize: 8.5, fontWeight: 800, color: '#F0B429', border: '1px solid rgba(240,180,41,0.3)', borderRadius: 6, padding: '1px 4px', letterSpacing: 0.3, flexShrink: 0 },
};
