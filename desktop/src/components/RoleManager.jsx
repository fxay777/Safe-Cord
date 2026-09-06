import React, { useMemo, useState } from 'react';
import { GearIcon } from './Icons';

const permissionCatalog = [
  { key: 'ver_canais', label: 'Ver canais' },
  { key: 'enviar_mensagens', label: 'Enviar mensagens' },
  { key: 'criar_canais', label: 'Criar canais e categorias' },
  { key: 'gerenciar_canais', label: 'Gerenciar/excluir canais' },
  { key: 'gerenciar_cargos', label: 'Gerenciar cargos' },
  { key: 'gerenciar_membros', label: 'Atribuir cargo a membros' },
  { key: 'banir_membros', label: 'Banir/expulsar membros' },
  { key: 'gerenciar_servidor', label: 'Gerenciar servidor' },
];

export default function RoleManager({ roles = [], canManage, onCreateRole, onUpdateRole, onDeleteRole }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('var(--accent)');
  const [configOpen, setConfigOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [menuOpenId, setMenuOpenId] = useState(null);
  const [error, setError] = useState('');

  async function submitCreate() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setError('');
    try {
      await onCreateRole?.(trimmed, color, {
        permissions: ['ver_canais', 'enviar_mensagens'],
      });
      setName('');
      setColor('var(--accent)');
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível criar o cargo');
    }
  }

  function openEdit(role) {
    setEditing({
      id: role.id,
      name: role.name,
      color: role.color || 'var(--accent)',
      permissions: role.permissions || [],
    });
    setConfigOpen(true);
    setMenuOpenId(null);
  }

  async function saveEdit() {
    if (!editing) return;
    setError('');
    try {
      await onUpdateRole?.(editing.id, {
        name: editing.name,
        color: editing.color,
        permissions: editing.permissions,
      });
      setConfigOpen(false);
      setEditing(null);
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível salvar o cargo');
    }
  }

  async function deleteRole(id) {
    setError('');
    try {
      await onDeleteRole?.(id);
      if (editing?.id === id) {
        setConfigOpen(false);
        setEditing(null);
      }
      setMenuOpenId(null);
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível excluir o cargo');
    }
  }

  function togglePermission(key) {
    if (!editing) return;
    setEditing((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(key)
        ? prev.permissions.filter((item) => item !== key)
        : [...prev.permissions, key],
    }));
  }

  const groupedPermissions = useMemo(
    () => permissionCatalog.map((permission) => ({
      ...permission,
      enabled: editing?.permissions?.includes(permission.key) || false,
    })),
    [editing]
  );

  return (
    <div style={styles.wrap}>
      <div style={styles.headerRow}>
        <span style={styles.title}>Cargos</span>
        <div style={styles.headerActions}>
          <span style={styles.badge}>{roles.length}</span>
          {canManage && (
            <button 
              type="button" 
              style={styles.configBtn} 
              onClick={() => {
                if (configOpen && !editing) {
                  setConfigOpen(false);
                } else {
                  setEditing(null);
                  setConfigOpen(true);
                }
              }}
            >
              {configOpen && !editing ? 'Fechar' : 'Novo Cargo'}
            </button>
          )}
        </div>
      </div>

      {error && <div style={styles.errorText}>{error}</div>}
      {!canManage && <div style={styles.hintText}>Você não tem permissão pra gerenciar cargos — só visualizando.</div>}

      <div style={styles.list}>
        {roles.map((role) => (
          <div
            key={role.id}
            style={styles.roleRow}
            onContextMenu={(event) => {
              if (!canManage) return;
              event.preventDefault();
              setMenuOpenId((prev) => (prev === role.id ? null : role.id));
            }}
          >
            <span style={{ ...styles.pill, background: role.color || 'var(--accent)' }}>{role.name}</span>
            <div style={styles.roleActions}>
              <span style={styles.permission}>{(role.permissions || []).length} perms</span>
              {canManage && (
                <button type="button" style={styles.iconBtn} onClick={() => openEdit(role)}><GearIcon size={13} /></button>
              )}
            </div>

            {menuOpenId === role.id && canManage && (
              <div style={styles.contextMenu} onMouseLeave={() => setMenuOpenId(null)}>
                <button type="button" style={styles.contextBtn} onClick={() => openEdit(role)}>Configurar cargo</button>
                <button type="button" style={styles.contextBtn} onClick={() => { openEdit(role); setMenuOpenId(null); }}>Permissões</button>
                <button type="button" style={styles.contextBtnDanger} onClick={() => deleteRole(role.id)}>Excluir cargo</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {configOpen && (
        <div style={styles.editor}>
          <div style={styles.editorTitle}>
            {editing ? `Editando cargo: ${editing.name}` : 'Adicionar cargo'}
          </div>
          
          <input
            value={editing ? editing.name : name}
            onChange={(e) => {
              if (editing) setEditing((prev) => ({ ...prev, name: e.target.value }));
              else setName(e.target.value);
            }}
            style={styles.input}
            placeholder="Nome do cargo"
          />

          <div style={styles.colorRow}>
            {['#2DD4BF', 'var(--accent)', '#F0B429', '#F87171', '#34D399', '#A78BFA'].map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => {
                  if (editing) setEditing((prev) => ({ ...prev, color: swatch }));
                  else setColor(swatch);
                }}
                style={{
                  ...styles.colorDot,
                  background: swatch,
                  border: (editing?.color || color) === swatch ? '2px solid #fff' : '2px solid transparent',
                }}
              />
            ))}
          </div>

          <div style={styles.permissionBox}>
            <div style={styles.permissionTitle}>Permissões do cargo</div>
            <div style={styles.permissionList}>
              {groupedPermissions.map((permission) => (
                <label key={permission.key} style={styles.permissionItem}>
                  <input
                    type="checkbox"
                    checked={permission.enabled}
                    onChange={() => togglePermission(permission.key)}
                  />
                  <span>{permission.label}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={styles.editorActions}>
            {editing && (
              <button type="button" style={styles.deleteBtn} onClick={() => deleteRole(editing.id)}>
                Excluir
              </button>
            )}
            <button type="button" style={styles.secondaryBtn} onClick={() => { setConfigOpen(false); setEditing(null); }}>
              Fechar
            </button>
            <button type="button" style={styles.button} onClick={editing ? saveEdit : submitCreate}>
              {editing ? 'Salvar' : 'Criar'}
            </button>
          </div>
        </div>
      )}

      {!configOpen && canManage && (
        <div style={styles.form}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={styles.input}
            placeholder="Novo cargo rápido..."
          />
          <button type="button" style={styles.button} onClick={submitCreate}>
            +
          </button>
        </div>
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
    marginTop: 12,
    boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    position: 'relative',
  },
  headerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    padding: '2px 2px 8px',
  },
  title: {
    fontSize: 11,
    fontWeight: 800,
    color: 'var(--text-low)',
    letterSpacing: 0.45,
    textTransform: 'uppercase',
  },
  headerActions: { display: 'flex', alignItems: 'center', gap: 8 },
  errorText: { color: 'var(--danger)', fontSize: 11.5, marginBottom: 8 },
  hintText: { fontSize: 11.5, color: 'var(--text-low)', marginBottom: 10 },
  badge: {
    background: 'rgba(255,255,255,0.03)',
    border: '1px solid rgba(255,255,255,0.06)',
    color: 'var(--text-low)',
    borderRadius: 999,
    padding: '2px 8px',
    fontSize: 10,
    fontWeight: 700,
  },
  configBtn: {
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.02)',
    color: 'var(--text-mid)',
    padding: '5px 10px',
    fontSize: 10,
    cursor: 'pointer',
    fontWeight: 600,
  },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  roleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    background: 'rgba(255,255,255,0.02)',
    borderRadius: 10,
    padding: '9px 12px',
    border: '1px solid rgba(255,255,255,0.05)',
    position: 'relative',
  },
  roleActions: { display: 'flex', alignItems: 'center', gap: 10 },
  pill: {
    borderRadius: 999,
    color: '#fff',
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 10px',
    boxShadow: 'none',
    opacity: 0.95,
  },
  permission: {
    fontSize: 11,
    color: 'var(--text-low)',
  },
  iconBtn: {
    width: 26,
    height: 26,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(0,0,0,0.2)',
    color: 'var(--text-mid)',
    cursor: 'pointer',
    fontSize: 11,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextMenu: {
    position: 'absolute',
    right: 0,
    top: 'calc(100% + 6px)',
    width: 180,
    background: '#171D27',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 10,
    boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
    display: 'flex',
    flexDirection: 'column',
    zIndex: 20,
    overflow: 'hidden',
  },
  contextBtn: {
    border: 'none',
    background: 'transparent',
    color: 'var(--text-mid)',
    textAlign: 'left',
    padding: '10px 12px',
    cursor: 'pointer',
    fontSize: 12,
  },
  contextBtnDanger: {
    border: 'none',
    background: 'transparent',
    color: '#FCA5A5',
    textAlign: 'left',
    padding: '10px 12px',
    cursor: 'pointer',
    fontSize: 12,
  },
  editor: {
    marginTop: 12,
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12,
    background: 'rgba(12,16,22,0.95)',
    padding: 12,
    display: 'flex',
    flexDirection: 'column',
    gap: 12,
  },
  editorTitle: { fontSize: 11, fontWeight: 700, color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: 0.4 },
  colorRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  colorDot: { width: 22, height: 22, borderRadius: '50%', cursor: 'pointer' },
  permissionBox: { border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: 10, background: 'rgba(255,255,255,0.01)' },
  permissionTitle: { fontSize: 10, color: 'var(--text-low)', textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.35, marginBottom: 8 },
  permissionList: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 },
  permissionItem: { display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-mid)', fontSize: 11 },
  form: { display: 'flex', gap: 8, marginTop: 12 },
  input: {
    width: '100%',
    background: 'rgba(255,255,255,0.02)',
    border: '1px solid rgba(255,255,255,0.06)',
    borderRadius: 12,
    color: 'var(--text-hi)',
    fontSize: 12,
    padding: '9px 12px',
  },
  editorActions: { display: 'flex', justifyContent: 'flex-end', gap: 8, alignItems: 'center' },
  secondaryBtn: {
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 12,
    background: 'transparent',
    color: 'var(--text-mid)',
    padding: '7px 12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 12,
  },
  deleteBtn: {
    border: '1px solid rgba(248,113,113,0.15)',
    borderRadius: 12,
    background: 'rgba(248,113,113,0.04)',
    color: '#FCA5A5',
    padding: '7px 12px',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: 12,
  },
  button: {
    minWidth: 72,
    height: 34,
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.08)',
    background: 'rgba(255,255,255,0.06)',
    color: 'var(--text-hi)',
    fontWeight: 700,
    cursor: 'pointer',
    fontSize: 12,
  },
};