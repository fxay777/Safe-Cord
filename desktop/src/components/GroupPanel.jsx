import React, { useState } from 'react';
import { EditIcon, TrashIcon } from './Icons';

// "Grupos" = categorias de canais (como no Discord: uma categoria agrupa vários canais).
// Só quem CRIOU a categoria (ou o dono do servidor) pode excluí-la — o backend garante isso,
// aqui só escondemos o botão pra não confundir quem não pode.
export default function GroupPanel({ categories = [], canManage, currentUserId, isOwner, onCreateCategory, onRenameCategory, onDeleteCategory }) {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [renamingId, setRenamingId] = useState(null);
  const [renameValue, setRenameValue] = useState('');

  async function submitCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError('');
    try {
      await onCreateCategory?.(trimmed);
      setName('');
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível criar a categoria');
    }
  }

  function startRename(category) {
    setRenamingId(category.id);
    setRenameValue(category.name);
  }

  async function confirmRename(id) {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    try {
      await onRenameCategory?.(id, trimmed);
      setRenamingId(null);
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível renomear');
    }
  }

  async function handleDelete(id) {
    setError('');
    try {
      await onDeleteCategory?.(id);
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível excluir a categoria');
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.headerRow}>
        <span style={styles.title}>Categorias (Grupos)</span>
        <span style={styles.badge}>{categories.length}</span>
      </div>

      {error && <div style={styles.errorText}>{error}</div>}

      <div style={styles.list}>
        {categories.length === 0 && <div style={styles.emptyText}>Nenhuma categoria ainda.</div>}
        {categories.map((category) => {
          const canDelete = isOwner || category.created_by === currentUserId;
          return (
            <div key={category.id} style={styles.item}>
              <div style={styles.dot} />
              {renamingId === category.id ? (
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && confirmRename(category.id)}
                  onBlur={() => confirmRename(category.id)}
                  autoFocus
                  style={styles.renameInput}
                />
              ) : (
                <div style={styles.itemBody} onDoubleClick={() => canManage && startRename(category)}>
                  <div style={styles.groupName}>{category.name}</div>
                </div>
              )}

              {canManage && renamingId !== category.id && (
                <button type="button" style={styles.iconBtn} onClick={() => startRename(category)} title="Renomear"><EditIcon size={13} /></button>
              )}
              {canDelete && (
                <button type="button" style={styles.iconBtnDanger} onClick={() => handleDelete(category.id)} title="Excluir"><TrashIcon size={13} /></button>
              )}
            </div>
          );
        })}
      </div>

      {canManage && (
        <div style={styles.form}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submitCreate()}
            style={styles.input}
            placeholder="Nova categoria..."
          />
          <button type="button" style={styles.button} onClick={submitCreate}>+</button>
        </div>
      )}
      {!canManage && (
        <div style={styles.hintText}>Você não tem permissão para criar categorias.</div>
      )}
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
  emptyText: { fontSize: 12, color: 'var(--text-low)', padding: '6px 2px' },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  item: { display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '9px 12px' },
  dot: { width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 },
  itemBody: { flex: 1, minWidth: 0, cursor: 'default' },
  groupName: { fontSize: 13, fontWeight: 700, color: 'var(--text-hi)' },
  renameInput: {
    flex: 1, background: 'rgba(0,0,0,0.25)', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 6,
    color: 'var(--text-hi)', fontSize: 13, padding: '4px 8px',
  },
  iconBtn: { width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(0,0,0,0.2)', color: 'var(--text-mid)', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconBtnDanger: { width: 26, height: 26, borderRadius: 8, border: '1px solid rgba(248,113,113,0.15)', background: 'rgba(248,113,113,0.04)', color: '#FCA5A5', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  form: { display: 'flex', gap: 8, marginTop: 12 },
  hintText: { fontSize: 11.5, color: 'var(--text-low)', marginTop: 10 },
  input: { width: '100%', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 8, color: 'var(--text-hi)', fontSize: 12, padding: '9px 12px' },
  button: { minWidth: 44, height: 34, borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.06)', color: 'var(--text-hi)', fontWeight: 700, cursor: 'pointer', fontSize: 14 },
};
