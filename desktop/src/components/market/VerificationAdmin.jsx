import React, { useCallback, useEffect, useState } from 'react';
import { CloseIcon, AlertIcon, CheckIcon, ShieldCheckIcon, IdCardIcon, FaceScanIcon, BankIcon, UserIcon, StoreIcon, ClockIcon } from '../Icons';
import { formatDate, errorText, ui } from './marketUtils';
import { resolveAssetUrl } from '../../api';

// Fila de verificação de vendedores (só admins). As fotos vêm descriptografadas do servidor
// e ficam só em memória (blob), nunca em cache.

const FILTERS = [
  ['pending', 'Em análise'], ['rejected', 'Recusadas'], ['approved', 'Aprovadas'], ['draft', 'Incompletas'],
];
const SECTION_OPTS = [
  ['dados', 'Dados pessoais'], ['documento', 'Documento'], ['rosto', 'Prova de vida'], ['banco', 'Conta bancária'], ['loja', 'Loja'],
];
const PRESETS = [
  ['documento', 'A foto do documento está ilegível ou cortada. Envie de novo, com o documento inteiro e sem reflexo.'],
  ['rosto', 'Não conseguimos confirmar que o rosto da prova de vida é o mesmo do documento. Refaça num lugar bem iluminado.'],
  ['dados', 'Os dados informados não batem com o documento. Confira nome, CPF e data de nascimento.'],
  ['banco', 'A conta bancária precisa estar no seu nome (ou no CNPJ da empresa).'],
];
const ACTION_LABEL = { submitted: 'Enviou pra análise', approved: 'Aprovada', rejected: 'Recusada' };
const fmtDoc = (v) => {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return v;
};
const fmtPhone = (v) => String(v || '').replace(/^\+?55/, '').replace(/(\d{2})(\d{4,5})(\d{4})$/, '($1) $2-$3');
const fmtPix = (pix) => (pix.type === 'cpf' || pix.type === 'cnpj' ? fmtDoc(pix.key) : pix.type === 'phone' ? fmtPhone(pix.key) : pix.key);
const PIX_LABEL = { cpf: 'CPF', cnpj: 'CNPJ', email: 'Email', phone: 'Celular', random: 'Aleatória' };

export default function VerificationAdmin({ api, refreshKey, onCountChange }) {
  const [filter, setFilter] = useState('pending');
  const [list, setList] = useState(null);
  const [counts, setCounts] = useState({});
  const [error, setError] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = useCallback(() => {
    api.get(`/market/verification/admin/list?status=${filter}`)
      .then(({ data }) => { setList(data.verifications); setCounts(data.counts || {}); onCountChange?.(data.counts?.pending || 0); setError(''); })
      .catch((err) => setError(errorText(err, 'Não foi possível carregar')));
  }, [api, filter, onCountChange]);
  useEffect(() => { load(); }, [load, refreshKey]);

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={st.filters}>
        {FILTERS.map(([id, label]) => (
          <button key={id} type="button" onClick={() => setFilter(id)} style={{ ...st.filter, ...(filter === id ? st.filterActive : {}) }}>
            {label}{counts[id] ? <span style={{ ...st.count, ...(id === 'pending' ? st.countHot : {}) }}>{counts[id]}</span> : null}
          </button>
        ))}
      </div>
      {error && <div style={ui.error}>{error}</div>}
      {!list ? <div style={st.hint}>Carregando…</div> : list.length === 0 ? (
        <div style={st.empty}>
          <span style={st.emptyIcon}><ShieldCheckIcon size={24} /></span>
          <div style={{ fontWeight: 700, color: 'var(--text-hi)' }}>{filter === 'pending' ? 'Nenhuma verificação esperando' : 'Nada por aqui'}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-low)', marginTop: 4 }}>Quando alguém enviar os documentos, aparece aqui.</div>
        </div>
      ) : (
        <div style={st.list}>
          {list.map((v) => (
            <button key={v.user_id} type="button" style={st.row} onClick={() => setOpenId(v.user_id)} data-verification-row={v.user_id}>
              <Avatar user={v.user} />
              <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                <div style={st.rowName}>{v.full_name || v.user?.display_name || v.user?.username}{v.person_type === 'pj' && <span style={st.pjTag}>CNPJ</span>}</div>
                <div style={st.rowMeta}>
                  @{v.user?.username}#{v.user?.tag} · {v.store ? v.store.name : 'sem loja'}
                  {v.submitted_at ? ` · enviado ${formatDate(v.submitted_at)}` : ''}
                </div>
              </div>
              {v.flags.filter((f) => f.level !== 'info').length > 0 && (
                <span style={st.flagPill}><AlertIcon size={12} /> {v.flags.filter((f) => f.level !== 'info').length} alerta(s)</span>
              )}
              <span style={st.openBtn}>Revisar</span>
            </button>
          ))}
        </div>
      )}
      {openId && <VerificationDetail api={api} userId={openId} onClose={() => setOpenId(null)} onChanged={() => { load(); }} />}
    </div>
  );
}

