import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  StoreIcon, UserIcon, IdCardIcon, FaceScanIcon, BankIcon, CheckIcon, LockIcon, ArrowLeftIcon, ArrowRightIcon,
  CameraIcon, AlertIcon, ShieldCheckIcon, ClockIcon, ImageIcon, CloseIcon, WalletIcon,
} from '../Icons';
import { errorText, ui } from './marketUtils';

// ─── Abrir loja: passo a passo com verificação do vendedor ──────────────────
// Loja → Seus dados → Documento → Rosto (prova de vida) → Conta bancária → Revisão.
// Tudo que é sensível vai criptografado pro servidor e só a equipe do SafeCord vê.

const STEPS = [
  { id: 'loja', label: 'Loja', hint: 'Nome, categoria e contato', Icon: StoreIcon },
  { id: 'dados', label: 'Seus dados', hint: 'CPF ou CNPJ e endereço', Icon: UserIcon },
  { id: 'documento', label: 'Documento', hint: 'Foto do RG, CNH…', Icon: IdCardIcon },
  { id: 'rosto', label: 'Rosto', hint: 'Prova de vida pela câmera', Icon: FaceScanIcon },
  { id: 'banco', label: 'Conta bancária', hint: 'Onde você recebe', Icon: BankIcon },
  { id: 'revisao', label: 'Revisão', hint: 'Conferir e enviar', Icon: ShieldCheckIcon },
];

