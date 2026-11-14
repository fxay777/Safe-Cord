import React from 'react';
import { resolveAssetUrl } from '../../api';
import { PackageIcon, FileIcon } from '../Icons';

export function brl(cents) {
  return ((cents || 0) / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** "49,90" / "49.90" / "R$ 1.234,56" → 4990 (centavos). Vazio/ruim → NaN */
export function parseBRL(text) {
  const clean = String(text ?? '').replace(/[^\d,.]/g, '');
  if (!clean) return NaN;
  const normalized = clean.includes(',')
    ? clean.replace(/\./g, '').replace(',', '.')
    : clean;
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : NaN;
}

export function centsToInput(cents) {
  if (cents === null || cents === undefined || Number.isNaN(cents)) return '';
  return (cents / 100).toFixed(2).replace('.', ',');
}

export const ORDER_STATUS = {
  pending: { label: 'Aguardando pagamento', color: 'var(--warn)' },
  paid: { label: 'Pago — aguardando envio', color: 'var(--accent)' },
  shipped: { label: 'Enviado', color: '#A78BFA' },
  delivered: { label: 'Concluído', color: 'var(--success)' },
  canceled: { label: 'Cancelado', color: 'var(--text-low)' },
};

export function StatusPill({ status, type }) {
  const meta = ORDER_STATUS[status] || ORDER_STATUS.pending;
  const label = status === 'delivered' && type === 'digital' ? 'Entregue (download liberado)' : meta.label;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 650, color: meta.color,
      background: `color-mix(in srgb, ${meta.color} 14%, transparent)`, borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: meta.color }} />
      {label}
    </span>
  );
}

export function TypeBadge({ type, style }) {
  const digital = type === 'digital';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 650,
      color: digital ? '#A78BFA' : 'var(--accent)',
      background: digital ? 'rgba(167,139,250,0.14)' : 'var(--accent-soft)',
      borderRadius: 999, padding: '3px 9px', ...style,
    }}>
      {digital ? <FileIcon size={11} /> : <PackageIcon size={11} />}
      {digital ? 'Digital' : 'Físico'}
    </span>
  );
}

/** Foto do produto (ou um placeholder bonito com o ícone do tipo) */
export function ProductImage({ src, type, style, iconSize = 34 }) {
  const url = resolveAssetUrl(src);
  if (url) {
    return <img src={url} alt="" draggable={false} style={{ objectFit: 'cover', display: 'block', ...style }} />;
  }
  const digital = type === 'digital';
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: digital
        ? 'radial-gradient(circle at 30% 25%, rgba(167,139,250,0.35), rgba(167,139,250,0.08) 60%), var(--bg-elevated)'
        : 'radial-gradient(circle at 30% 25%, color-mix(in srgb, var(--accent) 35%, transparent), color-mix(in srgb, var(--accent) 8%, transparent) 60%), var(--bg-elevated)',
      color: digital ? '#A78BFA' : 'var(--accent)',
      ...style,
    }}>
      {digital ? <FileIcon size={iconSize} /> : <PackageIcon size={iconSize} />}
    </div>
  );
}

export function StoreAvatar({ store, size = 28 }) {
  const url = resolveAssetUrl(store?.logo_url);
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: size * 0.32, objectFit: 'cover', flexShrink: 0 }} />;
  return (
    <span style={{
      width: size, height: size, borderRadius: size * 0.32, flexShrink: 0, display: 'inline-flex',
      alignItems: 'center', justifyContent: 'center', background: 'var(--accent)', color: '#fff',
      fontWeight: 700, fontSize: size * 0.42,
    }}>
      {(store?.name || '?')[0].toUpperCase()}
    </span>
  );
}

export function formatDate(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function errorText(err, fallback = 'Algo deu errado') {
  return err?.response?.data?.error || fallback;
}

/** Baixa um arquivo protegido (precisa do token) e salva com o nome certo */
export async function downloadWithAuth(api, url, fallbackName = 'arquivo') {
  const res = await api.get(url, { responseType: 'blob' });
  const disposition = res.headers['content-disposition'] || '';
  const match = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  const name = match ? decodeURIComponent(match[1]) : fallbackName;
  const href = URL.createObjectURL(res.data);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
}

// Estilos compartilhados entre as telas do mercado
export const ui = {
  btnPrimary: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: 'none',
    background: 'var(--accent)', color: 'var(--accent-contrast)', fontWeight: 650, fontSize: 13.5,
    padding: '10px 18px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  btnGhost: {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
    border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-hi)',
    fontWeight: 600, fontSize: 13, padding: '9px 14px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap',
  },
  btnDanger: {
    display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent',
    color: 'var(--danger)', fontWeight: 600, fontSize: 13, padding: '9px 10px', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
  },
  input: {
    width: '100%', boxSizing: 'border-box', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '11px 13px', color: 'var(--text-hi)', fontSize: 14, outline: 'none', fontFamily: 'inherit',
  },
  label: { display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-mid)', margin: '0 0 7px 2px' },
  overlay: {
    position: 'fixed', inset: 0, background: 'var(--scrim)', display: 'flex', alignItems: 'center',
    justifyContent: 'center', zIndex: 140, padding: 20,
  },
  modal: {
    background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 24,
    boxShadow: 'var(--shadow-lg)', maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
    width: '100%',
  },
  closeBtn: {
    width: 34, height: 34, borderRadius: 17, border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-mid)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  error: {
    fontSize: 12.5, color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
    borderRadius: 12, padding: '9px 12px',
  },
  card: { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 18 },
};
