import React, { useEffect, useMemo, useState } from 'react';
import { resolveAssetUrl } from '../api';
import {
  CloseIcon, CheckIcon, HashIcon, SpeakerIcon, TrashIcon, EditIcon, PlusIcon, ImageIcon, SearchIcon,
  UsersIcon, ShieldCheckIcon, GearIcon, CrownIcon, LinkIcon, UserPlusIcon, AlertIcon, ChevronDownIcon,
} from './Icons';

// ─── Configurações do servidor (estilo Discord) ─────────────────────────────
// Visão geral · Canais · Cargos · Membros · Convites · Banimentos

const SERVER_COLORS = ['#1E7BFF', '#3A9BFF', '#6FB1FF', '#8B7CFF', '#FF7EB6', '#FF8A65', '#FFC857', '#4CD6A0', '#2EC4C4', '#F2555A'];
const ROLE_COLORS = ['#1E7BFF', '#6FB1FF', '#8B7CFF', '#E879F9', '#FF7EB6', '#F2555A', '#FF8A65', '#FFC857', '#4CD6A0', '#2EC4C4', '#94A3B8'];

// Descrição de cada permissão, pra ninguém dar poder sem entender
const PERMISSION_HELP = {
  ver_canais: 'Pode ver os canais de texto e voz do servidor.',
  enviar_mensagens: 'Pode mandar mensagens nos canais de texto.',
  criar_canais: 'Pode criar canais e categorias novas.',
  gerenciar_canais: 'Pode renomear, mudar a descrição e excluir canais e categorias.',
  gerenciar_cargos: 'Pode criar, editar e excluir cargos (abaixo do dono).',
  gerenciar_membros: 'Pode dar e tirar cargos dos membros.',
  banir_membros: 'Pode expulsar e banir membros. Use com cuidado.',
  gerenciar_servidor: 'Pode mudar nome, descrição, cor, ícone, banner e o convite.',
};

