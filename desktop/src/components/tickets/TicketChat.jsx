import React, { useEffect, useMemo, useRef, useState } from 'react';
import { resolveAssetUrl } from '../../api';
import { TicketIcon, CloseIcon, CheckIcon, LockIcon, UserPlusIcon, DownloadIcon, TrashIcon, ReturnIcon, UserIcon, SearchIcon } from '../Icons';
import { OptionIcon, ticketNo, errText, personName, usePanels } from './ticketUtils';

// ─── Peças dos tickets dentro do chat ───────────────────────────────────────
// TicketPanelCard: o cartão com botões que a staff posta num canal.
// TicketEventRow: avisos do sistema dentro do ticket (aberto, assumido, fechado…).
// TicketBar: faixa no topo do canal do ticket com status e ações.
// TicketClosedComposer: substitui a caixa de mensagem quando o ticket está fechado.

export function TicketPanelCard({ tools, panelId }) {
  const data = usePanels(tools.api, tools.serverId, tools.panelsVersion);
  const panel = data?.panels?.find((p) => p.id === panelId);
  const [picked, setPicked] = useState(null);
  const [busy, setBusy] = useState(null);

  if (!data) return <div style={{ ...st.panel, height: 120, opacity: 0.5 }} />;
  if (!panel) return <div style={{ ...st.panel, ...st.panelGone }}><TicketIcon size={15} /> Esse painel de tickets foi removido.</div>;

  async function open(option, answers = []) {
    setBusy(option.id);
    try {
      const { data: d } = await tools.api.post(`/servers/${tools.serverId}/tickets/open`, { panelId: panel.id, optionId: option.id, answers });
      setPicked(null);
      tools.onOpenChannel(d.channel);
      return null;
    } catch (err) {
      const channelId = err?.response?.data?.channelId;
      if (channelId) {
        setPicked(null);
        tools.onNotice?.(errText(err));
        tools.onGoToChannelId?.(channelId);
        return null;
      }
      return errText(err, 'Não foi possível abrir o ticket');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div style={{ ...st.panel, borderLeft: `4px solid ${panel.color}` }} data-ticket-panel={panel.id}>
      <div style={st.panelHead}>
        <span style={{ ...st.panelIcon, color: panel.color, background: `color-mix(in srgb, ${panel.color} 15%, transparent)` }}><TicketIcon size={18} /></span>
        <div style={{ minWidth: 0 }}>
          <div style={st.panelTitle}>{panel.title}</div>
          {panel.description && <div style={st.panelDesc}>{panel.description}</div>}
        </div>
      </div>
      <div style={st.optionGrid}>
        {panel.options.map((o) => (
          <button
            key={o.id}
            type="button"
            disabled={Boolean(busy)}
            onClick={() => (o.questions.length ? setPicked(o) : open(o))}
            style={{ ...st.optionBtn, '--opt': o.color }}
            className="sc-ticket-option"
          >
            <span style={{ ...st.optionIcon, background: o.color }}><OptionIcon name={o.icon} size={15} style={{ color: '#fff' }} /></span>
            <span style={{ minWidth: 0, textAlign: 'left' }}>
              <span style={st.optionLabel}>{busy === o.id ? 'Abrindo…' : o.label}</span>
              {o.description && <span style={st.optionDesc}>{o.description}</span>}
            </span>
          </button>
        ))}
      </div>
      <div style={st.panelFoot}><LockIcon size={11} /> O ticket abre um canal privado só entre você e a equipe.</div>
      {picked && <OpenTicketModal option={picked} panel={panel} onCancel={() => setPicked(null)} onSubmit={(answers) => open(picked, answers)} />}
    </div>
  );
}

function OpenTicketModal({ option, panel, onCancel, onSubmit }) {
  const [answers, setAnswers] = useState(() => option.questions.map(() => ''));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const missing = option.questions.some((q, i) => q.required && !answers[i].trim());

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError('');
    const err = await onSubmit(answers);
    setBusy(false);
    if (err) setError(err);
  }

  return (
    <div style={st.overlay} onClick={onCancel}>
      <form style={st.modal} onClick={(e) => e.stopPropagation()} onSubmit={submit} data-open-ticket-modal>
        <div style={st.modalHead}>
          <span style={{ ...st.optionIcon, width: 36, height: 36, borderRadius: 12, background: option.color }}><OptionIcon name={option.icon} size={17} style={{ color: '#fff' }} /></span>
          <div style={{ flex: 1 }}>
            <div style={st.modalTitle}>{option.label}</div>
            <div style={st.modalSub}>{panel.title}</div>
          </div>
          <button type="button" style={st.closeBtn} onClick={onCancel}><CloseIcon size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {option.questions.map((q, i) => (
            <label key={i} style={{ display: 'block' }}>
              <span style={st.qLabel}>{q.label}{q.required ? <span style={{ color: 'var(--danger)' }}> *</span> : <span style={st.optional}> (opcional)</span>}</span>
              {q.long ? (
                <textarea
                  autoFocus={i === 0}
                  rows={4}
                  maxLength={1000}
                  style={{ ...st.input, resize: 'none', lineHeight: 1.5 }}
                  value={answers[i]}
                  onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                />
              ) : (
                <input
                  autoFocus={i === 0}
                  maxLength={200}
                  style={st.input}
                  value={answers[i]}
                  onChange={(e) => setAnswers((a) => a.map((v, j) => (j === i ? e.target.value : v)))}
                />
              )}
            </label>
          ))}
        </div>
        {error && <div style={st.error}>{error}</div>}
        <div style={st.modalFoot}>
          <button type="button" style={st.btnGhost} onClick={onCancel}>Cancelar</button>
          <button type="submit" style={{ ...st.btnPrimary, background: option.color, opacity: missing || busy ? 0.55 : 1 }} disabled={missing || busy}>
            <TicketIcon size={15} /> {busy ? 'Abrindo…' : 'Abrir ticket'}
          </button>
        </div>
      </form>
    </div>
  );
}

