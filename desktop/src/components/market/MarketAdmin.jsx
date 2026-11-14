import React, { useCallback, useEffect, useState } from 'react';
import { WalletIcon, CheckIcon, StoreIcon, TagIcon, CloseIcon, ShieldCheckIcon, AlertIcon } from '../Icons';
import VerificationAdmin from './VerificationAdmin';
import { brl, StoreAvatar, formatDate, errorText, ui } from './marketUtils';

const PIX_LABEL = { cpf: 'CPF', cnpj: 'CNPJ', email: 'Email', phone: 'Celular', random: 'Aleatória' };

// Painel dos administradores (ADMIN_EMAILS): verificação de vendedores e repasses.
export default function MarketAdmin({ api, refreshKey }) {
  const [tab, setTab] = useState('verificacoes');
  const [pending, setPending] = useState(0);
  useEffect(() => {
    api.get('/market/verification/admin/list?status=pending').then(({ data }) => setPending(data.counts?.pending || 0)).catch(() => {});
  }, [api, refreshKey]);
  return (
    <div>
      <div style={st.adminTabs}>
        {[['verificacoes', 'Verificações', ShieldCheckIcon], ['repasses', 'Repasses', WalletIcon]].map(([id, label, Icon]) => (
          <button key={id} type="button" onClick={() => setTab(id)} style={{ ...st.adminTab, ...(tab === id ? st.adminTabActive : {}) }}>
            <Icon size={15} /> {label}
            {id === 'verificacoes' && pending > 0 && <span style={st.badge}>{pending}</span>}
          </button>
        ))}
      </div>
      {tab === 'verificacoes'
        ? <VerificationAdmin api={api} refreshKey={refreshKey} onCountChange={setPending} />
        : <PayoutsAdmin api={api} refreshKey={refreshKey} />}
    </div>
  );
}

function payoutText(store) {
  if (store.payout?.pix) return `${PIX_LABEL[store.payout.pix.type] || 'Pix'}: ${store.payout.pix.key}`;
  return store.payout_info || '';
}