export default function ServerSettingsModal({
  api, server, categories, roles, members, user, permissions,
  onClose, onUpdateServer, onUploadServerImage, onRemoveServerImage, onRegenerateInvite,
  onCreateChannel, onUpdateChannel, onDeleteChannel, onCreateCategory, onRenameCategory, onDeleteCategory,
  onCreateRole, onUpdateRole, onDeleteRole, onAssignMemberRoles, onMemberRemoved,
  onDeleteServer, onLeaveServer, initialSection = 'overview',
}) {
  const perms = permissions?.permissions || [];
  const isOwner = server.owner_id === user?.id || permissions?.isOwner;
  const can = (key) => isOwner || perms.includes(key);
  const canChannels = can('criar_canais') || can('gerenciar_canais');

  const sections = [
    { id: 'overview', label: 'Visão geral', Icon: GearIcon, show: true },
    { id: 'channels', label: 'Canais', Icon: HashIcon, show: canChannels },
    { id: 'roles', label: 'Cargos', Icon: ShieldCheckIcon, show: can('gerenciar_cargos') },
    { id: 'members', label: 'Membros', Icon: UsersIcon, show: true },
    { id: 'invites', label: 'Convites', Icon: LinkIcon, show: true },
    { id: 'bans', label: 'Banimentos', Icon: AlertIcon, show: can('banir_membros') },
  ].filter((s) => s.show);

  const [section, setSection] = useState(sections.some((s) => s.id === initialSection) ? initialSection : 'overview');
  const [dangerOpen, setDangerOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.shell} onClick={(e) => e.stopPropagation()}>
        <aside style={S.nav}>
          <div style={S.navServer}>
            <ServerIcon server={server} size={36} />
            <div style={{ minWidth: 0 }}>
              <div style={S.navServerName}>{server.name}</div>
              <div style={S.navServerSub}>Configurações</div>
            </div>
          </div>
          {sections.map(({ id, label, Icon }) => (
            <button key={id} type="button" onClick={() => setSection(id)} style={{ ...S.navItem, ...(section === id ? S.navItemActive : {}) }}>
              <Icon size={15} /> {label}
            </button>
          ))}
          <div style={{ flex: 1 }} />
          <button type="button" style={S.navDanger} onClick={() => setDangerOpen(true)}>
            {isOwner ? <><TrashIcon size={14} /> Excluir servidor</> : <><AlertIcon size={14} /> Sair do servidor</>}
          </button>
        </aside>

        <main style={S.content}>
          <button type="button" style={S.close} onClick={onClose} aria-label="Fechar" title="Fechar (Esc)"><CloseIcon size={16} /></button>

          {section === 'overview' && (
            <Overview
              server={server} canEdit={can('gerenciar_servidor')} members={members} categories={categories}
              onUpdateServer={onUpdateServer} onUploadServerImage={onUploadServerImage} onRemoveServerImage={onRemoveServerImage}
            />
          )}
          {section === 'channels' && (
            <Channels
              server={server} categories={categories} canCreate={can('criar_canais')} canManage={can('gerenciar_canais')}
              onCreateChannel={onCreateChannel} onUpdateChannel={onUpdateChannel} onDeleteChannel={onDeleteChannel}
              onCreateCategory={onCreateCategory} onRenameCategory={onRenameCategory} onDeleteCategory={onDeleteCategory}
            />
          )}
          {section === 'roles' && (
            <Roles api={api} server={server} roles={roles} members={members} onCreateRole={onCreateRole} onUpdateRole={onUpdateRole} onDeleteRole={onDeleteRole} />
          )}
          {section === 'members' && (
            <Members
              api={api} server={server} members={members} roles={roles} user={user}
              canAssign={can('gerenciar_membros')} canModerate={can('banir_membros')} isOwner={isOwner}
              onAssignMemberRoles={onAssignMemberRoles} onMemberRemoved={onMemberRemoved}
            />
          )}
          {section === 'invites' && <Invites server={server} canRegenerate={can('gerenciar_servidor')} onRegenerateInvite={onRegenerateInvite} />}
          {section === 'bans' && <Bans api={api} server={server} />}
        </main>

        {dangerOpen && (
          <Confirm
            title={isOwner ? `Excluir "${server.name}"?` : `Sair de "${server.name}"?`}
            text={isOwner
              ? 'Isso apaga o servidor, todos os canais e mensagens pra sempre. Não dá pra desfazer.'
              : 'Você vai precisar de um novo convite pra voltar.'}
            confirmLabel={isOwner ? 'Excluir de vez' : 'Sair agora'}
            requireText={isOwner ? server.name : null}
            onCancel={() => setDangerOpen(false)}
            onConfirm={() => { (isOwner ? onDeleteServer : onLeaveServer)?.(server.id); onClose(); }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Visão geral ────────────────────────────────────────────────────────────
function Overview({ server, canEdit, members, categories, onUpdateServer, onUploadServerImage, onRemoveServerImage }) {
  const original = { name: server.name || '', description: server.description || '', color: server.color || '#1E7BFF' };
  const [draft, setDraft] = useState(original);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => { setDraft({ name: server.name || '', description: server.description || '', color: server.color || '#1E7BFF' }); }, [server.id, server.name, server.description, server.color]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(original);

  async function save() {
    if (!draft.name.trim()) return setError('O servidor precisa de um nome');
    setSaving(true); setError('');
    try {
      await onUpdateServer({ name: draft.name.trim(), description: draft.description, color: draft.color });
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível salvar');
    } finally {
      setSaving(false);
    }
  }

  async function pick(kind, e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpe?g|webp|gif)$/.test(file.type)) return setError('Use PNG, JPG, WEBP ou GIF.');
    if (file.size > 8 * 1024 * 1024) return setError('Imagem muito grande (máx. 8MB).');
    setUploading(kind); setError('');
    try { await onUploadServerImage(kind, file); } catch (err) { setError(err?.response?.data?.error || 'Falha ao enviar a imagem'); } finally { setUploading(null); }
  }

  const banner = resolveAssetUrl(server.banner_url);
  const icon = resolveAssetUrl(server.icon_url);
  const previewServer = { ...server, ...draft };
  const online = members.filter((m) => m.status && m.status !== 'offline').length;

  return (
    <div>
      <Header title="Visão geral" sub="Como o servidor aparece pra todo mundo." />
      <div style={S.overviewGrid}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          <div style={S.imageRow}>
            <div style={S.iconPick}>
              <ServerIcon server={previewServer} size={84} radius={26} />
              {canEdit && (
                <div style={S.iconActions}>
                  <label style={S.btnSmall}>{uploading === 'icon' ? 'Enviando…' : icon ? 'Trocar ícone' : 'Enviar ícone'}
                    <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => pick('icon', e)} />
                  </label>
                  {icon && <button type="button" style={S.linkDanger} onClick={() => onRemoveServerImage('icon')}>Remover</button>}
                </div>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={S.label}>Banner</div>
              <div style={{ ...S.bannerPick, ...(banner ? { backgroundImage: `url(${banner})` } : { background: `linear-gradient(135deg, ${draft.color}, #0A1430)` }), opacity: uploading === 'banner' ? 0.6 : 1 }}>
                {canEdit && (
                  <div style={S.bannerActions}>
                    <label style={S.btnOnImage}><ImageIcon size={13} /> {uploading === 'banner' ? 'Enviando…' : banner ? 'Trocar' : 'Enviar banner'}
                      <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => pick('banner', e)} />
                    </label>
                    {banner && <button type="button" style={S.btnOnImage} onClick={() => onRemoveServerImage('banner')}>Remover</button>}
                  </div>
                )}
              </div>
              <div style={S.hint}>Recomendado: 960×540. Só quem é membro vê o banner.</div>
            </div>
          </div>

          <Field label="Nome do servidor">
            <input style={S.input} value={draft.name} maxLength={60} disabled={!canEdit} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
          </Field>
          <Field label="Descrição" counter={`${draft.description.length}/300`}>
            <textarea style={{ ...S.input, resize: 'none', lineHeight: 1.5 }} rows={3} maxLength={300} disabled={!canEdit}
              value={draft.description} placeholder="Do que é esse servidor?" onChange={(e) => setDraft((d) => ({ ...d, description: e.target.value }))} />
          </Field>
          <Field label="Cor do servidor" hint="Aparece no ícone (quando não há imagem) e no fundo do card.">
            <div style={S.swatches}>
              {SERVER_COLORS.map((c) => (
                <button key={c} type="button" disabled={!canEdit} onClick={() => setDraft((d) => ({ ...d, color: c }))}
                  style={{ ...S.swatch, background: c, ...(draft.color.toLowerCase() === c.toLowerCase() ? S.swatchOn : {}) }}>
                  {draft.color.toLowerCase() === c.toLowerCase() && <CheckIcon size={12} />}
                </button>
              ))}
              <label style={S.swatchCustom} title="Outra cor">
                <span style={{ width: 14, height: 14, borderRadius: '50%', background: draft.color, border: '2px solid var(--bg-surface)' }} />
                <input type="color" value={draft.color} disabled={!canEdit} onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))} style={S.hiddenColor} />
              </label>
            </div>
          </Field>
          {error && <div style={S.error}>{error}</div>}
          {!canEdit && <div style={S.hint}>Você não tem permissão pra editar o servidor.</div>}
        </div>

        <div>
          <div style={S.label}>Prévia</div>
          <div style={{ ...S.previewCard, ...(banner ? { backgroundImage: `linear-gradient(180deg, rgba(5,10,22,0.05) 30%, rgba(5,10,22,0.85)), url(${banner})` } : { backgroundImage: `radial-gradient(circle at 85% 20%, rgba(255,255,255,0.22), transparent 38%), linear-gradient(140deg, color-mix(in srgb, ${draft.color} 85%, #050A16), #0A1430 95%)` }) }}>
            <div style={S.previewName}>{draft.name || 'Sem nome'}</div>
            <div style={S.previewDesc}>{draft.description || 'Bem-vindo ao servidor!'}</div>
          </div>
          <div style={S.statGrid}>
            <Stat label="Membros" value={members.length} />
            <Stat label="Online" value={online} />
            <Stat label="Canais" value={server.channels.length} />
            <Stat label="Categorias" value={categories.length} />
          </div>
        </div>
      </div>

      {canEdit && dirty && (
        <SaveBar saving={saving} onReset={() => setDraft(original)} onSave={save} />
      )}
    </div>
  );
}