const EVENT_TEXT = {
  opened: 'abriu o ticket',
  claimed: 'assumiu o atendimento',
  unclaimed: 'liberou o atendimento',
  closed: 'fechou o ticket',
  reopened: 'reabriu o ticket',
  member_added: 'adicionou',
  member_removed: 'removeu',
};

export function TicketEventRow({ m }) {
  const meta = m.meta || {};
  const who = m.display_name || m.username || 'Alguém';
  const time = new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  if (meta.event === 'opened') {
    return (
      <div style={st.openedCard} data-ticket-event="opened">
        <div style={st.openedHead}>
          <span style={st.openedIcon}><TicketIcon size={18} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={st.openedTitle}>Ticket {ticketNo(meta.number)} · {meta.option}</div>
            <div style={st.eventMeta}><strong style={{ color: 'var(--text-hi)' }}>{who}</strong> abriu o ticket · {time}</div>
          </div>
        </div>
        {meta.welcome && <div style={st.welcome}>{meta.welcome}</div>}
        {meta.answers?.length > 0 && (
          <div style={st.answers}>
            {meta.answers.map((a, i) => (
              <div key={i} style={st.answer}>
                <div style={st.answerQ}>{a.question}</div>
                <div style={st.answerA}>{a.answer || <em style={{ color: 'var(--text-low)' }}>Sem resposta</em>}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const tone = meta.event === 'closed' ? 'var(--danger)' : meta.event === 'reopened' ? 'var(--success)' : 'var(--accent)';
  return (
    <div style={st.eventRow} data-ticket-event={meta.event}>
      <span style={{ ...st.eventDot, background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}>
        {meta.event === 'closed' ? <LockIcon size={12} /> : meta.event === 'reopened' ? <ReturnIcon size={12} /> : meta.event?.startsWith('member') ? <UserPlusIcon size={12} /> : <UserIcon size={12} />}
      </span>
      <span style={st.eventText}>
        <strong style={{ color: 'var(--text-hi)' }}>{who}</strong> {EVENT_TEXT[meta.event] || meta.event}
        {meta.user && <> <strong style={{ color: 'var(--text-hi)' }}>{personName(meta.user)}</strong>{meta.event === 'member_added' ? ' ao ticket' : ' do ticket'}</>}
        {meta.reason && <> — <em>{meta.reason}</em></>}
      </span>
      <span style={st.eventTime}>{time}</span>
    </div>
  );
}

export function TicketBar({ tools, channel }) {
  const t = channel.ticket;
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [closing, setClosing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const base = `/servers/${tools.serverId}/tickets/${t.id}`;

  useEffect(() => {
    let alive = true;
    tools.api.get(base).then(({ data }) => alive && setDetail(data)).catch(() => {});
    return () => { alive = false; };
  }, [tools.api, base, t.status, t.claimed_by?.id]); // recarrega quando o ticket muda

  async function act(kind, fn) {
    setBusy(kind); setError('');
    try {
      const res = await fn();
      if (res?.data?.ticket) setDetail((d) => ({ ...d, ticket: res.data.ticket }));
      return true;
    } catch (err) {
      setError(errText(err));
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function downloadTranscript() {
    setBusy('transcript');
    try {
      const res = await tools.api.get(`${base}/transcript`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a');
      a.href = url; a.download = `ticket-${String(t.number).padStart(4, '0')}.txt`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (err) {
      setError(errText(err, 'Não foi possível baixar'));
    } finally {
      setBusy(null);
    }
  }

  const isStaff = detail?.isStaff;
  const isOpener = tools.me?.id === t.opener?.id;
  const open = t.status === 'open';
  const claimedByMe = t.claimed_by?.id === tools.me?.id;
  const members = detail?.ticket?.members || [];

  return (
    <div style={{ ...st.bar, ...(open ? {} : st.barClosed) }} data-ticket-bar>
      <span style={{ ...st.statusChip, ...(open ? st.chipOpen : st.chipClosed) }}>{open ? 'Aberto' : 'Fechado'}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={st.barTitle}>Ticket {ticketNo(t.number)} · {t.option_label}</div>
        <div style={st.barMeta}>
          aberto por {personName(t.opener)}
          {t.claimed_by ? <> · atendido por <strong style={{ color: 'var(--text-hi)' }}>{personName(t.claimed_by)}</strong></> : open ? ' · esperando atendimento' : ''}
          {members.length > 0 && ` · +${members.length} pessoa${members.length > 1 ? 's' : ''}`}
        </div>
      </div>
      {error && <span style={st.barError}>{error}</span>}
      <div style={st.barActions}>
        {open && isStaff && (
          <button type="button" style={claimedByMe ? st.barBtn : st.barBtnPrimary} disabled={!!busy} onClick={() => act('claim', () => tools.api.post(`${base}/claim`))}>
            <CheckIcon size={13} /> {claimedByMe ? 'Liberar' : t.claimed_by ? 'Assumir no lugar' : 'Assumir'}
          </button>
        )}
        {isStaff && open && (
          <button type="button" style={st.barBtn} onClick={() => setAdding(true)} title="Adicionar alguém ao ticket"><UserPlusIcon size={14} /></button>
        )}
        {(isStaff || isOpener) && (
          <button type="button" style={st.barBtn} disabled={busy === 'transcript'} onClick={downloadTranscript} title="Baixar transcrição (.txt)"><DownloadIcon size={14} /></button>
        )}
        {open && (isStaff || isOpener) && (
          <button type="button" style={st.barBtnDanger} onClick={() => setClosing(true)}><LockIcon size={13} /> Fechar</button>
        )}
        {!open && isStaff && (
          <>
            <button type="button" style={st.barBtnPrimary} disabled={!!busy} onClick={() => act('reopen', () => tools.api.post(`${base}/reopen`))}><ReturnIcon size={13} /> Reabrir</button>
            <button type="button" style={st.barBtnDanger} onClick={() => setDeleting(true)} title="Excluir canal"><TrashIcon size={13} /> Excluir</button>
          </>
        )}
      </div>

      {closing && (
        <CloseTicketModal
          number={t.number}
          onCancel={() => setClosing(false)}
          onConfirm={async (reason) => { if (await act('close', () => tools.api.post(`${base}/close`, { reason }))) setClosing(false); }}
        />
      )}
      {adding && (
        <AddMemberModal
          tools={tools}
          ticket={detail?.ticket}
          onCancel={() => setAdding(false)}
          onAdd={(userId) => act('add', () => tools.api.post(`${base}/members`, { userId })).then((ok) => ok && setAdding(false))}
          onRemove={(userId) => act('remove', () => tools.api.delete(`${base}/members/${userId}`))}
        />
      )}
      {deleting && (
        <div style={st.overlay} onClick={() => setDeleting(false)}>
          <div style={{ ...st.modal, maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={st.modalTitle}>Excluir o canal do ticket {ticketNo(t.number)}?</div>
            <div style={{ fontSize: 13.5, color: 'var(--text-mid)', lineHeight: 1.5 }}>
              As mensagens somem pra sempre. O registro do ticket continua na lista de tickets. Baixe a transcrição antes, se quiser guardar.
            </div>
            <div style={st.modalFoot}>
              <button type="button" style={st.btnGhost} onClick={() => setDeleting(false)}>Cancelar</button>
              <button type="button" style={{ ...st.btnPrimary, background: 'var(--danger)' }} onClick={() => act('delete', () => tools.api.delete(base)).then(() => setDeleting(false))}>Excluir canal</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CloseTicketModal({ number, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div style={st.overlay} onClick={onCancel}>
      <form style={{ ...st.modal, maxWidth: 440 }} onClick={(e) => e.stopPropagation()} onSubmit={async (e) => { e.preventDefault(); setBusy(true); await onConfirm(reason.trim()); setBusy(false); }}>
        <div style={st.modalTitle}>Fechar o ticket {ticketNo(number)}?</div>
        <div style={{ fontSize: 13.5, color: 'var(--text-mid)', lineHeight: 1.5 }}>Ninguém mais consegue mandar mensagem. A staff pode reabrir depois.</div>
        <label>
          <span style={st.qLabel}>Motivo <span style={st.optional}>(opcional)</span></span>
          <input autoFocus style={st.input} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ex.: resolvido, pedido reenviado" />
        </label>
        <div style={st.modalFoot}>
          <button type="button" style={st.btnGhost} onClick={onCancel}>Cancelar</button>
          <button type="submit" style={{ ...st.btnPrimary, background: 'var(--danger)' }} disabled={busy}><LockIcon size={14} /> {busy ? 'Fechando…' : 'Fechar ticket'}</button>
        </div>
      </form>
    </div>
  );
}

function AddMemberModal({ tools, ticket, onCancel, onAdd, onRemove }) {
  const [q, setQ] = useState('');
  const inTicket = new Set([ticket?.opener?.id, ...(ticket?.members || []).map((m) => m.id)]);
  const list = useMemo(() => (tools.members || [])
    .filter((m) => !inTicket.has(m.id))
    .filter((m) => `${m.display_name || ''} ${m.username}`.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 30), [tools.members, q, ticket]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={st.overlay} onClick={onCancel}>
      <div style={{ ...st.modal, maxWidth: 440 }} onClick={(e) => e.stopPropagation()} data-add-member-modal>
        <div style={st.modalHead}>
          <div style={{ flex: 1 }}><div style={st.modalTitle}>Adicionar ao ticket</div><div style={st.modalSub}>A pessoa passa a ver e conversar nesse canal.</div></div>
          <button type="button" style={st.closeBtn} onClick={onCancel}><CloseIcon size={14} /></button>
        </div>
        {ticket?.members?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {ticket.members.map((m) => (
              <span key={m.id} style={st.memberChip}>{personName(m)} <button type="button" style={st.chipX} onClick={() => onRemove(m.id)} title="Remover"><CloseIcon size={10} /></button></span>
            ))}
          </div>
        )}
        <label style={st.searchBox}><SearchIcon size={14} style={{ color: 'var(--text-low)' }} /><input autoFocus style={st.searchInput} placeholder="Buscar membro" value={q} onChange={(e) => setQ(e.target.value)} /></label>
        <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {list.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-low)', padding: 10 }}>Ninguém encontrado.</div>}
          {list.map((m) => {
            const avatar = resolveAssetUrl(m.avatar_url);
            return (
              <button key={m.id} type="button" style={st.pickRow} className="sc-member-row" onClick={() => onAdd(m.id)}>
                {avatar ? <img src={avatar} alt="" style={st.pickAvatar} /> : <span style={{ ...st.pickAvatar, background: m.avatar_color || 'var(--accent)' }}>{personName(m)[0]?.toUpperCase()}</span>}
                <span style={{ flex: 1, textAlign: 'left', fontSize: 13.5, fontWeight: 600, color: 'var(--text-hi)' }}>{personName(m)} <span style={{ fontWeight: 400, color: 'var(--text-low)', fontSize: 12 }}>@{m.username}</span></span>
                <UserPlusIcon size={14} style={{ color: 'var(--accent)' }} />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function TicketClosedComposer({ ticket }) {
  return (
    <div style={st.closedComposer} data-ticket-closed>
      <LockIcon size={15} />
      <span>
        Esse ticket foi fechado{ticket.close_reason ? ` — ${ticket.close_reason.replace(/[.!?…]+$/, '')}` : ''}. Só a staff pode reabrir.
      </span>
    </div>
  );
}

const st = {
  panel: { margin: '10px 0 6px', maxWidth: 560, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 },
  panelGone: { flexDirection: 'row', alignItems: 'center', gap: 8, color: 'var(--text-low)', fontSize: 13 },
  panelHead: { display: 'flex', gap: 12, alignItems: 'flex-start' },
  panelIcon: { width: 40, height: 40, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  panelTitle: { fontSize: 16, fontWeight: 750, color: 'var(--text-hi)', letterSpacing: -0.2 },
  panelDesc: { fontSize: 13, color: 'var(--text-mid)', marginTop: 3, lineHeight: 1.5, whiteSpace: 'pre-wrap' },
  optionGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 },
  optionBtn: {
    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 14, cursor: 'pointer', fontFamily: 'inherit',
    background: 'var(--bg-surface)', border: '1px solid var(--border)',
  },
  optionIcon: { width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  optionLabel: { display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--text-hi)' },
  optionDesc: { display: 'block', fontSize: 11.5, color: 'var(--text-low)', marginTop: 1 },
  panelFoot: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--text-low)' },
  overlay: { position: 'fixed', inset: 0, background: 'var(--scrim)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modal: { width: '100%', maxWidth: 480, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 22, boxShadow: 'var(--shadow-lg)', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 },
  modalHead: { display: 'flex', alignItems: 'center', gap: 12 },
  modalTitle: { fontSize: 17, fontWeight: 750, color: 'var(--text-hi)' },
  modalSub: { fontSize: 12.5, color: 'var(--text-low)', marginTop: 1 },
  modalFoot: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  closeBtn: { width: 30, height: 30, borderRadius: 15, border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  qLabel: { display: 'block', fontSize: 13, fontWeight: 650, color: 'var(--text-hi)', marginBottom: 6 },
  optional: { fontWeight: 400, color: 'var(--text-low)', fontSize: 12 },
  input: { width: '100%', boxSizing: 'border-box', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 12px', color: 'var(--text-hi)', fontSize: 14, fontFamily: 'inherit', outline: 'none' },
  error: { fontSize: 12.5, color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)', padding: '8px 11px', borderRadius: 10 },
  btnPrimary: { display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 650, fontSize: 13.5, padding: '10px 16px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit' },
  btnGhost: { border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-hi)', fontWeight: 600, fontSize: 13.5, padding: '10px 16px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit' },
  openedCard: { margin: '12px 0 8px', maxWidth: 620, border: '1px solid var(--border)', borderRadius: 18, background: 'var(--bg-elevated)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 },
  openedHead: { display: 'flex', alignItems: 'center', gap: 12 },
  openedIcon: { width: 38, height: 38, borderRadius: 12, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  openedTitle: { fontSize: 15, fontWeight: 750, color: 'var(--text-hi)' },
  welcome: { fontSize: 13.5, color: 'var(--text-hi)', lineHeight: 1.5, background: 'var(--bg-surface)', borderRadius: 12, padding: '9px 12px', borderLeft: '3px solid var(--accent)' },
  answers: { display: 'flex', flexDirection: 'column', gap: 8 },
  answer: { background: 'var(--bg-surface)', borderRadius: 12, padding: '9px 12px' },
  answerQ: { fontSize: 11.5, fontWeight: 700, color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: 0.4 },
  answerA: { fontSize: 13.5, color: 'var(--text-hi)', marginTop: 3, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  eventMeta: { fontSize: 12, color: 'var(--text-low)', marginTop: 1 },
  eventRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 4px', margin: '4px 0' },
  eventDot: { width: 24, height: 24, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 8 },
  eventText: { flex: 1, fontSize: 13, color: 'var(--text-mid)' },
  eventTime: { fontSize: 11, color: 'var(--text-low)' },
  bar: { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderBottom: '1px solid var(--border)', background: 'color-mix(in srgb, var(--accent) 6%, var(--bg-surface))', flexWrap: 'wrap' },
  barClosed: { background: 'color-mix(in srgb, var(--danger) 5%, var(--bg-surface))' },
  statusChip: { fontSize: 11, fontWeight: 750, padding: '4px 9px', borderRadius: 999, textTransform: 'uppercase', letterSpacing: 0.4, flexShrink: 0 },
  chipOpen: { background: 'color-mix(in srgb, var(--success) 16%, transparent)', color: 'var(--success)' },
  chipClosed: { background: 'color-mix(in srgb, var(--danger) 14%, transparent)', color: 'var(--danger)' },
  barTitle: { fontSize: 13.5, fontWeight: 700, color: 'var(--text-hi)' },
  barMeta: { fontSize: 12, color: 'var(--text-low)', marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  barError: { fontSize: 12, color: 'var(--danger)' },
  barActions: { display: 'flex', gap: 6, alignItems: 'center' },
  barBtn: { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-hi)', fontSize: 12.5, fontWeight: 650, padding: '7px 11px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' },
  barBtnPrimary: { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--accent)', background: 'var(--accent)', color: '#fff', fontSize: 12.5, fontWeight: 650, padding: '7px 11px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' },
  barBtnDanger: { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)', color: 'var(--danger)', fontSize: 12.5, fontWeight: 650, padding: '7px 11px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' },
  memberChip: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600, color: 'var(--text-hi)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 6px 4px 10px' },
  chipX: { width: 18, height: 18, borderRadius: 9, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  searchBox: { display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 12, padding: '0 12px' },
  searchInput: { flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-hi)', fontSize: 14, padding: '10px 0', fontFamily: 'inherit' },
  pickRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 12, border: 'none', background: 'transparent', cursor: 'pointer', fontFamily: 'inherit' },
  pickAvatar: { width: 32, height: 32, borderRadius: 16, objectFit: 'cover', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 },
  closedComposer: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, margin: '0 16px 16px', padding: '14px 16px', borderRadius: 16, background: 'var(--bg-elevated)', border: '1px dashed var(--border)', color: 'var(--text-mid)', fontSize: 13.5 },
};