function PayoutsAdmin({ api, refreshKey }) {
  const [data, setData] = useState(null);
  const [payouts, setPayouts] = useState([]);
  const [confirming, setConfirming] = useState(null); // store
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(null);

  const load = useCallback(() => {
    Promise.all([api.get('/market/admin/overview'), api.get('/market/admin/payouts')])
      .then(([o, p]) => { setData(o.data); setPayouts(p.data.payouts); setError(''); })
      .catch((err) => setError(errorText(err, 'Não foi possível carregar')));
  }, [api]);
  useEffect(() => { load(); }, [load, refreshKey]);

  async function registerPayout() {
    setBusy(true);
    setError('');
    try {
      await api.post('/market/admin/payouts', { storeId: confirming.id, note });
      setConfirming(null);
      setNote('');
      load();
    } catch (err) {
      setError(errorText(err, 'Não foi possível registrar'));
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(store) {
    const next = store.status === 'active' ? 'suspended' : 'active';
    if (next === 'suspended' && !window.confirm(`Suspender "${store.name}"? Os produtos saem da vitrine.`)) return;
    try {
      await api.put(`/market/admin/stores/${store.id}/status`, { status: next });
      load();
    } catch (err) {
      setError(errorText(err));
    }
  }

  function copy(text, id) {
    navigator.clipboard?.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 1500);
  }

  if (!data) return error ? <div style={ui.error}>{error}</div> : <div style={st.hint}>Carregando…</div>;
  const owing = data.stores.filter((s) => s.summary.available_cents > 0);

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={st.tiles}>
        <div style={{ ...st.tile, background: 'var(--accent)', borderColor: 'var(--accent)' }}>
          <WalletIcon size={18} style={{ color: '#fff' }} />
          <div style={{ ...st.tileValue, color: '#fff' }}>{brl(data.totals.to_pay_cents)}</div>
          <div style={{ ...st.tileLabel, color: 'rgba(255,255,255,0.8)' }}>A repassar agora ({owing.length} loja{owing.length === 1 ? '' : 's'})</div>
        </div>
        <div style={st.tile}>
          <TagIcon size={18} style={{ color: 'var(--accent)' }} />
          <div style={st.tileValue}>{brl(data.totals.gross_cents)}</div>
          <div style={st.tileLabel}>Vendido no total ({data.totals.orders} pedidos)</div>
        </div>
        <div style={st.tile}>
          <CheckIcon size={18} style={{ color: 'var(--success)' }} />
          <div style={st.tileValue}>{brl(data.totals.fee_cents)}</div>
          <div style={st.tileLabel}>Taxas do SafeCord ({data.feePercent}%)</div>
        </div>
      </div>
      <div style={st.note}>
        O dinheiro das vendas cai na conta do Mercado Pago do SafeCord. Pague cada loja pela chave Pix dela e clique em
        "Registrar repasse" — isso zera o saldo liberado e avisa o vendedor.
      </div>

      {error && <div style={{ ...ui.error, marginBottom: 12 }}>{error}</div>}

      <div style={st.sectionTitle}>Lojas</div>
      <div style={st.table}>
        {data.stores.length === 0 && <div style={st.hint}>Nenhuma loja ainda.</div>}
        {data.stores.map((s) => (
          <div key={s.id} style={{ ...st.row, opacity: s.status === 'active' ? 1 : 0.6 }}>
            <StoreAvatar store={s} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={st.storeName}>{s.name}
                {s.status === 'suspended' && <span style={st.suspended}>suspensa</span>}
                {s.status === 'pending' && <span style={{ ...st.suspended, color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 14%, transparent)' }}>esperando verificação</span>}</div>
              <div style={st.meta}>
                {s.owner ? `${s.owner.display_name || s.owner.username}#${s.owner.tag}` : '—'} · {s.summary.orders} venda(s)
              </div>
              {s.can_receive && payoutText(s) ? (
                <button type="button" style={st.pix} onClick={() => copy(s.payout?.pix?.key || s.payout_info, s.id)} title="Copiar chave Pix">
                  {s.payout?.pix ? '' : 'Pix: '}{payoutText(s)}
                  {s.payout?.verified && <span style={st.verified}><ShieldCheckIcon size={11} /> verificada</span>}
                  {copied === s.id && <span style={{ color: 'var(--success)' }}> · copiado</span>}
                </button>
              ) : (
                <div style={{ ...st.pix, color: 'var(--warn)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <AlertIcon size={12} /> {s.verification_status === 'pending' ? 'Verificação em análise' : 'Vendedor ainda não verificado'}
                </div>
              )}
              {s.can_receive && s.payout?.bank && (
                <div style={st.meta}>{s.payout.bank.bank_name} · ag {s.payout.bank.agency} · conta {s.payout.bank.account}-{s.payout.bank.account_digit} · {s.payout.bank.holder_name}</div>
              )}
            </div>
            <div style={st.money}>
              <div style={st.moneyMain}>{brl(s.summary.available_cents)}</div>
              <div style={st.meta}>liberado · {brl(s.summary.pending_cents)} a liberar</div>
              <div style={st.meta}>já repassado {brl(s.summary.paid_out_cents)}</div>
            </div>
            <div style={st.actions}>
              <button type="button" style={{ ...ui.btnPrimary, opacity: s.summary.available_cents > 0 && s.can_receive ? 1 : 0.4 }} disabled={s.summary.available_cents <= 0 || !s.can_receive} onClick={() => setConfirming(s)}>
                Registrar repasse
              </button>
              <button type="button" style={ui.btnDanger} onClick={() => toggleStatus(s)}>
                {s.status === 'active' ? 'Suspender' : 'Reativar'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ ...st.sectionTitle, marginTop: 22 }}>Repasses feitos</div>
      <div style={st.table}>
        {payouts.length === 0 && <div style={st.hint}>Nenhum repasse registrado.</div>}
        {payouts.map((p) => (
          <div key={p.id} style={st.payoutRow}>
            <StoreIcon size={15} style={{ color: 'var(--text-low)' }} />
            <span style={{ flex: 1, fontWeight: 600, color: 'var(--text-hi)' }}>{p.store_name}</span>
            <span style={st.meta}>{p.order_count} pedido(s){p.note ? ` · ${p.note}` : ''}</span>
            <span style={st.meta}>{formatDate(p.created_at)}</span>
            <strong style={{ color: 'var(--text-hi)', minWidth: 96, textAlign: 'right' }}>{brl(p.amount_cents)}</strong>
          </div>
        ))}
      </div>

      {confirming && (
        <div style={ui.overlay} onClick={() => setConfirming(null)}>
          <div style={{ ...ui.modal, maxWidth: 440, padding: 22, gap: 14 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontSize: 17, fontWeight: 750, color: 'var(--text-hi)' }}>Registrar repasse</div>
              <button type="button" style={ui.closeBtn} onClick={() => setConfirming(null)}><CloseIcon size={15} /></button>
            </div>
            <div style={st.confirmBox}>
              <div style={st.meta}>Pagar para</div>
              <div style={st.storeName}>{confirming.name}</div>
              <div style={{ ...st.moneyMain, fontSize: 26, margin: '6px 0' }}>{brl(confirming.summary.available_cents)}</div>
              <div style={st.meta}>Pix: <strong style={{ color: 'var(--text-hi)' }}>{payoutText(confirming) || 'não informado'}</strong></div>
              {confirming.payout?.bank && (
                <div style={{ ...st.meta, marginTop: 4 }}>
                  Titular: <strong style={{ color: 'var(--text-hi)' }}>{confirming.payout.bank.holder_name}</strong> · {confirming.payout.bank.holder_document_formatted}
                </div>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-mid)', lineHeight: 1.5 }}>
              Só confirme depois de fazer o Pix. Esse valor sai do saldo da loja e o vendedor é avisado.
            </div>
            <input style={ui.input} placeholder="Observação (ex.: id da transação Pix)" value={note} onChange={(e) => setNote(e.target.value)} />
            {error && <div style={ui.error}>{error}</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button type="button" style={ui.btnGhost} onClick={() => setConfirming(null)}>Cancelar</button>
              <button type="button" style={ui.btnPrimary} disabled={busy} onClick={registerPayout}>{busy ? 'Registrando…' : 'Já paguei, registrar'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const st = {
  adminTabs: { display: 'flex', gap: 6, marginBottom: 16 },
  adminTab: { display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-mid)', fontSize: 13.5, fontWeight: 650, padding: '9px 15px', borderRadius: 13, cursor: 'pointer', fontFamily: 'inherit' },
  adminTabActive: { background: 'var(--accent)', border: '1px solid var(--accent)', color: 'var(--accent-contrast, #fff)' },
  badge: { fontSize: 11, fontWeight: 800, background: 'var(--warn)', color: '#1a1300', borderRadius: 999, padding: '1px 7px' },
  verified: { display: 'inline-flex', alignItems: 'center', gap: 3, marginLeft: 7, fontSize: 11, fontWeight: 650, color: 'var(--success)' },
  hint: { color: 'var(--text-low)', fontSize: 13, padding: '18px 0', textAlign: 'center' },
  tiles: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 },
  tile: { ...ui.card, padding: 16, display: 'flex', flexDirection: 'column', gap: 6 },
  tileValue: { fontSize: 22, fontWeight: 800, color: 'var(--text-hi)', letterSpacing: -0.4, marginTop: 4 },
  tileLabel: { fontSize: 12, color: 'var(--text-low)' },
  note: { fontSize: 12.5, color: 'var(--text-low)', lineHeight: 1.55, margin: '12px 2px 18px' },
  sectionTitle: { fontSize: 13, fontWeight: 650, color: 'var(--text-low)', margin: '0 0 10px 2px' },
  table: { display: 'flex', flexDirection: 'column', gap: 8 },
  row: { ...ui.card, display: 'flex', alignItems: 'center', gap: 14, padding: 14, borderRadius: 16, flexWrap: 'wrap' },
  storeName: { fontSize: 14.5, fontWeight: 700, color: 'var(--text-hi)', display: 'flex', alignItems: 'center', gap: 8 },
  suspended: { fontSize: 11, fontWeight: 650, color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 12%, transparent)', borderRadius: 999, padding: '2px 8px' },
  meta: { fontSize: 12, color: 'var(--text-low)' },
  pix: { border: 'none', background: 'none', padding: 0, marginTop: 4, fontSize: 12, color: 'var(--text-mid)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left' },
  money: { textAlign: 'right', minWidth: 160 },
  moneyMain: { fontSize: 18, fontWeight: 800, color: 'var(--text-hi)' },
  actions: { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'stretch' },
  payoutRow: { ...ui.card, display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 14, fontSize: 13 },
  confirmBox: { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, textAlign: 'center' },
};