// ─── Canais e categorias ────────────────────────────────────────────────────
function Channels({ server, categories, canCreate, canManage, onCreateChannel, onUpdateChannel, onDeleteChannel, onCreateCategory, onRenameCategory, onDeleteCategory }) {
  const [editing, setEditing] = useState(null); // channel id
  const [adding, setAdding] = useState(null);   // category id | 'none'
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('text');
  const [newCategory, setNewCategory] = useState('');
  const [renamingCat, setRenamingCat] = useState(null);
  const [catName, setCatName] = useState('');
  const [confirm, setConfirm] = useState(null);
  const [error, setError] = useState('');

  const groups = useMemo(() => {
    const byCat = categories.map((c) => ({ category: c, channels: server.channels.filter((ch) => ch.category_id === c.id) }));
    const loose = server.channels.filter((ch) => !ch.category_id || !categories.some((c) => c.id === ch.category_id));
    return [{ category: null, channels: loose }, ...byCat];
  }, [categories, server.channels]);

  async function run(fn, fallback) {
    setError('');
    try { await fn(); return true; } catch (err) { setError(err?.response?.data?.error || fallback); return false; }
  }

  async function addChannel(catId) {
    const name = newName.trim();
    if (!name) return;
    if (await run(() => onCreateChannel(name, newType, catId === 'none' ? null : catId), 'Não foi possível criar o canal')) {
      setNewName(''); setAdding(null); setNewType('text');
    }
  }

  async function addCategory() {
    const name = newCategory.trim();
    if (!name) return;
    if (await run(() => onCreateCategory(name), 'Não foi possível criar a categoria')) setNewCategory('');
  }

  return (
    <div>
      <Header title="Canais" sub="Organize os canais em categorias, dê nome e descrição pra cada um." />
      {error && <div style={{ ...S.error, marginBottom: 12 }}>{error}</div>}

      {groups.map(({ category, channels }) => {
        if (!category && channels.length === 0 && adding !== 'none') return null;
        const key = category?.id || 'none';
        return (
          <div key={key} style={S.catBlock}>
            <div style={S.catHead}>
              <ChevronDownIcon size={13} style={{ color: 'var(--text-low)' }} />
              {renamingCat === key ? (
                <form style={{ display: 'flex', gap: 6, flex: 1 }} onSubmit={async (e) => { e.preventDefault(); if (await run(() => onRenameCategory(category.id, catName.trim()), 'Não foi possível renomear')) setRenamingCat(null); }}>
                  <input autoFocus style={{ ...S.input, padding: '6px 10px', fontSize: 13 }} value={catName} maxLength={40} onChange={(e) => setCatName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setRenamingCat(null)} />
                  <button type="submit" style={S.btnSmallPrimary}>Salvar</button>
                </form>
              ) : (
                <span style={S.catName}>{category ? category.name : 'Sem categoria'}</span>
              )}
              <span style={S.catCount}>{channels.length}</span>
              {canCreate && <IconBtn title="Novo canal aqui" onClick={() => { setAdding(key); setNewName(''); }}><PlusIcon size={14} /></IconBtn>}
              {category && canManage && renamingCat !== key && <IconBtn title="Renomear categoria" onClick={() => { setRenamingCat(key); setCatName(category.name); }}><EditIcon size={13} /></IconBtn>}
              {category && canManage && <IconBtn title="Excluir categoria" danger onClick={() => setConfirm({ kind: 'category', item: category })}><TrashIcon size={13} /></IconBtn>}
            </div>

            {channels.map((ch) => (
              <ChannelRow
                key={ch.id} channel={ch} categories={categories} canManage={canManage}
                open={editing === ch.id} onToggle={() => setEditing(editing === ch.id ? null : ch.id)}
                onSave={async (patch) => { if (await run(() => onUpdateChannel(ch.id, patch), 'Não foi possível salvar o canal')) setEditing(null); }}
                onDelete={() => setConfirm({ kind: 'channel', item: ch })}
              />
            ))}
            {channels.length === 0 && adding !== key && <div style={S.emptyCat}>Nenhum canal nessa categoria.</div>}

            {adding === key && (
              <div style={S.addChannel}>
                <div style={S.typeToggle}>
                  {[['text', 'Texto', HashIcon], ['voice', 'Voz', SpeakerIcon]].map(([t, label, Icon]) => (
                    <button key={t} type="button" onClick={() => setNewType(t)} style={{ ...S.typeBtn, ...(newType === t ? S.typeBtnOn : {}) }}><Icon size={13} /> {label}</button>
                  ))}
                </div>
                <input autoFocus style={{ ...S.input, flex: 1 }} placeholder={newType === 'text' ? 'nome-do-canal' : 'Sala de voz'} value={newName} maxLength={60}
                  onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addChannel(key); if (e.key === 'Escape') setAdding(null); }} />
                <button type="button" style={S.btnPrimary} onClick={() => addChannel(key)} disabled={!newName.trim()}>Criar</button>
                <button type="button" style={S.btnGhost} onClick={() => setAdding(null)}>Cancelar</button>
              </div>
            )}
          </div>
        );
      })}

      {canCreate && (
        <div style={S.newCat}>
          <input style={{ ...S.input, flex: 1 }} placeholder="Nome da nova categoria (ex.: Jogos)" value={newCategory} maxLength={40}
            onChange={(e) => setNewCategory(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addCategory()} />
          <button type="button" style={S.btnPrimary} onClick={addCategory} disabled={!newCategory.trim()}><PlusIcon size={14} /> Criar categoria</button>
        </div>
      )}

      {confirm && (
        <Confirm
          title={confirm.kind === 'channel' ? `Excluir #${confirm.item.name}?` : `Excluir a categoria "${confirm.item.name}"?`}
          text={confirm.kind === 'channel' ? 'Todas as mensagens desse canal serão apagadas.' : 'Os canais dela não são apagados — ficam sem categoria.'}
          confirmLabel="Excluir"
          onCancel={() => setConfirm(null)}
          onConfirm={async () => {
            const target = confirm; setConfirm(null);
            await run(() => (target.kind === 'channel' ? onDeleteChannel(target.item.id) : onDeleteCategory(target.item.id)), 'Não foi possível excluir');
          }}
        />
      )}
    </div>
  );
}

