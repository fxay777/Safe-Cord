import React, { useState } from 'react';
import { resolveAssetUrl } from '../api';

export default function MemberRoleManager({ members = [], roles = [], canManage, onAssignRoles }) {
  const [openId, setOpenId] = useState(null);
  const [error, setError] = useState('');

  async function toggleRole(member, roleId) {
    if (!canManage) return;
    const current = (member.roles || []).map((r) => r.id);
    const next = current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId];
    try {
      await onAssignRoles?.(member.id, next);
      setError('');
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível atualizar os cargos');
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.headerRow}>
        <span style={styles.title}>Membros</span>
        <span style={styles.badge}>{members.length}</span>
      </div>

      {error && <div style={styles.errorText}>{error}</div>}
      {!canManage && <div style={styles.hintText}>Você só pode visualizar — não tem permissão pra atribuir cargos.</div>}

      <div style={styles.list}>
        {members.map((member) => {
          const name = member.display_name || member.username;
          const avatarUrl = resolveAssetUrl(member.avatar_url);
          const initials = (name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
          const isOpen = openId === member.id;
          const memberRoleIds = new Set((member.roles || []).map((r) => r.id));

          return (
            <div key={member.id} style={styles.row}>
              <button
                type="button"
                style={styles.rowHeader}
                onClick={() => setOpenId(isOpen ? null : member.id)}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt={name} style={styles.avatarImg} />
                ) : (
                  <div style={{ ...styles.avatar, background: member.avatar_color || 'var(--accent)' }}>{initials || '?'}</div>
                )}
                <div style={styles.rowMeta}>
                  <div style={styles.rowName}>
                    {name}
                    {member.is_owner && <span style={styles.ownerTag}>DONO</span>}
                  </div>
                  <div style={styles.rolePills}>
                    {(member.roles || []).length === 0 && <span style={styles.noRole}>sem cargo</span>}
                    {(member.roles || []).map((r) => (
                      <span key={r.id} style={{ ...styles.pill, background: r.color }}>{r.name}</span>
                    ))}
                  </div>
                </div>
                <span style={styles.chevron}>{isOpen ? '▲' : '▼'}</span>
              </button>

              {isOpen && (
                <div style={styles.roleChecklist}>
                  {roles.length === 0 && <div style={styles.hintText}>Nenhum cargo criado ainda — crie um na aba Cargos.</div>}
                  {roles.map((role) => (
                    <label key={role.id} style={styles.checkItem}>
                      <input
                        type="checkbox"
                        checked={memberRoleIds.has(role.id)}
                        disabled={!canManage}
                        onChange={() => toggleRole(member, role.id)}
                      />
                      <span style={{ ...styles.pill, background: role.color }}>{role.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    background: 'rgba(22, 27, 35, 0.9)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 14,
    padding: 14,
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
  },
  headerRow: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, padding: '2px 2px 8px' },
  title: { fontSize: 11, fontWeight: 800, color: 'var(--text-low)', letterSpacing: 0.45, textTransform: 'uppercase' },
  badge: { background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', color: 'var(--text-low)', borderRadius: 999, padding: '2px 8px', fontSize: 10, fontWeight: 700 },
  errorText: { color: 'var(--danger)', fontSize: 11.5, marginBottom: 8 },
  hintText: { fontSize: 11.5, color: 'var(--text-low)', marginBottom: 8 },
  list: { display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' },
  row: { background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, overflow: 'hidden' },
  rowHeader: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' },
  avatar: { width: 30, height: 30, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 11, color: '#fff', flexShrink: 0 },
  avatarImg: { width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 },
  rowMeta: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 13, fontWeight: 700, color: 'var(--text-hi)', display: 'flex', alignItems: 'center', gap: 6 },
  ownerTag: { fontSize: 9, fontWeight: 800, color: '#F0B429', border: '1px solid rgba(240,180,41,0.3)', borderRadius: 6, padding: '1px 5px', letterSpacing: 0.4 },
  rolePills: { display: 'flex', gap: 4, marginTop: 3, flexWrap: 'wrap' },
  noRole: { fontSize: 10.5, color: 'var(--text-low)' },
  pill: { fontSize: 10, fontWeight: 700, color: '#fff', borderRadius: 999, padding: '2px 8px' },
  chevron: { fontSize: 9, color: 'var(--text-low)', flexShrink: 0 },
  roleChecklist: { padding: '4px 12px 12px 52px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid rgba(255,255,255,0.04)' },
  checkItem: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text-mid)' },
};