function Avatar({ user, size = 40 }) {
  const url = resolveAssetUrl(user?.avatar_url);
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: user?.avatar_color || 'var(--accent)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, flexShrink: 0 }}>
      {(user?.display_name || user?.username || '?')[0].toUpperCase()}
    </span>
  );
}

// Carrega uma foto protegida e mostra via blob (sem cache, sem URL pública)
function SecureImage({ api, path, alt, style, onOpen }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let url = null;
    let alive = true;
    api.get(path, { responseType: 'blob' })
      .then((res) => { if (!alive) return; url = URL.createObjectURL(res.data); setSrc(url); })
      .catch(() => alive && setFailed(true));
    return () => { alive = false; if (url) URL.revokeObjectURL(url); };
  }, [api, path]);
  if (failed) return <div style={{ ...style, ...st.imgFail }}>Não carregou</div>;
  if (!src) return <div style={{ ...style, ...st.imgLoading }} />;
  return <img src={src} alt={alt} style={{ ...style, objectFit: 'cover', cursor: 'zoom-in' }} onClick={() => onOpen?.(src, alt)} />;
}

function VerificationDetail({ api, userId, onClose, onChanged }) {
  const [v, setV] = useState(null);
  const [error, setError] = useState('');
  const [zoom, setZoom] = useState(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [sections, setSections] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/market/verification/admin/${userId}`).then(({ data }) => setV(data.verification)).catch((err) => setError(errorText(err)));
  }, [api, userId]);

  async function act(kind) {
    setBusy(true); setError('');
    try {
      const { data } = await api.post(`/market/verification/admin/${userId}/${kind}`, kind === 'reject' ? { reason, sections } : {});
      setV(data.verification);
      setRejecting(false);
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function usePreset(section, text) {
    setReason((r) => (r ? `${r}\n${text}` : text));
    setSections((s) => (s.includes(section) ? s : [...s, section]));
  }

  const d = v?.data || {};
  const fileUrl = (key) => `/market/verification/admin/${userId}/file/${key}`;
  const docFiles = (v?.files || []).filter((f) => f.key.startsWith('doc_'));
  const liveFiles = (v?.files || []).filter((f) => f.key.startsWith('liveness-'));

  return (
    <div style={ui.overlay} onClick={onClose}>
      <div style={{ ...ui.modal, maxWidth: 1080, height: '90vh' }} onClick={(e) => e.stopPropagation()} data-verification-detail>
        <div style={st.dHead}>
          {v && <Avatar user={v.user} size={44} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={st.dTitle}>{d.personal?.full_name || 'Verificação'}</div>
            <div style={st.rowMeta}>
              {v ? `@${v.user?.username}#${v.user?.tag} · ${v.user?.email || ''} · ${v.person_type === 'pj' ? 'Empresa (CNPJ)' : 'Pessoa física'}` : 'Carregando…'}
            </div>
          </div>
          {v && <StatusTag status={v.status} />}
          <button type="button" style={ui.closeBtn} onClick={onClose}><CloseIcon size={15} /></button>
        </div>

        {!v ? <div style={st.hint}>{error || 'Carregando…'}</div> : (
          <div style={st.dBody}>
            <div style={st.dLeft}>
              {v.flags.length > 0 && (
                <div style={st.flags}>
                  {v.flags.map((f) => (
                    <div key={f.text} style={{ ...st.flag, ...(f.level === 'danger' ? st.flagDanger : f.level === 'warn' ? st.flagWarn : {}) }}>
                      <AlertIcon size={13} style={{ flexShrink: 0 }} /> {f.text}
                    </div>
                  ))}
                </div>
              )}
              <div style={st.blockTitle}><IdCardIcon size={14} /> Documento · {v.doc_label}</div>
              <div style={{ ...st.imgGrid, gridTemplateColumns: `repeat(${Math.max(docFiles.length, 1)}, 1fr)` }}>
                {docFiles.length === 0 && <div style={st.missing}>Sem foto do documento</div>}
                {docFiles.map((f) => (
                  <figure key={f.key} style={st.figure}>
                    <SecureImage api={api} path={fileUrl(f.key)} alt={f.label} style={st.docImg} onOpen={(src, alt) => setZoom({ src, alt })} />
                    <figcaption style={st.caption}>{f.label.replace('Documento — ', '')}</figcaption>
                  </figure>
                ))}
              </div>
              <div style={st.blockTitle}><FaceScanIcon size={14} /> Prova de vida {v.liveness_at ? `· ${formatDate(v.liveness_at)}` : ''}</div>
              <div style={st.liveHint}>Confira se é a mesma pessoa do documento e se cada foto mostra o gesto pedido.</div>
              <div style={st.liveGrid}>
                {liveFiles.length === 0 && <div style={st.missing}>Prova de vida não feita</div>}
                {liveFiles.map((f) => (
                  <figure key={f.key} style={st.figure}>
                    <SecureImage api={api} path={fileUrl(f.key)} alt={f.label} style={st.liveImg} onOpen={(src, alt) => setZoom({ src, alt })} />
                    <figcaption style={st.caption}>{f.label.replace('Prova de vida: ', '')}</figcaption>
                  </figure>
                ))}
              </div>
            </div>

            <div style={st.dRight}>
              <InfoBlock Icon={UserIcon} title="Pessoa" rows={d.personal && [
                ['Nome', d.personal.full_name], ['CPF', d.personal.cpf_formatted], ['Nascimento', d.personal.birth_date?.split('-').reverse().join('/')], ['Celular', fmtPhone(d.personal.phone)],
              ]} />
              {d.business && <InfoBlock Icon={StoreIcon} title="Empresa" rows={[['CNPJ', d.business.cnpj_formatted], ['Razão social', d.business.company_name], ['Fantasia', d.business.trade_name || '—']]} />}
              <InfoBlock title="Endereço" rows={d.address && [[null, `${d.address.street}, ${d.address.number}${d.address.complement ? ` — ${d.address.complement}` : ''}`], [null, `${d.address.district} · ${d.address.city}/${d.address.state} · CEP ${d.address.cep.replace(/(\d{5})(\d{3})/, '$1-$2')}`]]} />
              <InfoBlock Icon={BankIcon} title="Conta pra repasse" rows={d.bank && [
                ['Banco', `${d.bank.bank_code} · ${d.bank.bank_name}`], ['Agência', `${d.bank.agency}${d.bank.agency_digit ? `-${d.bank.agency_digit}` : ''}`],
                ['Conta', `${d.bank.account}-${d.bank.account_digit} (${d.bank.account_type})`], ['Titular', d.bank.holder_name], ['Doc. titular', fmtDoc(d.bank.holder_document)],
                ...(d.pix ? [['Pix', `${PIX_LABEL[d.pix.type]} · ${fmtPix(d.pix)}`]] : []),
              ]} />
              <InfoBlock Icon={StoreIcon} title="Loja" rows={v.store && [['Nome', v.store.name], ['Categoria', v.store.category || '—'], ['Contato', [v.store.contact_email, v.store.contact_phone].filter(Boolean).join(' · ') || '—']]} />
              {v.log.length > 0 && (
                <div style={st.info}>
                  <div style={st.infoTitle}><ClockIcon size={13} /> Histórico</div>
                  {v.log.map((l, i) => (
                    <div key={i} style={st.logRow}>
                      <span style={{ fontWeight: 650, color: 'var(--text-hi)' }}>{ACTION_LABEL[l.action] || l.action}</span>
                      <span style={{ color: 'var(--text-low)' }}>{formatDate(l.created_at)}</span>
                      {l.note && <div style={{ width: '100%', color: 'var(--text-mid)' }}>{l.note}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {v && v.status === 'pending' && (
          <div style={st.dFoot}>
            {rejecting ? (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-hi)' }}>O que o vendedor precisa corrigir?</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {SECTION_OPTS.map(([id, label]) => (
                    <button key={id} type="button" onClick={() => setSections((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} style={{ ...st.filter, ...(sections.includes(id) ? st.filterActive : {}) }}>
                      {sections.includes(id) && <CheckIcon size={12} />} {label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {PRESETS.map(([sec, text]) => (
                    <button key={text} type="button" style={st.preset} onClick={() => usePreset(sec, text)} title={text}>+ {text.split('.')[0]}</button>
                  ))}
                </div>
                <textarea style={{ ...ui.input, resize: 'none' }} rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explique o motivo — o vendedor vê essa mensagem" maxLength={500} />
                {error && <div style={ui.error}>{error}</div>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <button type="button" style={ui.btnGhost} onClick={() => setRejecting(false)}>Cancelar</button>
                  <button type="button" style={{ ...ui.btnPrimary, background: 'var(--danger)' }} disabled={busy || reason.trim().length < 5} onClick={() => act('reject')}>Recusar e avisar</button>
                </div>
              </div>
            ) : (
              <>
                {error && <div style={{ ...ui.error, flex: 1 }}>{error}</div>}
                <div style={{ flex: 1, fontSize: 12, color: 'var(--text-low)' }}>Aprovando, a loja entra na vitrine e os repasses ficam liberados pra essa conta.</div>
                <button type="button" style={{ ...ui.btnGhost, color: 'var(--danger)' }} onClick={() => setRejecting(true)}>Recusar</button>
                <button type="button" style={{ ...ui.btnPrimary, background: 'var(--success)' }} disabled={busy} onClick={() => act('approve')}><ShieldCheckIcon size={15} /> Aprovar vendedor</button>
              </>
            )}
          </div>
        )}
      </div>
      {zoom && (
        <div style={st.zoom} onClick={(e) => { e.stopPropagation(); setZoom(null); }}>
          <img src={zoom.src} alt={zoom.alt} style={{ maxWidth: '92vw', maxHeight: '86vh', borderRadius: 12 }} />
          <div style={{ color: '#fff', marginTop: 10, fontSize: 13 }}>{zoom.alt}</div>
        </div>
      )}
    </div>
  );
}

function StatusTag({ status }) {
  const m = {
    pending: ['Em análise', 'var(--warn)'], approved: ['Aprovada', 'var(--success)'], rejected: ['Recusada', 'var(--danger)'], draft: ['Incompleta', 'var(--text-low)'],
  }[status] || ['—', 'var(--text-low)'];
  return <span style={{ fontSize: 12, fontWeight: 700, color: m[1], background: `color-mix(in srgb, ${m[1]} 14%, transparent)`, borderRadius: 999, padding: '5px 11px' }}>{m[0]}</span>;
}

function InfoBlock({ Icon, title, rows }) {
  return (
    <div style={st.info}>
      <div style={st.infoTitle}>{Icon && <Icon size={13} />} {title}</div>
      {!rows ? <div style={{ fontSize: 12.5, color: 'var(--text-low)' }}>Não preenchido</div> : rows.map(([k, val], i) => (
        <div key={i} style={st.infoRow}>
          {k && <span style={st.infoKey}>{k}</span>}
          <span style={st.infoVal}>{val || '—'}</span>
        </div>
      ))}
    </div>
  );
}

const st = {
  hint: { color: 'var(--text-low)', fontSize: 13, padding: 24, textAlign: 'center' },
  filters: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 },
  filter: { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-mid)', fontSize: 12.5, fontWeight: 600, padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit' },
  filterActive: { background: 'var(--accent-soft)', border: '1px solid var(--accent)', color: 'var(--text-hi)' },
  count: { fontSize: 11, fontWeight: 700, background: 'var(--bg-hover)', borderRadius: 999, padding: '1px 7px' },
  countHot: { background: 'var(--warn)', color: '#1a1300' },
  empty: { ...ui.card, padding: '34px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' },
  emptyIcon: { width: 52, height: 52, borderRadius: 17, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  list: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: { ...ui.card, display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, cursor: 'pointer', fontFamily: 'inherit', width: '100%' },
  rowName: { fontSize: 14, fontWeight: 700, color: 'var(--text-hi)', display: 'flex', alignItems: 'center', gap: 6 },
  rowMeta: { fontSize: 12, color: 'var(--text-low)', marginTop: 2 },
  pjTag: { fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 6, padding: '1px 6px' },
  flagPill: { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 650, color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)', borderRadius: 999, padding: '4px 9px' },
  openBtn: { fontSize: 12.5, fontWeight: 650, color: 'var(--accent)' },
  dHead: { display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--border)' },
  dTitle: { fontSize: 17, fontWeight: 750, color: 'var(--text-hi)' },
  dBody: { flex: 1, overflowY: 'auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1.45fr) minmax(0, 1fr)', gap: 16, padding: 18 },
  dLeft: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  dRight: { display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 },
  dFoot: { display: 'flex', alignItems: 'center', gap: 8, padding: '14px 18px', borderTop: '1px solid var(--border)' },
  flags: { display: 'flex', flexDirection: 'column', gap: 6 },
  flag: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, fontWeight: 600, padding: '8px 11px', borderRadius: 12, background: 'var(--bg-elevated)', color: 'var(--text-mid)' },
  flagDanger: { background: 'color-mix(in srgb, var(--danger) 12%, transparent)', color: 'var(--danger)' },
  flagWarn: { background: 'color-mix(in srgb, var(--warn) 14%, transparent)', color: 'var(--warn)' },
  blockTitle: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 750, color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 6 },
  liveHint: { fontSize: 12, color: 'var(--text-low)', marginTop: -4 },
  imgGrid: { display: 'grid', gap: 8 },
  liveGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  figure: { margin: 0, display: 'flex', flexDirection: 'column', gap: 5 },
  docImg: { width: '100%', aspectRatio: '3 / 2', borderRadius: 12, display: 'block', background: 'var(--bg-elevated)' },
  liveImg: { width: '100%', aspectRatio: '3 / 4', borderRadius: 12, display: 'block', background: 'var(--bg-elevated)' },
  caption: { fontSize: 11.5, color: 'var(--text-mid)', textAlign: 'center' },
  imgLoading: { background: 'var(--bg-elevated)' },
  imgFail: { background: 'var(--bg-elevated)', color: 'var(--text-low)', fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  missing: { fontSize: 12.5, color: 'var(--text-low)', padding: 14, background: 'var(--bg-elevated)', borderRadius: 12 },
  info: { ...ui.card, padding: '11px 13px', borderRadius: 14, display: 'flex', flexDirection: 'column', gap: 4 },
  infoTitle: { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 750, color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  infoRow: { display: 'flex', gap: 10, fontSize: 12.5 },
  infoKey: { width: 90, color: 'var(--text-low)', flexShrink: 0 },
  infoVal: { color: 'var(--text-hi)', fontWeight: 550, wordBreak: 'break-word', minWidth: 0 },
  logRow: { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 4, fontSize: 12, padding: '5px 0', borderTop: '1px solid var(--border)' },
  preset: { border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-mid)', fontSize: 12, padding: '5px 10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit' },
  zoom: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out' },
};
