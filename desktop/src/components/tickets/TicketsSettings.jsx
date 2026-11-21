import React, { useEffect, useMemo, useState } from 'react';
import { TicketIcon, PlusIcon, TrashIcon, EditIcon, CloseIcon, LockIcon, HashIcon, CheckIcon, ArrowLeftIcon } from '../Icons';
import { OptionIcon, ICON_LIST, ticketNo, errText, personName } from './ticketUtils';

// Seção "Tickets" das configurações do servidor: painéis (mensagem com botões) + lista de tickets.

const COLORS = ['#1E7BFF', '#4CD6A0', '#F0B429', '#E5484D', '#B794FF', '#FF7EB6', '#2EC4C4', '#8A94A6'];
const blankOption = () => ({ label: '', description: '', color: '#1E7BFF', icon: 'help', questions: [] });
const blankPanel = (channels) => ({
  title: 'Central de atendimento',
  description: 'Precisa de ajuda? Escolha uma opção abaixo e a equipe te atende num canal privado.',
  color: '#1E7BFF',
  channel_id: channels[0]?.id || '',
  staff_role_ids: [],
  category_id: '',
  max_open_per_user: 1,
  welcome_message: 'Oi! Conta pra gente com detalhes o que aconteceu. Alguém da equipe já vai te responder.',
  options: [{ ...blankOption(), label: 'Suporte', description: 'Dúvidas e problemas', icon: 'help', questions: [{ label: 'Descreva o que está acontecendo', required: true, long: true }] }],
});

export default function TicketsSettings({ api, server, roles, categories, onGoToChannel }) {
  const [tab, setTab] = useState('panels');
  const [panels, setPanels] = useState(null);
  const [editing, setEditing] = useState(null); // null | panel draft
  const [error, setError] = useState('');
  const textChannels = useMemo(() => (server.channels || []).filter((c) => c.type === 'text' && !c.ticket_id), [server.channels]);

  const load = () => api.get(`/servers/${server.id}/tickets/panels`).then(({ data }) => setPanels(data.panels)).catch((err) => setError(errText(err)));
  useEffect(() => { load(); }, [server.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (editing) {
    return (
      <PanelEditor
        api={api}
        server={server}
        roles={roles}
        categories={categories}
        channels={textChannels}
        initial={editing}
        onCancel={() => setEditing(null)}
        onSaved={() => { setEditing(null); load(); }}
      />
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={st.h2}>Tickets</h2>
        <div style={st.sub}>Atendimento sem bot: poste um painel com botões num canal. Cada clique abre um canal privado entre a pessoa e a sua equipe.</div>
      </div>
      <div style={st.tabs}>
        {[['panels', 'Painéis'], ['tickets', 'Tickets']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setTab(id)} style={{ ...st.tab, ...(tab === id ? st.tabOn : {}) }}>{label}</button>
        ))}
      </div>
      {error && <div style={st.error}>{error}</div>}

      {tab === 'panels' && (
        <>
          {panels === null && <div style={st.hint}>Carregando…</div>}
          {panels?.length === 0 && (
            <div style={st.empty}>
              <span style={st.emptyIcon}><TicketIcon size={26} /></span>
              <div style={{ fontWeight: 700, color: 'var(--text-hi)', fontSize: 15 }}>Nenhum painel ainda</div>
              <div style={{ ...st.hint, maxWidth: 380, textAlign: 'center' }}>Crie um painel de suporte, denúncias ou compras. Você escolhe os botões, as perguntas e quem atende.</div>
              <button type="button" style={st.btnPrimary} onClick={() => setEditing(blankPanel(textChannels))}><PlusIcon size={14} /> Criar primeiro painel</button>
            </div>
          )}
          {panels?.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {panels.map((p) => (
                <PanelRow key={p.id} panel={p} server={server} roles={roles} onEdit={() => setEditing({ ...p, category_id: p.category_id || '' })} onDeleted={load} api={api} />
              ))}
              <button type="button" style={st.addBtn} onClick={() => setEditing(blankPanel(textChannels))}><PlusIcon size={14} /> Novo painel</button>
            </div>
          )}
        </>
      )}
      {tab === 'tickets' && <TicketList api={api} server={server} onGoToChannel={onGoToChannel} />}
    </div>
  );
}