function ChannelRow({ channel, categories, canManage, open, onToggle, onSave, onDelete }) {
  const [name, setName] = useState(channel.name);
  const [topic, setTopic] = useState(channel.topic || '');
  const [cat, setCat] = useState(channel.category_id || '');
  useEffect(() => { if (open) { setName(channel.name); setTopic(channel.topic || ''); setCat(channel.category_id || ''); } }, [open, channel]);
  const Icon = channel.type === 'voice' ? SpeakerIcon : HashIcon;

  return (
    <div style={{ ...S.chRow, ...(open ? S.chRowOpen : {}) }}>
      <button type="button" style={S.chHead} onClick={canManage ? onToggle : undefined}>
        <Icon size={15} style={{ color: 'var(--text-low)', flexShrink: 0 }} />
        <span style={S.chName}>{channel.name}</span>
        <span style={S.chTopic}>{channel.topic || (channel.type === 'voice' ? 'Canal de voz' : 'Sem descrição')}</span>
        {canManage && <EditIcon size={13} style={{ color: 'var(--text-low)', flexShrink: 0 }} />}
      </button>
      {open && (
        <div style={S.chEdit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Field label="Nome"><input style={S.input} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></Field>
            <Field label="Categoria">
              <select style={S.input} value={cat} onChange={(e) => setCat(e.target.value)}>
                <option value="">Sem categoria</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
          </div>
          {channel.type !== 'voice' && (
            <Field label="Descrição do canal" counter={`${topic.length}/160`} hint="Aparece embaixo do nome, no topo do chat.">
              <input style={S.input} value={topic} maxLength={160} placeholder="Sobre o que é esse canal?" onChange={(e) => setTopic(e.target.value)} />
            </Field>
          )}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button type="button" style={S.linkDanger} onClick={onDelete}><TrashIcon size={13} /> Excluir canal</button>
            <div style={{ flex: 1 }} />
            <button type="button" style={S.btnGhost} onClick={onToggle}>Cancelar</button>
            <button type="button" style={S.btnPrimary} disabled={!name.trim()} onClick={() => onSave({ name: name.trim(), topic, category_id: cat || null })}>Salvar</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Cargos ─────────────────────────────────────────────────────────────────
function Roles({ api, server, roles, members, onCreateRole, onUpdateRole, onDeleteRole }) {
  const [catalog, setCatalog] = useState([]);
  const [selectedId, setSelectedId] = useState(roles[0]?.id || null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get(`/servers/${server.id}/roles/permissions-catalog`).then(({ data }) => setCatalog(data.permissions)).catch(() => {});
  }, [api, server.id]);

  const selected = roles.find((r) => r.id === selectedId) || null;
  useEffect(() => {
    setDraft(selected ? { name: selected.name, color: selected.color || '#94A3B8', permissions: [...(selected.permissions || [])] } : null);
    setError('');
  }, [selectedId, selected?.name, selected?.color, JSON.stringify(selected?.permissions)]);

  const countFor = (roleId) => members.filter((m) => (m.roles || []).some((r) => r.id === roleId)).length;
  const dirty = selected && draft && JSON.stringify(draft) !== JSON.stringify({ name: selected.name, color: selected.color || '#94A3B8', permissions: selected.permissions || [] });

  async function create() {
    setError('');
    try {
      const role = await onCreateRole('novo cargo', '#6FB1FF', { permissions: ['ver_canais', 'enviar_mensagens'] });
      if (role?.id) setSelectedId(role.id);
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível criar o cargo');
    }
  }

  async function save() {
    if (!draft.name.trim()) return setError('Dê um nome pro cargo');
    setSaving(true); setError('');
    try { await onUpdateRole(selected.id, { name: draft.name.trim(), color: draft.color, permissions: draft.permissions }); } catch (err) { setError(err?.response?.data?.error || 'Não foi possível salvar'); } finally { setSaving(false); }
  }

  function toggle(key) {
    setDraft((d) => ({ ...d, permissions: d.permissions.includes(key) ? d.permissions.filter((k) => k !== key) : [...d.permissions, key] }));
  }

  return (
    <div>
      <Header title="Cargos" sub="Cargos dão cor ao nome e definem o que cada pessoa pode fazer. O dono sempre pode tudo." />
      <div style={S.rolesLayout}>
        <div style={S.roleList}>
          <button type="button" style={{ ...S.btnPrimary, width: '100%', marginBottom: 8 }} onClick={create}><PlusIcon size={14} /> Criar cargo</button>
          {roles.length === 0 && <div style={S.hint}>Nenhum cargo ainda.</div>}
          {roles.map((r) => (
            <button key={r.id} type="button" onClick={() => setSelectedId(r.id)} style={{ ...S.roleItem, ...(selectedId === r.id ? S.roleItemOn : {}) }}>
              <span style={{ ...S.roleDot, background: r.color || '#94A3B8' }} />
              <span style={S.roleItemName}>{r.name}</span>
              <span style={S.roleCount}><UsersIcon size={11} /> {countFor(r.id)}</span>
            </button>
          ))}
        </div>

        <div style={S.roleEditor}>
          {!draft ? (
            <div style={S.emptyBox}>
              <ShieldCheckIcon size={28} style={{ color: 'var(--accent)' }} />
              <div style={{ fontWeight: 650, color: 'var(--text-hi)', marginTop: 8 }}>Escolha ou crie um cargo</div>
              <div style={S.hint}>Ex.: Moderador, VIP, Membro verificado…</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                <span style={{ ...S.rolePreview, color: draft.color }}>{draft.name || 'cargo'}</span>
                <span style={S.hint}>é assim que o nome aparece no chat</span>
              </div>
              <Field label="Nome do cargo"><input style={S.input} value={draft.name} maxLength={32} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} /></Field>
              <Field label="Cor">
                <div style={S.swatches}>
                  {ROLE_COLORS.map((c) => (
                    <button key={c} type="button" onClick={() => setDraft((d) => ({ ...d, color: c }))} style={{ ...S.swatch, width: 28, height: 28, background: c, ...(draft.color.toLowerCase() === c.toLowerCase() ? S.swatchOn : {}) }}>
                      {draft.color.toLowerCase() === c.toLowerCase() && <CheckIcon size={11} />}
                    </button>
                  ))}
                  <label style={{ ...S.swatchCustom, width: 28, height: 28 }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', background: draft.color, border: '2px solid var(--bg-surface)' }} />
                    <input type="color" value={draft.color} onChange={(e) => setDraft((d) => ({ ...d, color: e.target.value }))} style={S.hiddenColor} />
                  </label>
                </div>
              </Field>
              <div style={{ ...S.label, marginTop: 6 }}>Permissões</div>
              <div style={S.permList}>
                {catalog.map((p) => (
                  <label key={p.key} style={S.permRow}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={S.permName}>{p.label}</div>
                      <div style={S.permHelp}>{PERMISSION_HELP[p.key] || ''}</div>
                    </div>
                    <Toggle on={draft.permissions.includes(p.key)} onChange={() => toggle(p.key)} danger={p.key === 'banir_membros' || p.key === 'gerenciar_servidor'} />
                  </label>
                ))}
              </div>
              {error && <div style={{ ...S.error, marginTop: 10 }}>{error}</div>}
              <div style={{ display: 'flex', gap: 8, marginTop: 14, alignItems: 'center' }}>
                <button type="button" style={S.linkDanger} onClick={() => setConfirm(true)}><TrashIcon size={13} /> Excluir cargo</button>
                <div style={{ flex: 1 }} />
                {dirty && <button type="button" style={S.btnGhost} onClick={() => setDraft({ name: selected.name, color: selected.color || '#94A3B8', permissions: [...(selected.permissions || [])] })}>Desfazer</button>}
                <button type="button" style={S.btnPrimary} disabled={!dirty || saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar cargo'}</button>
              </div>
            </>
          )}
        </div>
      </div>
      {confirm && selected && (
        <Confirm title={`Excluir o cargo "${selected.name}"?`} text={`${countFor(selected.id)} pessoa(s) perdem esse cargo.`} confirmLabel="Excluir"
          onCancel={() => setConfirm(false)}
          onConfirm={async () => { setConfirm(false); try { await onDeleteRole(selected.id); setSelectedId(roles.find((r) => r.id !== selected.id)?.id || null); } catch (err) { setError(err?.response?.data?.error || 'Não foi possível excluir'); } }} />
      )}
    </div>
  );
}

// ─── Membros ────────────────────────────────────────────────────────────────
function Members({ api, server, members, roles, user, canAssign, canModerate, isOwner, onAssignMemberRoles, onMemberRemoved }) {
  const [query, setQuery] = useState('');
  const [roleMenu, setRoleMenu] = useState(null); // member id
  const [action, setAction] = useState(null);     // { kind: 'kick'|'ban', member }
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const q = query.trim().toLowerCase();
  const list = members
    .filter((m) => !q || `${m.display_name || ''} ${m.username}#${m.tag}`.toLowerCase().includes(q))
    .sort((a, b) => (b.id === server.owner_id) - (a.id === server.owner_id) || (a.display_name || a.username).localeCompare(b.display_name || b.username));

  const isModerator = (m) => (m.roles || []).some((r) => {
    const full = roles.find((x) => x.id === r.id);
    return full?.permissions?.includes('banir_membros') || full?.permissions?.includes('gerenciar_servidor');
  });
  const canActOn = (m) => canModerate && m.id !== user?.id && m.id !== server.owner_id && (isOwner || !isModerator(m));

  async function toggleRole(member, roleId) {
    const current = (member.roles || []).map((r) => r.id);
    const next = current.includes(roleId) ? current.filter((id) => id !== roleId) : [...current, roleId];
    setError('');
    try { await onAssignMemberRoles(member.id, next); } catch (err) { setError(err?.response?.data?.error || 'Não foi possível mudar os cargos'); }
  }

  async function doAction() {
    setBusy(true); setError('');
    try {
      await api.post(`/servers/${server.id}/members/${action.member.id}/${action.kind}`, action.kind === 'ban' ? { reason } : undefined);
      onMemberRemoved?.(action.member.id);
      setAction(null); setReason('');
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível concluir');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <Header title="Membros" sub={`${members.length} pessoa(s) no servidor.`} />
      <label style={S.search}>
        <SearchIcon size={14} style={{ color: 'var(--text-low)' }} />
        <input style={S.searchInput} placeholder="Buscar membro…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      {error && <div style={{ ...S.error, marginBottom: 10 }}>{error}</div>}

      <div style={S.memberList}>
        {list.map((m) => {
          const name = m.display_name || m.username;
          const avatar = resolveAssetUrl(m.avatar_url);
          const owner = m.id === server.owner_id;
          return (
            <div key={m.id} style={S.memberRow}>
              {avatar ? <img src={avatar} alt="" style={S.memberAvatar} /> : <span style={{ ...S.memberAvatar, background: m.avatar_color || 'var(--accent)' }}>{name[0]?.toUpperCase()}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.memberName}>
                  <span style={{ color: m.roles?.[0]?.color || 'var(--text-hi)' }}>{name}</span>
                  {owner && <CrownIcon size={13} style={{ color: '#F0B429' }} />}
                  <span style={S.memberTag}>{m.username}#{m.tag}</span>
                </div>
                <div style={S.memberRoles}>
                  {(m.roles || []).map((r) => (
                    <span key={r.id} style={S.roleChip}><span style={{ ...S.roleDot, width: 8, height: 8, background: r.color || '#94A3B8' }} />{r.name}</span>
                  ))}
                  {(m.roles || []).length === 0 && <span style={S.memberMeta}>{owner ? 'Dono do servidor' : 'Sem cargo'}</span>}
                  {m.joined_at && <span style={S.memberMeta}>· entrou em {new Date(m.joined_at).toLocaleDateString('pt-BR')}</span>}
                </div>
              </div>

              <div style={{ position: 'relative', display: 'flex', gap: 6 }}>
                {canAssign && roles.length > 0 && (
                  <button type="button" style={S.btnSmall} onClick={() => setRoleMenu(roleMenu === m.id ? null : m.id)}>
                    <ShieldCheckIcon size={13} /> Cargos
                  </button>
                )}
                {canActOn(m) && (
                  <>
                    <button type="button" style={S.btnSmallDanger} onClick={() => setAction({ kind: 'kick', member: m })}>Expulsar</button>
                    <button type="button" style={S.btnSmallDanger} onClick={() => setAction({ kind: 'ban', member: m })}>Banir</button>
                  </>
                )}
                {roleMenu === m.id && (
                  <div style={S.roleMenu} onMouseLeave={() => setRoleMenu(null)}>
                    {roles.map((r) => {
                      const has = (m.roles || []).some((x) => x.id === r.id);
                      return (
                        <button key={r.id} type="button" style={S.roleMenuItem} onClick={() => toggleRole(m, r.id)}>
                          <span style={{ ...S.check, ...(has ? { background: r.color || 'var(--accent)', borderColor: 'transparent' } : {}) }}>{has && <CheckIcon size={10} />}</span>
                          <span style={{ color: r.color || 'var(--text-hi)', fontWeight: 600 }}>{r.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {list.length === 0 && <div style={S.hint}>Ninguém com esse nome.</div>}
      </div>

      {action && (
        <Confirm
          title={action.kind === 'ban' ? `Banir ${action.member.display_name || action.member.username}?` : `Expulsar ${action.member.display_name || action.member.username}?`}
          text={action.kind === 'ban' ? 'A pessoa sai do servidor e não consegue voltar, nem com convite, até ser desbanida.' : 'A pessoa sai do servidor, mas pode voltar com um convite.'}
          confirmLabel={busy ? 'Aguarde…' : action.kind === 'ban' ? 'Banir' : 'Expulsar'}
          onCancel={() => { setAction(null); setReason(''); }}
          onConfirm={doAction}
        >
          {action.kind === 'ban' && (
            <input style={{ ...S.input, marginTop: 12 }} placeholder="Motivo (opcional, só a moderação vê)" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          )}
        </Confirm>
      )}
    </div>
  );
}

// ─── Convites ───────────────────────────────────────────────────────────────
function Invites({ server, canRegenerate, onRegenerateInvite }) {
  const [copied, setCopied] = useState(null);
  const [busy, setBusy] = useState(false);
  const message = `Entra no meu servidor "${server.name}" no SafeCord! Código de convite: ${server.invite_code}`;
  function copy(text, which) { navigator.clipboard?.writeText(text); setCopied(which); setTimeout(() => setCopied(null), 1500); }

  return (
    <div>
      <Header title="Convites" sub="Quem tem o código entra no servidor (menos quem foi banido)." />
      <div style={S.inviteCard}>
        <div style={S.inviteIcon}><UserPlusIcon size={22} /></div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={S.label}>Código de convite</div>
          <div style={S.inviteCode}>{server.invite_code}</div>
        </div>
        <button type="button" style={S.btnPrimary} onClick={() => copy(server.invite_code, 'code')}>{copied === 'code' ? <><CheckIcon size={14} /> Copiado</> : 'Copiar código'}</button>
      </div>
      <Field label="Mensagem pronta pra mandar">
        <div style={S.inviteMsg}>
          <span style={{ flex: 1 }}>{message}</span>
          <button type="button" style={S.btnSmall} onClick={() => copy(message, 'msg')}>{copied === 'msg' ? 'Copiada' : 'Copiar'}</button>
        </div>
      </Field>
      {canRegenerate && (
        <div style={S.regenBox}>
          <div>
            <div style={{ fontWeight: 650, color: 'var(--text-hi)', fontSize: 14 }}>Gerar um código novo</div>
            <div style={S.hint}>O código atual para de funcionar na hora. Use se ele vazou pra quem não devia.</div>
          </div>
          <button type="button" style={S.btnGhost} disabled={busy} onClick={async () => { setBusy(true); try { await onRegenerateInvite(); } finally { setBusy(false); } }}>
            {busy ? 'Gerando…' : 'Gerar novo'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Banimentos ─────────────────────────────────────────────────────────────
function Bans({ api, server }) {
  const [bans, setBans] = useState(null);
  const [error, setError] = useState('');
  const load = () => api.get(`/servers/${server.id}/bans`).then(({ data }) => setBans(data.bans)).catch((err) => setError(err?.response?.data?.error || 'Não foi possível carregar'));
  useEffect(() => { load(); }, [server.id]);

  async function unban(userId) {
    try { await api.delete(`/servers/${server.id}/bans/${userId}`); load(); } catch (err) { setError(err?.response?.data?.error || 'Não foi possível desbanir'); }
  }

  return (
    <div>
      <Header title="Banimentos" sub="Quem foi banido não entra de novo, nem com convite." />
      {error && <div style={S.error}>{error}</div>}
      {bans === null && !error && <div style={S.hint}>Carregando…</div>}
      {bans?.length === 0 && (
        <div style={S.emptyBox}>
          <ShieldCheckIcon size={28} style={{ color: 'var(--success)' }} />
          <div style={{ fontWeight: 650, color: 'var(--text-hi)', marginTop: 8 }}>Ninguém banido</div>
          <div style={S.hint}>Pra banir alguém, vá em Membros.</div>
        </div>
      )}
      <div style={S.memberList}>
        {(bans || []).map((b) => {
          const name = b.display_name || b.username;
          const avatar = resolveAssetUrl(b.avatar_url);
          return (
            <div key={b.user_id} style={S.memberRow}>
              {avatar ? <img src={avatar} alt="" style={S.memberAvatar} /> : <span style={{ ...S.memberAvatar, background: b.avatar_color || 'var(--accent)' }}>{name[0]?.toUpperCase()}</span>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={S.memberName}>{name} <span style={S.memberTag}>{b.username}#{b.tag}</span></div>
                <div style={S.memberMeta}>
                  {b.reason ? `Motivo: ${b.reason}` : 'Sem motivo informado'} · {new Date(b.created_at).toLocaleDateString('pt-BR')}
                  {b.mod_username ? ` · por ${b.mod_display_name || b.mod_username}` : ''}
                </div>
              </div>
              <button type="button" style={S.btnSmall} onClick={() => unban(b.user_id)}>Desbanir</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── pecinhas ───────────────────────────────────────────────────────────────
export function ServerIcon({ server, size = 40, radius }) {
  const icon = resolveAssetUrl(server?.icon_url);
  const color = server?.color || '#1E7BFF';
  const r = radius ?? size * 0.3;
  if (icon) return <img src={icon} alt="" style={{ width: size, height: size, borderRadius: r, objectFit: 'cover', flexShrink: 0 }} />;
  const initials = (server?.name || '?').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span style={{
      width: size, height: size, borderRadius: r, flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      color: '#fff', fontWeight: 700, fontSize: size * 0.36,
      background: `radial-gradient(circle at 30% 25%, color-mix(in srgb, ${color} 55%, #ffffff), ${color} 55%, color-mix(in srgb, ${color} 70%, #000000))`,
    }}>{initials}</span>
  );
}

function Header({ title, sub }) {
  return (
    <div style={{ marginBottom: 20, paddingRight: 40 }}>
      <h2 style={S.h2}>{title}</h2>
      {sub && <div style={S.sub}>{sub}</div>}
    </div>
  );
}

function Field({ label, hint, counter, children }) {
  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <div style={S.label}>{label}</div>
        {counter && <span style={S.counter}>{counter}</span>}
      </div>
      {children}
      {hint && <div style={S.hint}>{hint}</div>}
    </div>
  );
}

function Stat({ label, value }) {
  return <div style={S.stat}><div style={S.statValue}>{value}</div><div style={S.statLabel}>{label}</div></div>;
}

function IconBtn({ title, onClick, danger, children }) {
  return (
    <button type="button" className="sc-icon-btn" title={title} onClick={onClick} style={{ ...S.iconBtn, ...(danger ? { color: 'var(--danger)' } : {}) }}>{children}</button>
  );
}

function Toggle({ on, onChange, danger }) {
  return (
    <span role="switch" aria-checked={on} tabIndex={0} onClick={(e) => { e.preventDefault(); onChange(); }} onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && onChange()}
      style={{ ...S.toggle, background: on ? (danger ? 'var(--danger)' : 'var(--accent)') : 'var(--bg-hover)' }}>
      <span style={{ ...S.toggleKnob, transform: on ? 'translateX(18px)' : 'translateX(0)' }} />
    </span>
  );
}

function SaveBar({ saving, onReset, onSave }) {
  return (
    <div style={S.saveBar}>
      <span style={{ flex: 1, fontWeight: 550 }}>Cuidado — você tem alterações não salvas!</span>
      <button type="button" style={S.saveReset} onClick={onReset} disabled={saving}>Redefinir</button>
      <button type="button" style={S.saveBtn} onClick={onSave} disabled={saving}>{saving ? 'Salvando…' : 'Salvar alterações'}</button>
    </div>
  );
}

function Confirm({ title, text, confirmLabel, requireText, onCancel, onConfirm, children }) {
  const [typed, setTyped] = useState('');
  const blocked = requireText && typed.trim() !== requireText;
  return (
    <div style={{ ...S.overlay, zIndex: 210 }} onClick={onCancel}>
      <div style={S.confirm} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 17, fontWeight: 750, color: 'var(--text-hi)' }}>{title}</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-mid)', lineHeight: 1.5, marginTop: 8 }}>{text}</div>
        {requireText && (
          <>
            <div style={{ ...S.label, marginTop: 14 }}>Digite <strong style={{ color: 'var(--text-hi)' }}>{requireText}</strong> pra confirmar</div>
            <input autoFocus style={S.input} value={typed} onChange={(e) => setTyped(e.target.value)} />
          </>
        )}
        {children}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <button type="button" style={S.btnGhost} onClick={onCancel}>Cancelar</button>
          <button type="button" style={{ ...S.btnPrimary, background: 'var(--danger)', opacity: blocked ? 0.5 : 1 }} disabled={blocked} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

const S = {
  overlay: { position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 },
  shell: {
    position: 'relative', width: 1040, maxWidth: '100%', height: 700, maxHeight: '94vh', display: 'flex', overflow: 'hidden',
    background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 26, boxShadow: 'var(--shadow-lg)',
  },
  nav: { width: 232, flexShrink: 0, background: 'var(--bg-base)', borderRight: '1px solid var(--border)', padding: 14, display: 'flex', flexDirection: 'column', gap: 3 },
  navServer: { display: 'flex', alignItems: 'center', gap: 10, padding: '4px 6px 14px', marginBottom: 6, borderBottom: '1px solid var(--border)' },
  navServerName: { fontSize: 14.5, fontWeight: 700, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  navServerSub: { fontSize: 11.5, color: 'var(--text-low)' },
  navItem: {
    display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', border: 'none', background: 'transparent',
    color: 'var(--text-mid)', fontSize: 14, fontWeight: 550, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
  },
  navItemActive: { background: 'var(--accent)', color: 'var(--accent-contrast)', boxShadow: '0 6px 18px var(--accent-glow)' },
  navDanger: {
    display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'color-mix(in srgb, var(--danger) 10%, transparent)', color: 'var(--danger)',
    fontSize: 13, fontWeight: 600, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
  },
  content: { position: 'relative', flex: 1, minWidth: 0, overflowY: 'auto', padding: '26px 30px 90px' },
  close: { position: 'absolute', top: 18, right: 18, width: 36, height: 36, borderRadius: 18, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  h2: { margin: 0, fontSize: 22, fontWeight: 750, color: 'var(--text-hi)', letterSpacing: -0.4 },
  sub: { fontSize: 13.5, color: 'var(--text-low)', marginTop: 4 },
  label: { fontSize: 12.5, fontWeight: 650, color: 'var(--text-mid)', margin: '0 0 7px 2px' },
  counter: { fontSize: 11.5, color: 'var(--text-low)' },
  hint: { fontSize: 12, color: 'var(--text-low)', marginTop: 6, lineHeight: 1.45 },
  input: {
    width: '100%', boxSizing: 'border-box', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12,
    padding: '10px 12px', color: 'var(--text-hi)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
  },
  error: { fontSize: 12.5, color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)', borderRadius: 12, padding: '9px 12px' },
  btnPrimary: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6, border: 'none', background: 'var(--accent)', color: 'var(--accent-contrast)',
    fontWeight: 650, fontSize: 13, padding: '9px 16px', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  btnGhost: {
    display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-hi)',
    fontWeight: 600, fontSize: 13, padding: '8px 14px', borderRadius: 11, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  btnSmall: {
    display: 'inline-flex', alignItems: 'center', gap: 5, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-hi)',
    fontWeight: 600, fontSize: 12, padding: '6px 11px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  btnSmallPrimary: { border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 650, fontSize: 12, padding: '6px 12px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' },
  btnSmallDanger: { border: 'none', background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)', fontWeight: 600, fontSize: 12, padding: '6px 11px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit' },
  linkDanger: { display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', color: 'var(--danger)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0, fontFamily: 'inherit' },
  iconBtn: { width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-low)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },

  // visão geral
  overviewGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 1.35fr) minmax(0, 1fr)', gap: 26 },
  imageRow: { display: 'flex', gap: 18, alignItems: 'flex-start' },
  iconPick: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 },
  iconActions: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 },
  bannerPick: { position: 'relative', height: 108, borderRadius: 16, backgroundSize: 'cover', backgroundPosition: 'center', border: '1px solid var(--border)' },
  bannerActions: { position: 'absolute', right: 8, bottom: 8, display: 'flex', gap: 6 },
  btnOnImage: { display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'rgba(5,10,22,0.6)', color: '#fff', fontSize: 12, fontWeight: 600, padding: '6px 10px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', backdropFilter: 'blur(6px)' },
  swatches: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' },
  swatch: { width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  swatchOn: { boxShadow: '0 0 0 3px var(--bg-surface), 0 0 0 5px var(--text-hi)' },
  swatchCustom: { position: 'relative', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', background: 'conic-gradient(#FF7EB6, #FFC857, #4CD6A0, #3A9BFF, #8B7CFF, #FF7EB6)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  hiddenColor: { position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' },
  previewCard: {
    height: 150, borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
    backgroundSize: 'cover', backgroundPosition: 'center', border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
  },
  previewName: { fontSize: 19, fontWeight: 750, color: '#fff', textShadow: '0 1px 8px rgba(0,0,0,0.35)' },
  previewDesc: { fontSize: 12.5, color: 'rgba(235,242,255,0.85)', marginTop: 3, lineHeight: 1.4 },
  statGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 12 },
  stat: { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 14, padding: '10px 12px' },
  statValue: { fontSize: 20, fontWeight: 800, color: 'var(--text-hi)' },
  statLabel: { fontSize: 12, color: 'var(--text-low)' },

  // canais
  catBlock: { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 18, padding: 8, marginBottom: 12 },
  catHead: { display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px 8px' },
  catName: { flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-hi)' },
  catCount: { fontSize: 11, fontWeight: 650, color: 'var(--text-low)', background: 'var(--bg-elevated)', borderRadius: 999, padding: '2px 8px' },
  emptyCat: { fontSize: 12.5, color: 'var(--text-low)', padding: '6px 10px 8px' },
  chRow: { borderRadius: 12, marginBottom: 2 },
  chRowOpen: { background: 'var(--bg-elevated)', border: '1px solid var(--border)' },
  chHead: { display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', background: 'transparent', padding: '9px 10px', borderRadius: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' },
  chName: { fontSize: 14, fontWeight: 600, color: 'var(--text-hi)', whiteSpace: 'nowrap' },
  chTopic: { flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text-low)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  chEdit: { padding: '4px 12px 12px', display: 'flex', flexDirection: 'column', gap: 12 },
  addChannel: { display: 'flex', gap: 8, alignItems: 'center', padding: '6px 4px 4px', flexWrap: 'wrap' },
  typeToggle: { display: 'flex', gap: 2, background: 'var(--bg-elevated)', borderRadius: 10, padding: 3 },
  typeBtn: { display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent', color: 'var(--text-mid)', fontSize: 12.5, fontWeight: 600, padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' },
  typeBtnOn: { background: 'var(--accent)', color: '#fff' },
  newCat: { display: 'flex', gap: 8, marginTop: 4 },

  // cargos
  rolesLayout: { display: 'grid', gridTemplateColumns: '220px minmax(0, 1fr)', gap: 16, alignItems: 'start' },
  roleList: { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 18, padding: 8, display: 'flex', flexDirection: 'column', gap: 2 },
  roleItem: { display: 'flex', alignItems: 'center', gap: 9, width: '100%', border: 'none', background: 'transparent', padding: '9px 10px', borderRadius: 11, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' },
  roleItemOn: { background: 'var(--accent-soft)' },
  roleDot: { width: 12, height: 12, borderRadius: '50%', flexShrink: 0, display: 'inline-block' },
  roleItemName: { flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 600, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  roleCount: { display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 11.5, color: 'var(--text-low)' },
  roleEditor: { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 18, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 },
  rolePreview: { fontSize: 16, fontWeight: 700, background: 'var(--bg-elevated)', borderRadius: 10, padding: '6px 12px' },
  permList: { display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' },
  permRow: { display: 'flex', alignItems: 'center', gap: 14, padding: '11px 14px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: 'var(--bg-surface)' },
  permName: { fontSize: 13.5, fontWeight: 650, color: 'var(--text-hi)' },
  permHelp: { fontSize: 12, color: 'var(--text-low)', marginTop: 2 },
  toggle: { position: 'relative', width: 40, height: 22, borderRadius: 11, flexShrink: 0, cursor: 'pointer', transition: 'background 0.15s ease' },
  toggleKnob: { position: 'absolute', top: 3, left: 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', transition: 'transform 0.15s ease', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' },
  emptyBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '40px 20px' },

  // membros
  search: { display: 'flex', alignItems: 'center', gap: 8, height: 40, padding: '0 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 12, cursor: 'text' },
  searchInput: { flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-hi)', fontSize: 13.5, fontFamily: 'inherit' },
  memberList: { display: 'flex', flexDirection: 'column', gap: 6 },
  memberRow: { display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 14, padding: '10px 12px' },
  memberAvatar: { width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-color)', fontWeight: 700, fontSize: 15 },
  memberName: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 650, color: 'var(--text-hi)', minWidth: 0 },
  memberTag: { fontSize: 12, fontWeight: 500, color: 'var(--text-low)' },
  memberRoles: { display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginTop: 4 },
  memberMeta: { fontSize: 12, color: 'var(--text-low)' },
  roleChip: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: 'var(--text-hi)', background: 'var(--bg-elevated)', borderRadius: 999, padding: '3px 9px' },
  roleMenu: { position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 200, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 14, boxShadow: 'var(--shadow-lg)', padding: 6, zIndex: 20 },
  roleMenuItem: { display: 'flex', alignItems: 'center', gap: 9, width: '100%', border: 'none', background: 'transparent', padding: '8px 9px', borderRadius: 9, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit', textAlign: 'left' },
  check: { width: 18, height: 18, borderRadius: 6, border: '2px solid var(--text-low)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 },

  // convites
  inviteCard: { display: 'flex', alignItems: 'center', gap: 14, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 18, padding: 16, marginBottom: 18 },
  inviteIcon: { width: 48, height: 48, borderRadius: 15, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  inviteCode: { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 26, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: 2 },
  inviteMsg: { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', fontSize: 13, color: 'var(--text-mid)' },
  regenBox: { display: 'flex', alignItems: 'center', gap: 14, justifyContent: 'space-between', marginTop: 18, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 16, padding: 14 },

  // barra de salvar / confirmação
  saveBar: {
    position: 'sticky', bottom: -70, marginTop: 24, display: 'flex', alignItems: 'center', gap: 10, background: 'var(--text-hi)', color: 'var(--bg-surface)',
    borderRadius: 16, padding: '10px 10px 10px 18px', boxShadow: 'var(--shadow-lg)', fontSize: 13.5,
  },
  saveReset: { border: 'none', background: 'transparent', color: 'var(--bg-surface)', fontWeight: 600, fontSize: 13, cursor: 'pointer', padding: '8px 12px', opacity: 0.8, fontFamily: 'inherit' },
  saveBtn: { border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 650, fontSize: 13, cursor: 'pointer', padding: '9px 16px', borderRadius: 11, fontFamily: 'inherit' },
  confirm: { width: 420, maxWidth: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 22, padding: 22, boxShadow: 'var(--shadow-lg)' },
};