// ─── máscaras ───────────────────────────────────────────────────────────────
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const maskCPF = (v) => digits(v).slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
const maskCNPJ = (v) => digits(v).slice(0, 14).replace(/(\d{2})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1/$2').replace(/(\d{4})(\d{1,2})$/, '$1-$2');
const maskPhone = (v) => {
  const d = digits(v).slice(0, 11);
  if (d.length <= 10) return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  return d.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
};
const maskCEP = (v) => digits(v).slice(0, 8).replace(/(\d{5})(\d{1,3})$/, '$1-$2');
const maskDoc = (v) => (digits(v).length > 11 ? maskCNPJ(v) : maskCPF(v));

export default function SellerOnboarding({ api, user, store, verification, onChanged, onExit, startAt }) {
  const [options, setOptions] = useState(null);
  const [v, setV] = useState(verification);
  const [step, setStep] = useState(() => startAt || firstOpenStep(verification, store));
  useEffect(() => { setV(verification); }, [verification]);
  useEffect(() => {
    api.get('/market/verification/options').then(({ data }) => setOptions(data)).catch(() => setOptions({ banks: [], ufs: [], docTypes: [], categories: [] }));
  }, [api]);

  const sections = v?.sections || {};
  const flagged = new Set(v?.reject_sections || []);
  const doneCount = ['loja', 'dados', 'documento', 'rosto', 'banco'].filter((s) => sections[s]).length;

  const update = useCallback((next) => { if (next) setV(next); onChanged?.(); }, [onChanged]);
  const go = (id) => setStep(id);
  const nextOf = (id) => STEPS[STEPS.findIndex((s) => s.id === id) + 1]?.id;

  if (v && !v.editable) return <StatusScreen v={v} store={store} onExit={onExit} />;

  const canOpen = (id) => id === 'loja' || Boolean(store);

  return (
    <div style={st.wrap}>
      <aside style={st.side}>
        <div style={st.sideHead}>
          <div style={st.sideTitle}>{store ? 'Verificar minha loja' : 'Abrir minha loja'}</div>
          <div style={st.sideSub}>{doneCount} de 5 etapas</div>
          <div style={st.progress}><div style={{ ...st.progressFill, width: `${(doneCount / 5) * 100}%` }} /></div>
        </div>
        <div style={st.stepList}>
          {STEPS.map((s, i) => {
            const done = s.id !== 'revisao' && sections[s.id];
            const active = step === s.id;
            const bad = flagged.has(s.id) && !done;
            const locked = !canOpen(s.id);
            return (
              <button
                key={s.id}
                type="button"
                disabled={locked}
                onClick={() => go(s.id)}
                style={{ ...st.stepBtn, ...(active ? st.stepBtnActive : {}), opacity: locked ? 0.45 : 1, cursor: locked ? 'not-allowed' : 'pointer' }}
              >
                <span style={{ ...st.stepIcon, ...(done ? st.stepIconDone : {}), ...(bad ? st.stepIconBad : {}), ...(active && !done && !bad ? st.stepIconActive : {}) }}>
                  {done ? <CheckIcon size={14} /> : bad ? <AlertIcon size={14} /> : <s.Icon size={15} />}
                </span>
                <span style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                  <span style={st.stepLabel}>{i + 1}. {s.label}</span>
                  <span style={st.stepHint}>{bad ? 'Precisa corrigir' : s.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
        <div style={st.secureNote}>
          <LockIcon size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Seus documentos e dados bancários ficam criptografados. Só a equipe de verificação do SafeCord vê — compradores nunca.</span>
        </div>
        {store && onExit && (
          <button type="button" style={{ ...ui.btnGhost, width: '100%' }} onClick={onExit}>Voltar pra minha loja</button>
        )}
      </aside>

      <section style={st.main}>
        {v?.status === 'rejected' && v.reject_reason && (
          <div style={st.rejectBox}>
            <AlertIcon size={18} style={{ flexShrink: 0, color: 'var(--danger)' }} />
            <div>
              <div style={{ fontWeight: 700, color: 'var(--text-hi)', fontSize: 13.5 }}>Sua verificação precisa de ajustes</div>
              <div style={{ fontSize: 13, color: 'var(--text-mid)', marginTop: 3, lineHeight: 1.5 }}>{v.reject_reason}</div>
            </div>
          </div>
        )}
        {!options ? <div style={st.hint}>Carregando…</div> : (
          <>
            {step === 'loja' && <StoreStep api={api} user={user} store={store} options={options} onDone={() => { onChanged?.(); go('dados'); }} />}
            {step === 'dados' && <PersonalStep api={api} v={v} options={options} onSaved={(next) => { update(next); go(nextOf('dados')); }} />}
            {step === 'documento' && <DocumentStep api={api} v={v} options={options} onUpdate={update} onNext={() => go('rosto')} />}
            {step === 'rosto' && <LivenessStep api={api} v={v} onUpdate={update} onNext={() => go('banco')} />}
            {step === 'banco' && <BankStep api={api} v={v} options={options} onSaved={(next) => { update(next); go('revisao'); }} />}
            {step === 'revisao' && <ReviewStep api={api} v={v} store={store} options={options} onEdit={go} onSubmitted={update} />}
          </>
        )}
      </section>
    </div>
  );
}

function firstOpenStep(v, store) {
  if (!store) return 'loja';
  const flagged = (v?.reject_sections || []).find((s) => !v.sections?.[s]);
  if (flagged) return flagged;
  return ['dados', 'documento', 'rosto', 'banco'].find((s) => !v?.sections?.[s]) || 'revisao';
}

// ─── peças de formulário ────────────────────────────────────────────────────
function StepHeader({ title, text }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={st.title}>{title}</div>
      {text && <div style={st.text}>{text}</div>}
    </div>
  );
}

function Field({ label, hint, error, children, span = 1 }) {
  return (
    <div style={{ gridColumn: `span ${span}`, minWidth: 0 }}>
      {label && <label style={ui.label}>{label}</label>}
      {children}
      {error ? <div style={st.fieldError}>{error}</div> : hint ? <div style={st.fieldHint}>{hint}</div> : null}
    </div>
  );
}

const inputStyle = (bad) => ({ ...ui.input, ...(bad ? { borderColor: 'var(--danger)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--danger) 15%, transparent)' } : {}) });

function Segmented({ value, onChange, options }) {
  return (
    <div style={st.segmented}>
      {options.map((o) => (
        <button key={o.value} type="button" onClick={() => onChange(o.value)} style={{ ...st.segBtn, ...(value === o.value ? st.segBtnActive : {}) }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Footer({ onBack, children }) {
  return (
    <div style={st.footer}>
      {onBack ? <button type="button" style={ui.btnGhost} onClick={onBack}><ArrowLeftIcon size={14} /> Voltar</button> : <span />}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{children}</div>
    </div>
  );
}

function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [field, setField] = useState(null);
  const run = async (fn) => {
    setBusy(true); setError(''); setField(null);
    try { return await fn(); } catch (err) {
      setError(errorText(err, 'Não foi possível salvar'));
      setField(err?.response?.data?.field || null);
      return null;
    } finally { setBusy(false); }
  };
  return { busy, error, field, run, setError };
}

// ─── 1. Loja ────────────────────────────────────────────────────────────────
function StoreStep({ api, user, store, options, onDone }) {
  const [f, setF] = useState({
    name: store?.name || '', description: store?.description || '', category: store?.category || '',
    contact_email: store?.contact_email || user?.email || '', contact_phone: maskPhone(store?.contact_phone || ''),
  });
  const { busy, error, run } = useSubmit();
  const set = (k) => (e) => setF((p) => ({ ...p, [k]: e.target.value }));

  async function save() {
    const body = { ...f, contact_phone: digits(f.contact_phone) };
    const ok = await run(() => (store ? api.put('/market/my-store', body) : api.post('/market/my-store', body)));
    if (ok) onDone();
  }

  return (
    <>
      <StepHeader title="Sobre sua loja" text="É o que os compradores vão ver. Dá pra trocar logo e banner depois, nas configurações." />
      {!user?.email_verified && <div style={{ ...st.warnBox, marginBottom: 14 }}>Confirme seu email antes de abrir uma loja.</div>}
      <div style={st.grid}>
        <Field label="Nome da loja" span={2}>
          <input style={ui.input} value={f.name} maxLength={50} onChange={set('name')} placeholder="Ex.: Ateliê da Bia" />
        </Field>
        <Field label="Categoria" span={2}>
          <div style={st.chips}>
            {options.categories.map((c) => (
              <button key={c} type="button" onClick={() => setF((p) => ({ ...p, category: c }))} style={{ ...st.chip, ...(f.category === c ? st.chipActive : {}) }}>{c}</button>
            ))}
          </div>
        </Field>
        <Field label="Sobre a loja" hint={`${f.description.trim().length}/500 · pelo menos 20 letras`} span={2}>
          <textarea style={{ ...ui.input, resize: 'none', lineHeight: 1.5 }} rows={3} maxLength={500} value={f.description} onChange={set('description')} placeholder="O que você vende, prazo de produção, de onde envia…" />
        </Field>
        <Field label="Email de contato" hint="Aparece pro comprador em caso de dúvida no pedido">
          <input style={ui.input} type="email" value={f.contact_email} onChange={set('contact_email')} />
        </Field>
        <Field label="WhatsApp / telefone (opcional)">
          <input style={ui.input} value={f.contact_phone} onChange={(e) => setF((p) => ({ ...p, contact_phone: maskPhone(e.target.value) }))} placeholder="(11) 98888-7777" />
        </Field>
      </div>
      {error && <div style={{ ...ui.error, marginTop: 14 }}>{error}</div>}
      <Footer>
        <button type="button" style={ui.btnPrimary} disabled={busy || !f.name.trim() || !f.category} onClick={save}>
          {busy ? 'Salvando…' : store ? 'Salvar e continuar' : 'Criar loja e continuar'} <ArrowRightIcon size={14} />
        </button>
      </Footer>
    </>
  );
}

// ─── 2. Seus dados ──────────────────────────────────────────────────────────
function PersonalStep({ api, v, options, onSaved }) {
  const d = v?.data || {};
  const [type, setType] = useState(v?.person_type || 'pf');
  const [p, setP] = useState({
    full_name: d.personal?.full_name || '', cpf: maskCPF(d.personal?.cpf || ''),
    birth_date: d.personal?.birth_date || '', phone: maskPhone(d.personal?.phone || ''),
  });
  const [b, setB] = useState({ cnpj: maskCNPJ(d.business?.cnpj || ''), company_name: d.business?.company_name || '', trade_name: d.business?.trade_name || '' });
  const [a, setA] = useState({
    cep: maskCEP(d.address?.cep || ''), street: d.address?.street || '', number: d.address?.number || '', complement: d.address?.complement || '',
    district: d.address?.district || '', city: d.address?.city || '', state: d.address?.state || '',
  });
  const [cepState, setCepState] = useState('');
  const { busy, error, field, run } = useSubmit();

  async function lookupCep(value) {
    const cep = digits(value);
    if (cep.length !== 8) return;
    setCepState('buscando');
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const j = await r.json();
      if (j.erro) { setCepState('nao-achado'); return; }
      setA((prev) => ({ ...prev, street: j.logradouro || prev.street, district: j.bairro || prev.district, city: j.localidade || prev.city, state: j.uf || prev.state }));
      setCepState('ok');
    } catch {
      setCepState(''); // sem internet / bloqueado: preenche na mão
    }
  }

  async function save() {
    const res = await run(() => api.put('/market/verification/personal', {
      person_type: type,
      personal: { ...p, cpf: digits(p.cpf), phone: digits(p.phone) },
      business: type === 'pj' ? { ...b, cnpj: digits(b.cnpj) } : null,
      address: { ...a, cep: digits(a.cep) },
    }));
    if (res) onSaved(res.data.verification);
  }

  const bad = (k) => field === k;
  return (
    <>
      <StepHeader title="Seus dados" text="Precisamos saber quem está vendendo — é o que protege os compradores e a sua loja. Use os dados exatamente como estão no documento." />
      <div style={st.typeCards}>
        {[['pf', 'Pessoa física', 'Vendo no meu CPF'], ['pj', 'Empresa / MEI', 'Tenho CNPJ']].map(([id, t, h]) => (
          <button key={id} type="button" onClick={() => setType(id)} style={{ ...st.typeCard, ...(type === id ? st.typeCardActive : {}) }}>
            <span style={{ ...st.radio, ...(type === id ? st.radioOn : {}) }} />
            <span style={{ textAlign: 'left' }}><span style={st.typeTitle}>{t}</span><span style={st.typeHint}>{h}</span></span>
          </button>
        ))}
      </div>

      <div style={st.groupTitle}>{type === 'pj' ? 'Responsável pela empresa' : 'Você'}</div>
      <div style={st.grid}>
        <Field label="Nome completo" span={2} error={bad('full_name') && error}>
          <input style={inputStyle(bad('full_name'))} value={p.full_name} maxLength={120} onChange={(e) => setP({ ...p, full_name: e.target.value })} placeholder="Igual ao documento" />
        </Field>
        <Field label="CPF" error={bad('cpf') && error}>
          <input style={inputStyle(bad('cpf'))} inputMode="numeric" value={p.cpf} onChange={(e) => setP({ ...p, cpf: maskCPF(e.target.value) })} placeholder="000.000.000-00" />
        </Field>
        <Field label="Data de nascimento" error={bad('birth_date') && error}>
          <input style={inputStyle(bad('birth_date'))} type="date" value={p.birth_date} onChange={(e) => setP({ ...p, birth_date: e.target.value })} />
        </Field>
        <Field label="Celular" error={bad('phone') && error} span={2}>
          <input style={inputStyle(bad('phone'))} inputMode="numeric" value={p.phone} onChange={(e) => setP({ ...p, phone: maskPhone(e.target.value) })} placeholder="(11) 98888-7777" />
        </Field>
      </div>

      {type === 'pj' && (
        <>
          <div style={st.groupTitle}>Empresa</div>
          <div style={st.grid}>
            <Field label="CNPJ" error={bad('cnpj') && error}>
              <input style={inputStyle(bad('cnpj'))} inputMode="numeric" value={b.cnpj} onChange={(e) => setB({ ...b, cnpj: maskCNPJ(e.target.value) })} placeholder="00.000.000/0000-00" />
            </Field>
            <Field label="Nome fantasia (opcional)">
              <input style={ui.input} value={b.trade_name} maxLength={80} onChange={(e) => setB({ ...b, trade_name: e.target.value })} />
            </Field>
            <Field label="Razão social" span={2} error={bad('company_name') && error}>
              <input style={inputStyle(bad('company_name'))} value={b.company_name} maxLength={140} onChange={(e) => setB({ ...b, company_name: e.target.value })} />
            </Field>
          </div>
        </>
      )}

      <div style={st.groupTitle}>Endereço</div>
      <div style={{ ...st.grid, gridTemplateColumns: '1fr 1.5fr 1.4fr' }}>
        <Field label="CEP" error={bad('cep') && error} hint={cepState === 'buscando' ? 'Buscando…' : cepState === 'nao-achado' ? 'CEP não encontrado — preencha na mão' : cepState === 'ok' ? 'Endereço preenchido' : ''}>
          <input style={inputStyle(bad('cep'))} inputMode="numeric" value={a.cep} onChange={(e) => { const m = maskCEP(e.target.value); setA({ ...a, cep: m }); lookupCep(m); }} placeholder="00000-000" />
        </Field>
        <Field label="Rua" error={bad('street') && error}>
          <input style={inputStyle(bad('street'))} value={a.street} maxLength={120} onChange={(e) => setA({ ...a, street: e.target.value })} />
        </Field>
        <Field label="Número">
          <input style={ui.input} value={a.number} maxLength={12} onChange={(e) => setA({ ...a, number: e.target.value })} />
        </Field>
        <Field label="Complemento">
          <input style={ui.input} value={a.complement} maxLength={60} onChange={(e) => setA({ ...a, complement: e.target.value })} placeholder="Apto, bloco…" />
        </Field>
        <Field label="Bairro">
          <input style={ui.input} value={a.district} maxLength={60} onChange={(e) => setA({ ...a, district: e.target.value })} />
        </Field>
        <Field label="Cidade / UF" error={(bad('city') || bad('state')) && error}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={{ ...inputStyle(bad('city')), flex: 1, minWidth: 0 }} value={a.city} maxLength={60} onChange={(e) => setA({ ...a, city: e.target.value })} />
            <select style={{ ...inputStyle(bad('state')), width: 74, padding: '11px 6px' }} value={a.state} onChange={(e) => setA({ ...a, state: e.target.value })}>
              <option value="">UF</option>
              {options.ufs.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </Field>
      </div>

      {error && !field && <div style={{ ...ui.error, marginTop: 14 }}>{error}</div>}
      <Footer>
        <button type="button" style={ui.btnPrimary} disabled={busy} onClick={save}>{busy ? 'Salvando…' : 'Salvar e continuar'} <ArrowRightIcon size={14} /></button>
      </Footer>
    </>
  );
}

// ─── 3. Documento ───────────────────────────────────────────────────────────
function DocumentStep({ api, v, options, onUpdate, onNext }) {
  const [type, setType] = useState(v?.doc_type || '');
  const [previews, setPreviews] = useState({});
  const [uploading, setUploading] = useState(null);
  const { error, run, setError } = useSubmit();
  const docMeta = options.docTypes.find((d) => d.id === type);
  useEffect(() => () => Object.values(previews).forEach((u) => URL.revokeObjectURL(u)), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function pickType(id) {
    setType(id);
    const res = await run(() => api.put('/market/verification/document', { doc_type: id }));
    if (res) onUpdate(res.data.verification);
  }

  async function upload(side, file) {
    if (!file) return;
    if (file.size > 6 * 1024 * 1024) { setError('Foto muito grande (máximo 6MB)'); return; }
    setUploading(side);
    const fd = new FormData();
    fd.append('image', file);
    const res = await run(() => api.post(`/market/verification/document/${side}`, fd));
    setUploading(null);
    if (res) {
      setPreviews((p) => ({ ...p, [side]: URL.createObjectURL(file) }));
      onUpdate(res.data.verification);
    }
  }

  const sides = docMeta ? (docMeta.needsBack ? ['front', 'back'] : ['front']) : [];
  const sent = { front: v?.files?.doc_front, back: v?.files?.doc_back };

  return (
    <>
      <StepHeader title="Foto do documento" text="Um documento oficial com foto, válido. Vamos comparar com o seu rosto na próxima etapa." />
      <div style={st.docTypes}>
        {options.docTypes.map((d) => (
          <button key={d.id} type="button" onClick={() => pickType(d.id)} style={{ ...st.docType, ...(type === d.id ? st.typeCardActive : {}) }}>
            <IdCardIcon size={20} style={{ color: type === d.id ? 'var(--accent)' : 'var(--text-low)' }} />
            <span style={st.docTypeLabel}>{d.label}</span>
          </button>
        ))}
      </div>

      {docMeta && (
        <div style={{ ...st.uploadGrid, gridTemplateColumns: sides.length === 2 ? '1fr 1fr' : '1fr' }}>
          {sides.map((side) => (
            <label key={side} style={{ ...st.uploadBox, ...(sent[side] ? st.uploadBoxDone : {}) }}>
              {previews[side] ? <img src={previews[side]} alt="" style={st.uploadPreview} /> : (
                <span style={st.uploadIcon}>{sent[side] ? <CheckIcon size={22} /> : <CameraIcon size={22} />}</span>
              )}
              <span style={st.uploadTitle}>{side === 'front' ? 'Frente' : 'Verso'}{side === 'front' && docMeta.id === 'cnh' ? ' (com a foto)' : ''}</span>
              <span style={st.uploadHint}>
                {uploading === side ? 'Enviando…' : sent[side] ? 'Enviada — clique pra trocar' : 'Tirar foto ou escolher arquivo'}
              </span>
              <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => { upload(side, e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          ))}
        </div>
      )}

      <div style={st.tips}>
        {['Documento inteiro na foto, sem cortar as bordas', 'Tire do plástico e evite reflexo de luz', 'Nada de foto de tela ou cópia — só o documento original'].map((t) => (
          <div key={t} style={st.tip}><CheckIcon size={13} style={{ color: 'var(--success)', flexShrink: 0 }} /> {t}</div>
        ))}
      </div>

      {error && <div style={{ ...ui.error, marginTop: 14 }}>{error}</div>}
      <Footer>
        <button type="button" style={ui.btnPrimary} disabled={!v?.sections?.documento} onClick={onNext}>Continuar <ArrowRightIcon size={14} /></button>
      </Footer>
    </>
  );
}

// ─── 4. Rosto (prova de vida) ───────────────────────────────────────────────
function LivenessStep({ api, v, onUpdate, onNext }) {
  const [phase, setPhase] = useState(v?.sections?.rosto ? 'done' : 'intro'); // intro | camera | done
  const [error, setError] = useState('');
  const done = v?.sections?.rosto;

  return (
    <>
      <StepHeader title="Prova de vida" text="Vamos pedir alguns movimentos rápidos na câmera, sorteados na hora. Assim temos certeza de que é você mesmo, e não uma foto." />
      {phase === 'intro' && (
        <div style={st.liveIntro}>
          <span style={st.liveIllus}><FaceScanIcon size={44} /></span>
          <div style={st.tips}>
            {['Fique num lugar bem iluminado', 'Tire boné, óculos escuros e máscara', 'Deixe seu documento por perto — ele aparece no último passo', 'Leva menos de 1 minuto'].map((t) => (
              <div key={t} style={st.tip}><CheckIcon size={13} style={{ color: 'var(--success)', flexShrink: 0 }} /> {t}</div>
            ))}
          </div>
          {error && <div style={{ ...ui.error, width: '100%', boxSizing: 'border-box' }}>{error}</div>}
          <button type="button" style={{ ...ui.btnPrimary, padding: '12px 22px' }} onClick={() => { setError(''); setPhase('camera'); }}>
            <CameraIcon size={16} /> Abrir a câmera
          </button>
        </div>
      )}
      {phase === 'camera' && (
        <LivenessCamera
          api={api}
          onCancel={(msg) => { setError(msg || ''); setPhase(done ? 'done' : 'intro'); }}
          onDone={(next) => { onUpdate(next); setPhase('done'); }}
        />
      )}
      {phase === 'done' && (
        <div style={st.liveDone}>
          <span style={st.doneBadge}><CheckIcon size={30} /></span>
          <div style={st.title}>Prova de vida concluída</div>
          <div style={st.text}>As fotos foram enviadas criptografadas. Se a equipe precisar, ela pede pra você refazer.</div>
          <button type="button" style={ui.btnGhost} onClick={() => setPhase('intro')}>Refazer</button>
        </div>
      )}
      <Footer>
        <button type="button" style={ui.btnPrimary} disabled={!done} onClick={onNext}>Continuar <ArrowRightIcon size={14} /></button>
      </Footer>
    </>
  );
}

function LivenessCamera({ api, onCancel, onDone }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const aliveRef = useRef(true);
  const [challenge, setChallenge] = useState(null);
  const [index, setIndex] = useState(0);
  const [count, setCount] = useState(null);
  const [status, setStatus] = useState('Abrindo a câmera…');
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    aliveRef.current = true;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        if (!aliveRef.current) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play().catch(() => {}); }
        const { data } = await api.post('/market/verification/liveness/start');
        if (!aliveRef.current) return;
        setChallenge(data);
        setStatus('');
      } catch (err) {
        const msg = err?.name === 'NotAllowedError' ? 'Você não liberou a câmera. Permita o acesso e tente de novo.'
          : err?.name === 'NotFoundError' ? 'Nenhuma câmera encontrada neste dispositivo.'
            : errorText(err, 'Não foi possível abrir a câmera');
        onCancel(msg);
      }
    })();
    return () => {
      aliveRef.current = false;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [api]); // eslint-disable-line react-hooks/exhaustive-deps

  // Contagem 3-2-1 em cada gesto, depois tira a foto e manda
  useEffect(() => {
    if (!challenge || index >= challenge.steps.length) return undefined;
    let n = 3;
    setCount(n);
    const t = setInterval(async () => {
      n -= 1;
      if (n > 0) { setCount(n); return; }
      clearInterval(t);
      setCount(null);
      await captureAndSend();
    }, 1000);
    return () => clearInterval(t);
  }, [challenge, index]); // eslint-disable-line react-hooks/exhaustive-deps

  async function captureAndSend() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) { onCancel('A câmera não está mandando imagem. Tente de novo.'); return; }
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    setFlash(true); setTimeout(() => setFlash(false), 160);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9));
    setStatus('Enviando…');
    const fd = new FormData();
    fd.append('index', String(index));
    fd.append('image', blob, `frame-${index}.jpg`);
    try {
      const { data } = await api.post(`/market/verification/liveness/${challenge.challengeId}/frame`, fd);
      if (!aliveRef.current) return;
      setStatus('');
      if (data.done) {
        streamRef.current?.getTracks().forEach((tr) => tr.stop());
        onDone(data.verification);
      } else {
        setIndex((i) => i + 1);
      }
    } catch (err) {
      onCancel(errorText(err, 'Falhou ao enviar a foto — tente de novo'));
    }
  }

  const current = challenge?.steps[index];
  return (
    <div style={st.camWrap}>
      <div style={st.camStage}>
        <video ref={videoRef} playsInline muted style={st.video} />
        <div style={st.ovalMask}><div style={st.oval} /></div>
        {flash && <div style={st.flash} />}
        {count !== null && <div style={st.countdown}>{count}</div>}
        <div style={st.camInstruction}>
          {current ? current.label : status}
          {status && current && <span style={{ display: 'block', fontSize: 12, opacity: 0.8, fontWeight: 500 }}>{status}</span>}
        </div>
      </div>
      <div style={st.camSteps}>
        {(challenge?.steps || []).map((s, i) => (
          <span key={s.id} style={{ ...st.camDot, ...(i < index ? st.camDotDone : i === index ? st.camDotNow : {}) }} title={s.label}>
            {i < index ? <CheckIcon size={11} /> : i + 1}
          </span>
        ))}
        <button type="button" style={{ ...ui.btnGhost, marginLeft: 'auto' }} onClick={() => onCancel('')}><CloseIcon size={13} /> Cancelar</button>
      </div>
    </div>
  );
}

// ─── 5. Conta bancária ──────────────────────────────────────────────────────
function BankStep({ api, v, options, onSaved }) {
  const d = v?.data || {};
  const own = d.business?.cnpj && v?.person_type === 'pj' ? d.business.cnpj : d.personal?.cpf || '';
  const ownName = v?.person_type === 'pj' ? (d.business?.company_name || '') : (d.personal?.full_name || '');
  const known = options.banks.some((bk) => bk.code === d.bank?.bank_code);
  const [bank, setBank] = useState({
    bank_code: d.bank?.bank_code ? (known ? d.bank.bank_code : 'outro') : '',
    other_code: known ? '' : (d.bank?.bank_code || ''),
    other_name: known ? '' : (d.bank?.bank_name || ''),
    agency: d.bank?.agency || '', agency_digit: d.bank?.agency_digit || '',
    account: d.bank?.account || '', account_digit: d.bank?.account_digit || '',
    account_type: d.bank?.account_type || 'corrente',
    holder_name: d.bank?.holder_name || ownName,
    holder_document: maskDoc(d.bank?.holder_document || own),
  });
  const [pix, setPix] = useState({ type: d.pix?.type || 'cpf', key: d.pix?.key || (d.pix ? '' : maskCPF(d.personal?.cpf || '')) });
  const { busy, error, field, run } = useSubmit();
  const set = (k) => (e) => setBank((p) => ({ ...p, [k]: e.target.value }));
  const bad = (k) => field === k;

  function pickPixType(type) {
    const auto = type === 'cpf' ? maskCPF(d.personal?.cpf || '') : type === 'cnpj' ? maskCNPJ(d.business?.cnpj || '') : '';
    setPix({ type, key: auto });
  }

  async function save() {
    const other = bank.bank_code === 'outro';
    const res = await run(() => api.put('/market/verification/bank', {
      bank: {
        bank_code: other ? bank.other_code : bank.bank_code,
        bank_name: other ? bank.other_name : undefined,
        agency: bank.agency, agency_digit: bank.agency_digit, account: bank.account, account_digit: bank.account_digit,
        account_type: bank.account_type, holder_name: bank.holder_name, holder_document: digits(bank.holder_document),
      },
      pix: { type: pix.type, key: pix.type === 'phone' || pix.type === 'cpf' || pix.type === 'cnpj' ? digits(pix.key) : pix.key },
    }));
    if (res) onSaved(res.data.verification);
  }

  const pixTypes = [
    { value: 'cpf', label: 'CPF' }, ...(v?.person_type === 'pj' ? [{ value: 'cnpj', label: 'CNPJ' }] : []),
    { value: 'email', label: 'Email' }, { value: 'phone', label: 'Celular' }, { value: 'random', label: 'Aleatória' },
  ];

  return (
    <>
      <StepHeader title="Onde você recebe" text="A conta precisa estar no seu nome (ou no CNPJ da sua empresa). É pra ela que o SafeCord manda o dinheiro das suas vendas." />
      <div style={st.grid}>
        <Field label="Banco" span={2} error={bad('bank_code') && error}>
          <select style={inputStyle(bad('bank_code'))} value={bank.bank_code} onChange={set('bank_code')}>
            <option value="">Escolha o banco…</option>
            {options.banks.map((bk) => <option key={bk.code} value={bk.code}>{bk.code} · {bk.name}</option>)}
            <option value="outro">Outro banco…</option>
          </select>
        </Field>
        {bank.bank_code === 'outro' && (
          <>
            <Field label="Código do banco" error={bad('bank_name') && error}><input style={ui.input} inputMode="numeric" maxLength={3} value={bank.other_code} onChange={(e) => setBank({ ...bank, other_code: digits(e.target.value) })} placeholder="000" /></Field>
            <Field label="Nome do banco"><input style={ui.input} maxLength={60} value={bank.other_name} onChange={set('other_name')} /></Field>
          </>
        )}
        <Field label="Tipo de conta" span={2}>
          <Segmented value={bank.account_type} onChange={(val) => setBank({ ...bank, account_type: val })} options={[{ value: 'corrente', label: 'Corrente' }, { value: 'poupanca', label: 'Poupança' }, { value: 'pagamento', label: 'Pagamento (digital)' }]} />
        </Field>
        <Field label="Agência" error={(bad('agency') || bad('agency_digit')) && error}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={{ ...inputStyle(bad('agency')), flex: 1 }} inputMode="numeric" maxLength={5} value={bank.agency} onChange={(e) => setBank({ ...bank, agency: digits(e.target.value) })} placeholder="0001" />
            <input style={{ ...inputStyle(bad('agency_digit')), width: 58, textAlign: 'center' }} maxLength={1} value={bank.agency_digit} onChange={set('agency_digit')} placeholder="díg." title="Dígito (se tiver)" />
          </div>
        </Field>
        <Field label="Conta" error={(bad('account') || bad('account_digit')) && error}>
          <div style={{ display: 'flex', gap: 6 }}>
            <input style={{ ...inputStyle(bad('account')), flex: 1 }} inputMode="numeric" maxLength={13} value={bank.account} onChange={(e) => setBank({ ...bank, account: digits(e.target.value) })} placeholder="12345678" />
            <input style={{ ...inputStyle(bad('account_digit')), width: 58, textAlign: 'center' }} maxLength={2} value={bank.account_digit} onChange={set('account_digit')} placeholder="díg." />
          </div>
        </Field>
        <Field label="Nome do titular" error={bad('holder_name') && error}>
          <input style={inputStyle(bad('holder_name'))} value={bank.holder_name} maxLength={140} onChange={set('holder_name')} />
        </Field>
        <Field label={v?.person_type === 'pj' ? 'CPF ou CNPJ do titular' : 'CPF do titular'} error={bad('holder_document') && error}>
          <input style={inputStyle(bad('holder_document'))} inputMode="numeric" value={bank.holder_document} onChange={(e) => setBank({ ...bank, holder_document: maskDoc(e.target.value) })} />
        </Field>
      </div>

      <div style={st.groupTitle}>Chave Pix</div>
      <div style={st.grid}>
        <Field span={2}><Segmented value={pix.type} onChange={pickPixType} options={pixTypes} /></Field>
        <Field span={2} error={(bad('pix_key') || bad('pix_type')) && error} hint="Os repasses são feitos por Pix nessa chave.">
          <input
            style={inputStyle(bad('pix_key'))}
            value={pix.key}
            onChange={(e) => {
              const val = e.target.value;
              setPix({ ...pix, key: pix.type === 'cpf' ? maskCPF(val) : pix.type === 'cnpj' ? maskCNPJ(val) : pix.type === 'phone' ? maskPhone(val) : val });
            }}
            placeholder={{ cpf: '000.000.000-00', cnpj: '00.000.000/0000-00', email: 'voce@email.com', phone: '(11) 98888-7777', random: '123e4567-e89b-12d3-a456-426614174000' }[pix.type]}
          />
        </Field>
      </div>

      <div style={st.futureCard}>
        <span style={st.futureIcon}><WalletIcon size={18} /></span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-hi)' }}>Receber direto no Mercado Pago <span style={st.soon}>em breve</span></div>
          <div style={{ fontSize: 12.5, color: 'var(--text-low)', marginTop: 2, lineHeight: 1.45 }}>
            Logo você vai poder conectar sua conta do Mercado Pago e receber cada venda na hora, sem esperar o repasse.
          </div>
        </div>
      </div>

      {error && !field && <div style={{ ...ui.error, marginTop: 14 }}>{error}</div>}
      <Footer>
        <button type="button" style={ui.btnPrimary} disabled={busy || !bank.bank_code} onClick={save}>{busy ? 'Salvando…' : 'Salvar e revisar'} <ArrowRightIcon size={14} /></button>
      </Footer>
    </>
  );
}

// ─── 6. Revisão ─────────────────────────────────────────────────────────────
function ReviewStep({ api, v, store, options, onEdit, onSubmitted }) {
  const [accept, setAccept] = useState(false);
  const { busy, error, run } = useSubmit();
  const d = v?.data || {};
  const s = v?.sections || {};
  const doc = options.docTypes.find((x) => x.id === v?.doc_type);
  const bankName = d.bank ? (d.bank.bank_name || options.banks.find((b) => b.code === d.bank.bank_code)?.name) : '';
  const allDone = ['loja', 'dados', 'documento', 'rosto', 'banco'].every((k) => s[k]);

  const rows = [
    ['loja', 'Loja', store ? `${store.name} · ${store.category || 'sem categoria'}` : null],
    ['dados', 'Seus dados', d.personal ? `${d.personal.full_name} · CPF ${maskCPF(d.personal.cpf)}${v.person_type === 'pj' && d.business ? ` · CNPJ ${maskCNPJ(d.business.cnpj)}` : ''}` : null],
    ['dados', 'Endereço', d.address ? `${d.address.street}, ${d.address.number} — ${d.address.city}/${d.address.state}` : null],
    ['documento', 'Documento', s.documento ? `${doc?.label || ''} · ${v.files.doc_back ? 'frente e verso' : 'frente'}` : null],
    ['rosto', 'Prova de vida', s.rosto ? `${v.files.liveness_frames} fotos enviadas` : null],
    ['banco', 'Conta', d.bank ? `${bankName} · ag ${d.bank.agency} · conta ${d.bank.account}-${d.bank.account_digit}` : null],
    ['banco', 'Pix', d.pix ? `${d.pix.type.toUpperCase()} · ${d.pix.key}` : null],
  ];

  async function submit() {
    const res = await run(() => api.post('/market/verification/submit', { accept_terms: true }));
    if (res) onSubmitted(res.data.verification);
  }

  return (
    <>
      <StepHeader title="Confira e envie" text="Depois de enviar, a equipe do SafeCord analisa em até 2 dias úteis. Enquanto isso você já pode cadastrar produtos — eles aparecem quando a loja for aprovada." />
      <div style={st.reviewList}>
        {rows.map(([id, label, value], i) => (
          <div key={`${id}-${i}`} style={st.reviewRow}>
            <span style={{ ...st.reviewCheck, ...(value ? {} : st.reviewMissing) }}>{value ? <CheckIcon size={12} /> : <AlertIcon size={12} />}</span>
            <span style={st.reviewLabel}>{label}</span>
            <span style={st.reviewValue}>{value || 'Falta preencher'}</span>
            <button type="button" style={st.linkBtn} onClick={() => onEdit(id)}>Editar</button>
          </div>
        ))}
      </div>

      <label style={st.terms}>
        <input type="checkbox" checked={accept} onChange={(e) => setAccept(e.target.checked)} style={{ marginTop: 2, accentColor: 'var(--accent)' }} />
        <span>
          Confirmo que as informações são verdadeiras e que a conta bancária é minha (ou da minha empresa). Autorizo o SafeCord a usar
          meus dados, a foto do documento e as fotos do meu rosto <strong>só para verificar minha identidade e prevenir fraudes</strong>,
          conforme a LGPD. Concordo em vender apenas produtos permitidos por lei e entendo que a loja pode ser suspensa se algo for falso.
        </span>
      </label>

      {error && <div style={{ ...ui.error, marginTop: 14 }}>{error}</div>}
      <Footer>
        <button type="button" style={{ ...ui.btnPrimary, padding: '12px 22px' }} disabled={busy || !accept || !allDone} onClick={submit}>
          <ShieldCheckIcon size={16} /> {busy ? 'Enviando…' : 'Enviar para análise'}
        </button>
      </Footer>
    </>
  );
}

// ─── Tela depois de enviar ──────────────────────────────────────────────────
function StatusScreen({ v, onExit }) {
  const approved = v.status === 'approved';
  return (
    <div style={st.statusWrap}>
      <span style={{ ...st.statusIcon, ...(approved ? { background: 'color-mix(in srgb, var(--success) 16%, transparent)', color: 'var(--success)' } : {}) }}>
        {approved ? <ShieldCheckIcon size={36} /> : <ClockIcon size={36} />}
      </span>
      <div style={{ ...st.title, fontSize: 22 }}>{approved ? 'Loja verificada!' : 'Recebemos seus dados'}</div>
      <div style={{ ...st.text, maxWidth: 440, textAlign: 'center' }}>
        {approved
          ? 'Sua loja já aparece no Mercado com o selo de vendedor verificado.'
          : 'A equipe do SafeCord está conferindo seus documentos. Leva até 2 dias úteis — você recebe um aviso aqui assim que terminar.'}
      </div>
      {!approved && (
        <div style={st.timeline}>
          {[['Dados enviados', true], ['Análise da equipe', false], ['Loja no ar', false]].map(([t, on], i) => (
            <div key={t} style={st.timelineItem}>
              <span style={{ ...st.timelineDot, ...(on ? st.timelineDotOn : i === 1 ? st.timelineDotNow : {}) }}>{on ? <CheckIcon size={11} /> : i + 1}</span>
              <span style={{ fontSize: 12.5, color: on || i === 1 ? 'var(--text-hi)' : 'var(--text-low)', fontWeight: 600 }}>{t}</span>
            </div>
          ))}
        </div>
      )}
      {onExit && <button type="button" style={ui.btnPrimary} onClick={onExit}>{approved ? 'Ir pra minha loja' : 'Cadastrar produtos enquanto isso'}</button>}
    </div>
  );
}

/** Faixa no topo do painel do vendedor mostrando em que pé está a verificação. */
export function VerificationBanner({ v, onOpen }) {
  const doneCount = useMemo(() => ['loja', 'dados', 'documento', 'rosto', 'banco'].filter((s) => v?.sections?.[s]).length, [v]);
  if (!v || v.status === 'approved') return null;
  const meta = {
    draft: { color: 'var(--accent)', Icon: ShieldCheckIcon, title: 'Sua loja ainda está escondida', text: `Termine a verificação pra ela aparecer no Mercado (${doneCount} de 5 etapas).`, cta: 'Continuar verificação' },
    pending: { color: 'var(--warn)', Icon: ClockIcon, title: 'Verificação em análise', text: 'Já recebemos seus dados. Sua loja entra no ar assim que a equipe aprovar (até 2 dias úteis).', cta: null },
    rejected: { color: 'var(--danger)', Icon: AlertIcon, title: 'Sua verificação precisa de ajustes', text: v.reject_reason || 'Veja o que corrigir.', cta: 'Corrigir agora' },
  }[v.status] || null;
  if (!meta) return null;
  return (
    <div style={{ ...st.banner, borderColor: `color-mix(in srgb, ${meta.color} 45%, var(--border))`, background: `color-mix(in srgb, ${meta.color} 9%, var(--bg-base))` }} data-verification-banner>
      <span style={{ ...st.bannerIcon, color: meta.color, background: `color-mix(in srgb, ${meta.color} 16%, transparent)` }}><meta.Icon size={18} /></span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-hi)' }}>{meta.title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-mid)', marginTop: 2, lineHeight: 1.45 }}>{meta.text}</div>
      </div>
      {meta.cta && <button type="button" style={ui.btnPrimary} onClick={onOpen}>{meta.cta} <ArrowRightIcon size={14} /></button>}
    </div>
  );
}

const st = {
  wrap: { display: 'grid', gridTemplateColumns: '270px 1fr', gap: 16, maxWidth: 1060, alignItems: 'start' },
  side: { ...ui.card, padding: 14, borderRadius: 22, display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 0 },
  sideHead: { padding: '4px 4px 2px' },
  sideTitle: { fontSize: 16, fontWeight: 800, color: 'var(--text-hi)', letterSpacing: -0.2 },
  sideSub: { fontSize: 12, color: 'var(--text-low)', marginTop: 2 },
  progress: { height: 6, borderRadius: 3, background: 'var(--bg-elevated)', marginTop: 10, overflow: 'hidden' },
  progressFill: { height: '100%', background: 'var(--accent)', borderRadius: 3, transition: 'width .3s ease' },
  stepList: { display: 'flex', flexDirection: 'column', gap: 2 },
  stepBtn: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 8px', borderRadius: 14, border: 'none', background: 'transparent', fontFamily: 'inherit' },
  stepBtnActive: { background: 'var(--bg-elevated)' },
  stepIcon: { width: 32, height: 32, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-elevated)', color: 'var(--text-mid)', flexShrink: 0, border: '1px solid var(--border)' },
  stepIconActive: { background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid color-mix(in srgb, var(--accent) 40%, transparent)' },
  stepIconDone: { background: 'var(--success)', color: '#fff', border: '1px solid var(--success)' },
  stepIconBad: { background: 'color-mix(in srgb, var(--danger) 14%, transparent)', color: 'var(--danger)', border: '1px solid color-mix(in srgb, var(--danger) 40%, transparent)' },
  stepLabel: { display: 'block', fontSize: 13.5, fontWeight: 650, color: 'var(--text-hi)' },
  stepHint: { display: 'block', fontSize: 11.5, color: 'var(--text-low)', marginTop: 1 },
  secureNote: { display: 'flex', gap: 8, fontSize: 11.5, lineHeight: 1.45, color: 'var(--text-low)', background: 'var(--bg-elevated)', borderRadius: 14, padding: '10px 11px' },
  main: { ...ui.card, padding: '24px 26px 20px', borderRadius: 22, minWidth: 0 },
  hint: { color: 'var(--text-low)', fontSize: 13, padding: 24, textAlign: 'center' },
  title: { fontSize: 19, fontWeight: 800, color: 'var(--text-hi)', letterSpacing: -0.3 },
  text: { fontSize: 13.5, color: 'var(--text-mid)', marginTop: 5, lineHeight: 1.55 },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  groupTitle: { fontSize: 12, fontWeight: 750, color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '20px 2px 10px' },
  fieldHint: { fontSize: 11.5, color: 'var(--text-low)', marginTop: 5, marginLeft: 2 },
  fieldError: { fontSize: 11.5, color: 'var(--danger)', marginTop: 5, marginLeft: 2, fontWeight: 600 },
  footer: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 22, paddingTop: 16, borderTop: '1px solid var(--border)' },
  chips: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  chip: { border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-mid)', fontSize: 12.5, fontWeight: 600, padding: '7px 12px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit' },
  chipActive: { border: '1px solid var(--accent)', background: 'var(--accent-soft)', color: 'var(--text-hi)' },
  typeCards: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  typeCard: { display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px', borderRadius: 16, border: '2px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', fontFamily: 'inherit' },
  typeCardActive: { border: '2px solid var(--accent)', background: 'var(--accent-softer, var(--accent-soft))' },
  radio: { width: 18, height: 18, borderRadius: 9, border: '2px solid var(--border)', boxSizing: 'border-box', flexShrink: 0 },
  radioOn: { border: '5px solid var(--accent)' },
  typeTitle: { display: 'block', fontSize: 14, fontWeight: 700, color: 'var(--text-hi)' },
  typeHint: { display: 'block', fontSize: 12, color: 'var(--text-low)', marginTop: 1 },
  segmented: { display: 'flex', gap: 4, padding: 4, background: 'var(--bg-elevated)', borderRadius: 13, border: '1px solid var(--border)', flexWrap: 'wrap' },
  segBtn: { flex: 1, border: 'none', background: 'transparent', color: 'var(--text-mid)', fontSize: 12.5, fontWeight: 650, padding: '8px 10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  segBtnActive: { background: 'var(--bg-surface)', color: 'var(--text-hi)', boxShadow: '0 1px 3px rgba(0,0,0,0.15)' },
  warnBox: { fontSize: 12.5, color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 12%, transparent)', borderRadius: 12, padding: '9px 12px' },
  rejectBox: { display: 'flex', gap: 10, padding: '12px 14px', borderRadius: 16, background: 'color-mix(in srgb, var(--danger) 9%, transparent)', border: '1px solid color-mix(in srgb, var(--danger) 30%, transparent)', marginBottom: 18 },
  docTypes: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 },
  docType: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '14px 8px', borderRadius: 16, border: '2px solid var(--border)', background: 'var(--bg-surface)', cursor: 'pointer', fontFamily: 'inherit' },
  docTypeLabel: { fontSize: 12, fontWeight: 650, color: 'var(--text-hi)', textAlign: 'center', lineHeight: 1.3 },
  uploadGrid: { display: 'grid', gap: 10, marginTop: 14 },
  uploadBox: {
    position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, minHeight: 170,
    border: '2px dashed var(--border)', borderRadius: 18, cursor: 'pointer', padding: 14, overflow: 'hidden', background: 'var(--bg-surface)',
  },
  uploadBoxDone: { border: '2px solid color-mix(in srgb, var(--success) 60%, transparent)' },
  uploadPreview: { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.35 },
  uploadIcon: { width: 46, height: 46, borderRadius: 15, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  uploadTitle: { position: 'relative', fontSize: 14, fontWeight: 700, color: 'var(--text-hi)' },
  uploadHint: { position: 'relative', fontSize: 12, color: 'var(--text-low)' },
  tips: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 14 },
  tip: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-mid)' },
  liveIntro: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '10px 0' },
  liveIllus: { width: 96, height: 96, borderRadius: 32, background: 'var(--accent-soft)', color: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  liveDone: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '18px 0', textAlign: 'center' },
  doneBadge: { width: 70, height: 70, borderRadius: 35, background: 'var(--success)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  camWrap: { display: 'flex', flexDirection: 'column', gap: 10 },
  camStage: { position: 'relative', borderRadius: 20, overflow: 'hidden', background: '#000', aspectRatio: '4 / 3', maxHeight: 420 },
  video: { width: '100%', height: '100%', objectFit: 'cover', transform: 'scaleX(-1)', display: 'block' },
  ovalMask: { position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  oval: { width: '42%', height: '76%', borderRadius: '50%', border: '3px solid rgba(255,255,255,0.9)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.45)' },
  flash: { position: 'absolute', inset: 0, background: '#fff', opacity: 0.7 },
  countdown: { position: 'absolute', top: 14, right: 16, width: 46, height: 46, borderRadius: 23, background: 'var(--accent)', color: '#fff', fontSize: 22, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  camInstruction: { position: 'absolute', left: 16, right: 16, bottom: 16, textAlign: 'center', color: '#fff', fontSize: 17, fontWeight: 750, textShadow: '0 1px 6px rgba(0,0,0,0.6)' },
  camSteps: { display: 'flex', alignItems: 'center', gap: 6 },
  camDot: { width: 26, height: 26, borderRadius: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 700, background: 'var(--bg-elevated)', color: 'var(--text-low)', border: '1px solid var(--border)' },
  camDotNow: { background: 'var(--accent-soft)', color: 'var(--accent)', border: '1px solid var(--accent)' },
  camDotDone: { background: 'var(--success)', color: '#fff', border: '1px solid var(--success)' },
  futureCard: { display: 'flex', gap: 12, alignItems: 'center', marginTop: 18, padding: '12px 14px', borderRadius: 16, border: '1px dashed var(--border)', background: 'var(--bg-surface)' },
  futureIcon: { width: 38, height: 38, borderRadius: 12, background: 'color-mix(in srgb, #00B1EA 15%, transparent)', color: '#00B1EA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  soon: { fontSize: 10.5, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-soft)', borderRadius: 999, padding: '2px 7px', marginLeft: 6, verticalAlign: 'middle' },
  reviewList: { display: 'flex', flexDirection: 'column', border: '1px solid var(--border)', borderRadius: 16, overflow: 'hidden' },
  reviewRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', borderBottom: '1px solid var(--border)', background: 'var(--bg-surface)' },
  reviewCheck: { width: 22, height: 22, borderRadius: 11, background: 'var(--success)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  reviewMissing: { background: 'color-mix(in srgb, var(--warn) 18%, transparent)', color: 'var(--warn)' },
  reviewLabel: { width: 110, fontSize: 12.5, fontWeight: 650, color: 'var(--text-low)', flexShrink: 0 },
  reviewValue: { flex: 1, minWidth: 0, fontSize: 13, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  linkBtn: { border: 'none', background: 'none', color: 'var(--accent)', fontWeight: 650, fontSize: 12.5, cursor: 'pointer', fontFamily: 'inherit', padding: 0 },
  terms: { display: 'flex', gap: 10, marginTop: 16, fontSize: 12.5, color: 'var(--text-mid)', lineHeight: 1.55, cursor: 'pointer', padding: '12px 14px', background: 'var(--bg-surface)', borderRadius: 16, border: '1px solid var(--border)' },
  statusWrap: { ...ui.card, borderRadius: 22, padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, maxWidth: 720 },
  statusIcon: { width: 82, height: 82, borderRadius: 28, background: 'color-mix(in srgb, var(--warn) 16%, transparent)', color: 'var(--warn)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 6 },
  timeline: { display: 'flex', gap: 22, margin: '14px 0 8px', flexWrap: 'wrap', justifyContent: 'center' },
  timelineItem: { display: 'flex', alignItems: 'center', gap: 7 },
  timelineDot: { width: 22, height: 22, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, background: 'var(--bg-elevated)', color: 'var(--text-low)', border: '1px solid var(--border)' },
  timelineDotOn: { background: 'var(--success)', color: '#fff', border: '1px solid var(--success)' },
  timelineDotNow: { background: 'color-mix(in srgb, var(--warn) 16%, transparent)', color: 'var(--warn)', border: '1px solid var(--warn)' },
  banner: { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 18, border: '1px solid var(--border)', marginBottom: 14 },
  bannerIcon: { width: 38, height: 38, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
};