function PanelRow({ api, panel, server, roles, onEdit, onDeleted }) {
  const [confirm, setConfirm] = useState(false);
  const channel = (server.channels || []).find((c) => c.id === panel.channel_id);
  const staff = roles.filter((r) => panel.staff_role_ids.includes(r.id));
  return (
    <div style={{ ...st.panelRow, borderLeft: `4px solid ${panel.color}` }} data-panel-row={panel.id}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={st.rowTitle}>{panel.title}</div>
        <div style={st.rowMeta}>
          <HashIcon size={11} /> {channel?.name || 'canal excluído'} · {panel.options.length} botão(ões) ·
          {staff.length ? ` staff: ${staff.map((r) => r.name).join(', ')}` : ' só quem gerencia tickets atende'}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
          {panel.options.map((o) => (
            <span key={o.id} style={{ ...st.optChip, background: `color-mix(in srgb, ${o.color} 14%, transparent)`, color: 'var(--text-hi)' }}>
              <OptionIcon name={o.icon} size={12} style={{ color: o.color }} /> {o.label}
              {o.questions.length > 0 && <span style={{ color: 'var(--text-low)' }}>· {o.questions.length} pergunta(s)</span>}
            </span>
          ))}
        </div>
      </div>
      <button type="button" style={st.btnSmall} onClick={onEdit}><EditIcon size={13} /> Editar</button>
      <button type="button" style={st.iconBtnDanger} onClick={() => setConfirm(true)} title="Excluir painel"><TrashIcon size={14} /></button>
      {confirm && (
        <div style={st.overlay} onClick={() => setConfirm(false)}>
          <div style={st.confirm} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 17, fontWeight: 750, color: 'var(--text-hi)' }}>Excluir "{panel.title}"?</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-mid)', marginTop: 8, lineHeight: 1.5 }}>O cartão some do canal. Tickets que já foram abertos continuam funcionando.</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
              <button type="button" style={st.btnGhost} onClick={() => setConfirm(false)}>Cancelar</button>
              <button type="button" style={{ ...st.btnPrimary, background: 'var(--danger)' }} onClick={async () => { await api.delete(`/servers/${server.id}/tickets/panels/${panel.id}`); setConfirm(false); onDeleted(); }}>Excluir</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PanelEditor({ api, server, roles, categories, channels, initial, onCancel, onSaved }) {
  const [p, setP] = useState(() => JSON.parse(JSON.stringify(initial)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setP((prev) => ({ ...prev, [k]: v }));
  const setOpt = (i, patch) => setP((prev) => ({ ...prev, options: prev.options.map((o, j) => (j === i ? { ...o, ...patch } : o)) }));
  const setQ = (i, qi, patch) => setOpt(i, { questions: p.options[i].questions.map((q, j) => (j === qi ? { ...q, ...patch } : q)) });

  async function save() {
    setBusy(true); setError('');
    const body = { ...p, category_id: p.category_id || null };
    try {
      if (p.id) await api.put(`/servers/${server.id}/tickets/panels/${p.id}`, body);
      else await api.post(`/servers/${server.id}/tickets/panels`, body);
      onSaved();
    } catch (err) {
      setError(errText(err, 'Não foi possível salvar'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div data-panel-editor>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
        <button type="button" style={st.backBtn} onClick={onCancel}><ArrowLeftIcon size={14} /></button>
        <div>
          <h2 style={{ ...st.h2, marginBottom: 0 }}>{p.id ? 'Editar painel' : 'Novo painel'}</h2>
          <div style={st.hint}>Ele aparece como uma mensagem com botões no canal que você escolher.</div>
        </div>
      </div>

      <div style={st.editorGrid}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Group title="Mensagem">
            <L label="Título"><input style={st.input} maxLength={80} value={p.title} onChange={(e) => set('title', e.target.value)} /></L>
            <L label="Descrição"><textarea style={{ ...st.input, resize: 'none', lineHeight: 1.5 }} rows={2} maxLength={400} value={p.description} onChange={(e) => set('description', e.target.value)} /></L>
            <L label="Cor"><Swatches value={p.color} onChange={(c) => set('color', c)} /></L>
            <L label="Postar no canal">
              <select style={st.input} value={p.channel_id} onChange={(e) => set('channel_id', e.target.value)}>
                {channels.map((c) => <option key={c.id} value={c.id}>#{c.name}</option>)}
              </select>
            </L>
          </Group>

          <Group title="Quem atende">
            <div style={st.hint}>Quem tem esses cargos vê e responde os tickets. O dono e quem tem "Gerenciar tickets" sempre veem.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {roles.length === 0 && <span style={st.hint}>Crie um cargo (ex.: Suporte) na aba Cargos.</span>}
              {roles.map((r) => {
                const on = p.staff_role_ids.includes(r.id);
                return (
                  <button key={r.id} type="button" onClick={() => set('staff_role_ids', on ? p.staff_role_ids.filter((x) => x !== r.id) : [...p.staff_role_ids, r.id])} style={{ ...st.roleChip, ...(on ? st.roleChipOn : {}) }}>
                    <span style={{ width: 9, height: 9, borderRadius: 5, background: r.color }} /> {r.name} {on && <CheckIcon size={12} />}
                  </button>
                );
              })}
            </div>
          </Group>

          <Group title="Canais dos tickets">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <L label="Criar na categoria">
                <select style={st.input} value={p.category_id || ''} onChange={(e) => set('category_id', e.target.value)}>
                  <option value="">"Tickets" (criada sozinha)</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </L>
              <L label="Abertos ao mesmo tempo, por pessoa">
                <div style={st.segmented}>
                  {[1, 2, 3, 5].map((n) => (
                    <button key={n} type="button" onClick={() => set('max_open_per_user', n)} style={{ ...st.seg, ...(p.max_open_per_user === n ? st.segOn : {}) }}>{n}</button>
                  ))}
                </div>
              </L>
            </div>
            <L label="Mensagem de boas-vindas (aparece no começo de cada ticket)">
              <textarea style={{ ...st.input, resize: 'none', lineHeight: 1.5 }} rows={2} maxLength={500} value={p.welcome_message} onChange={(e) => set('welcome_message', e.target.value)} />
            </L>
          </Group>

          <Group title={`Botões (${p.options.length}/5)`}>
            {p.options.map((o, i) => (
              <div key={i} style={st.optEditor} data-option-editor={i}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span style={{ ...st.optIcon, background: o.color }}><OptionIcon name={o.icon} size={14} style={{ color: '#fff' }} /></span>
                  <input style={{ ...st.input, flex: 1 }} maxLength={40} placeholder="Nome do botão (ex.: Suporte)" value={o.label} onChange={(e) => setOpt(i, { label: e.target.value })} />
                  {p.options.length > 1 && <button type="button" style={st.iconBtnDanger} title="Remover botão" onClick={() => set('options', p.options.filter((_, j) => j !== i))}><TrashIcon size={13} /></button>}
                </div>
                <input style={st.input} maxLength={100} placeholder="Descrição curta (opcional)" value={o.description} onChange={(e) => setOpt(i, { description: e.target.value })} />
                <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 4 }}>
                    {ICON_LIST.map((ic) => (
                      <button key={ic} type="button" title={ic} onClick={() => setOpt(i, { icon: ic })} style={{ ...st.iconPick, ...(o.icon === ic ? { background: o.color, color: '#fff', borderColor: o.color } : {}) }}>
                        <OptionIcon name={ic} size={13} />
                      </button>
                    ))}
                  </div>
                  <Swatches small value={o.color} onChange={(c) => setOpt(i, { color: c })} />
                </div>
                <div style={st.qBlock}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-low)' }}>Perguntas antes de abrir ({o.questions.length}/3)</div>
                  {o.questions.map((q, qi) => (
                    <div key={qi} style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                        <input style={{ ...st.input, flex: 1, padding: '8px 10px', fontSize: 13 }} maxLength={100} placeholder="Ex.: Qual o número do pedido?" value={q.label} onChange={(e) => setQ(i, qi, { label: e.target.value })} />
                        <button type="button" style={st.xBtn} title="Tirar pergunta" onClick={() => setOpt(i, { questions: o.questions.filter((_, j) => j !== qi) })}><CloseIcon size={11} /></button>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                      <button type="button" style={{ ...st.miniToggle, ...(q.required ? st.miniToggleOn : {}) }} onClick={() => setQ(i, qi, { required: !q.required })}>Obrigatória</button>
                      <button type="button" style={{ ...st.miniToggle, ...(q.long ? st.miniToggleOn : {}) }} onClick={() => setQ(i, qi, { long: !q.long })}>Resposta longa</button>
                      </div>
                    </div>
                  ))}
                  {o.questions.length < 3 && (
                    <button type="button" style={st.linkBtn} onClick={() => setOpt(i, { questions: [...o.questions, { label: '', required: true, long: false }] })}><PlusIcon size={12} /> Adicionar pergunta</button>
                  )}
                </div>
              </div>
            ))}
            {p.options.length < 5 && (
              <button type="button" style={st.addBtn} onClick={() => set('options', [...p.options, { ...blankOption(), color: p.color }])}><PlusIcon size={14} /> Adicionar botão</button>
            )}
          </Group>
        </div>

        <div style={st.previewCol}>
          <div style={st.previewLabel}>Prévia no canal</div>
          <div style={{ ...st.preview, borderLeft: `4px solid ${p.color}` }}>
            <div style={{ display: 'flex', gap: 10 }}>
              <span style={{ ...st.optIcon, width: 34, height: 34, borderRadius: 11, background: `color-mix(in srgb, ${p.color} 16%, transparent)`, color: p.color }}><TicketIcon size={16} /></span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 750, color: 'var(--text-hi)', fontSize: 14.5 }}>{p.title || 'Título do painel'}</div>
                {p.description && <div style={{ fontSize: 12, color: 'var(--text-mid)', marginTop: 2, lineHeight: 1.45 }}>{p.description}</div>}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 10 }}>
              {p.options.map((o, i) => (
                <div key={i} style={st.previewBtn}>
                  <span style={{ ...st.optIcon, width: 26, height: 26, borderRadius: 8, background: o.color }}><OptionIcon name={o.icon} size={13} style={{ color: '#fff' }} /></span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--text-hi)' }}>{o.label || 'Botão sem nome'}</span>
                    {o.description && <span style={{ display: 'block', fontSize: 11, color: 'var(--text-low)' }}>{o.description}</span>}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--text-low)', marginTop: 10 }}><LockIcon size={10} /> Canal privado entre a pessoa e a equipe</div>
          </div>
        </div>
      </div>

      {error && <div style={{ ...st.error, marginTop: 14 }}>{error}</div>}
      <div style={st.saveRow}>
        <button type="button" style={st.btnGhost} onClick={onCancel}>Cancelar</button>
        <button type="button" style={st.btnPrimary} disabled={busy} onClick={save}>{busy ? 'Salvando…' : p.id ? 'Salvar painel' : 'Criar e postar painel'}</button>
      </div>
    </div>
  );
}

function TicketList({ api, server, onGoToChannel }) {
  const [filter, setFilter] = useState('open');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    setData(null);
    api.get(`/servers/${server.id}/tickets${filter === 'all' ? '' : `?status=${filter}`}`).then(({ data: d }) => setData(d)).catch((err) => setError(errText(err)));
  }, [api, server.id, filter]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[['open', 'Abertos'], ['closed', 'Fechados'], ['all', 'Todos']].map(([id, label]) => (
          <button key={id} type="button" onClick={() => setFilter(id)} style={{ ...st.filter, ...(filter === id ? st.filterOn : {}) }}>
            {label}{data?.counts && id !== 'all' ? <span style={st.count}>{data.counts[id]}</span> : null}
          </button>
        ))}
      </div>
      {error && <div style={st.error}>{error}</div>}
      {!data && !error && <div style={st.hint}>Carregando…</div>}
      {data?.tickets.length === 0 && <div style={{ ...st.empty, padding: 26 }}><div style={st.hint}>{filter === 'open' ? 'Nenhum ticket aberto agora.' : 'Nada por aqui.'}</div></div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {data?.tickets.map((t) => (
          <button key={t.id} type="button" style={st.ticketRow} disabled={!t.channel_id} onClick={() => onGoToChannel?.(t.channel_id)} data-ticket-row={t.number}>
            <span style={st.ticketNo}>{ticketNo(t.number)}</span>
            <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
              <span style={st.rowTitle}>{t.option_label} <span style={{ fontWeight: 500, color: 'var(--text-low)' }}>· {personName(t.opener)}</span></span>
              <span style={{ ...st.rowMeta, display: 'block' }}>
                {new Date(t.created_at).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {t.claimed_by ? ` · atendido por ${personName(t.claimed_by)}` : t.status === 'open' ? ' · ninguém assumiu ainda' : ''}
                {t.close_reason ? ` · ${t.close_reason}` : ''}
                {!t.channel_id ? ' · canal excluído' : ''}
              </span>
            </span>
            <span style={{ ...st.status, ...(t.status === 'open' ? st.statusOpen : st.statusClosed) }}>{t.status === 'open' ? 'Aberto' : 'Fechado'}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Group({ title, children }) {
  return <div style={st.group}><div style={st.groupTitle}>{title}</div>{children}</div>;
}
function L({ label, children }) {
  return <label style={{ display: 'block' }}><span style={st.label}>{label}</span>{children}</label>;
}
function Swatches({ value, onChange, small }) {
  const size = small ? 20 : 26;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {COLORS.map((c) => (
        <button key={c} type="button" onClick={() => onChange(c)} style={{ width: size, height: size, borderRadius: size / 2, background: c, border: value?.toLowerCase() === c.toLowerCase() ? '3px solid var(--text-hi)' : '3px solid transparent', cursor: 'pointer', padding: 0, boxSizing: 'border-box' }} />
      ))}
    </div>
  );
}

const st = {
  h2: { fontSize: 20, fontWeight: 800, color: 'var(--text-hi)', margin: '0 0 4px', letterSpacing: -0.3 },
  sub: { fontSize: 13.5, color: 'var(--text-mid)', lineHeight: 1.5 },
  hint: { fontSize: 12.5, color: 'var(--text-low)', lineHeight: 1.5 },
  label: { display: 'block', fontSize: 12.5, fontWeight: 650, color: 'var(--text-mid)', marginBottom: 6 },
  error: { fontSize: 12.5, color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)', padding: '8px 11px', borderRadius: 10, marginBottom: 10 },
  tabs: { display: 'flex', gap: 4, padding: 4, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 13, width: 'fit-content', marginBottom: 16 },
  tab: { border: 'none', background: 'transparent', color: 'var(--text-mid)', fontWeight: 650, fontSize: 13, padding: '7px 16px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' },
  tabOn: { background: 'var(--bg-surface)', color: 'var(--text-hi)', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' },
  empty: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '34px 20px', border: '1px dashed var(--border)', borderRadius: 18 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  btnPrimary: { display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 650, fontSize: 13.5, padding: '10px 16px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 },
  btnGhost: { border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-hi)', fontWeight: 600, fontSize: 13.5, padding: '10px 16px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit' },
  btnSmall: { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-hi)', fontWeight: 600, fontSize: 12.5, padding: '7px 12px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' },
  iconBtnDanger: { width: 32, height: 32, borderRadius: 10, border: '1px solid color-mix(in srgb, var(--danger) 35%, transparent)', background: 'color-mix(in srgb, var(--danger) 8%, transparent)', color: 'var(--danger)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  addBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-mid)', fontWeight: 650, fontSize: 13, padding: '11px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit' },
  panelRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 16 },
  rowTitle: { fontSize: 14, fontWeight: 700, color: 'var(--text-hi)' },
  rowMeta: { display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', fontSize: 12, color: 'var(--text-low)', marginTop: 2 },
  optChip: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 650, padding: '4px 9px', borderRadius: 999 },
  overlay: { position: 'fixed', inset: 0, background: 'var(--scrim)', zIndex: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  confirm: { width: 420, maxWidth: '100%', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 20, padding: 20, boxShadow: 'var(--shadow-lg)' },
  backBtn: { width: 34, height: 34, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-hi)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  editorGrid: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 260px', gap: 16, alignItems: 'start' },
  group: { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  groupTitle: { fontSize: 11.5, fontWeight: 750, color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: 0.5 },
  input: { width: '100%', boxSizing: 'border-box', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 11, padding: '9px 11px', color: 'var(--text-hi)', fontSize: 13.5, fontFamily: 'inherit', outline: 'none' },
  roleChip: { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-mid)', fontSize: 12.5, fontWeight: 600, padding: '6px 11px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit' },
  roleChipOn: { border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--text-hi)' },
  segmented: { display: 'flex', gap: 3, padding: 3, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 11 },
  seg: { flex: 1, border: 'none', background: 'transparent', color: 'var(--text-mid)', fontWeight: 700, fontSize: 13, padding: '6px 0', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' },
  segOn: { background: 'var(--accent)', color: '#fff' },
  optEditor: { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 14, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 },
  optIcon: { width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  iconPick: { width: 28, height: 28, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  qBlock: { display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--bg-base)', borderRadius: 11, padding: 10 },
  miniToggle: { border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-low)', fontSize: 11.5, fontWeight: 650, padding: '6px 9px', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit' },
  miniToggleOn: { border: '1px solid var(--accent)', color: 'var(--accent)', background: 'var(--accent-soft)' },
  xBtn: { width: 24, height: 24, borderRadius: 12, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  linkBtn: { display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'none', color: 'var(--accent)', fontWeight: 650, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', padding: '2px 0', width: 'fit-content' },
  previewCol: { position: 'sticky', top: 0 },
  previewLabel: { fontSize: 11.5, fontWeight: 750, color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  preview: { background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16, padding: 12 },
  previewBtn: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 11, padding: '7px 9px' },
  saveRow: { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 },
  filter: { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-mid)', fontSize: 12.5, fontWeight: 600, padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit' },
  filterOn: { background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--text-hi)' },
  count: { fontSize: 11, fontWeight: 700, background: 'var(--bg-hover)', borderRadius: 999, padding: '1px 7px' },
  ticketRow: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit', width: '100%' },
  ticketNo: { fontSize: 12.5, fontWeight: 800, color: 'var(--accent)', fontFamily: 'ui-monospace, monospace', flexShrink: 0 },
  status: { fontSize: 11, fontWeight: 750, padding: '4px 9px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.3, flexShrink: 0 },
  statusOpen: { background: 'color-mix(in srgb, var(--success) 16%, transparent)', color: 'var(--success)' },
  statusClosed: { background: 'var(--bg-hover)', color: 'var(--text-low)' },
};
