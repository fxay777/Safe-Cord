import React from 'react';
import { resolveAssetUrl } from '../api';
import { PhoneIcon, PhoneOffIcon } from './Icons';

// Chamada privada chegando: aparece no canto (como no Discord), com atender e recusar.
export default function IncomingCallModal({ call, onAccept, onDecline }) {
  const c = call.caller || {};
  const name = c.display_name || c.username || 'Alguém';
  const avatar = resolveAssetUrl(c.avatar_url);
  return (
    <div style={st.wrap} role="dialog" aria-label="Chamada recebida" data-incoming-call>
      <div style={st.avatarRing}>
        {avatar ? <img src={avatar} alt="" style={st.avatar} /> : <span style={{ ...st.avatar, background: c.avatar_color || 'var(--accent)' }}>{name[0]?.toUpperCase()}</span>}
      </div>
      <div style={st.name}>{name}</div>
      <div style={st.sub}>{call.isGroup ? `Chamada em grupo · ${call.memberCount} pessoas` : 'está te ligando…'}</div>
      <div style={st.actions}>
        <button type="button" style={{ ...st.btn, background: 'var(--danger)' }} onClick={onDecline} title="Recusar" aria-label="Recusar">
          <PhoneOffIcon size={20} />
        </button>
        <button type="button" style={{ ...st.btn, background: 'var(--success)' }} onClick={onAccept} title="Atender" aria-label="Atender" className="sc-call-accept">
          <PhoneIcon size={19} />
        </button>
      </div>
    </div>
  );
}

const st = {
  wrap: {
    position: 'fixed', right: 22, bottom: 22, zIndex: 500, width: 250, padding: '22px 18px 18px', borderRadius: 24,
    background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)',
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, animation: 'scFadeIn 160ms ease-out',
  },
  avatarRing: { padding: 4, borderRadius: '50%', border: '3px solid var(--success)', animation: 'scPulse 1.4s ease-in-out infinite', marginBottom: 10 },
  avatar: { width: 76, height: 76, borderRadius: '50%', objectFit: 'cover', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 28 },
  name: { fontSize: 17, fontWeight: 750, color: 'var(--text-hi)', textAlign: 'center' },
  sub: { fontSize: 12.5, color: 'var(--text-low)', textAlign: 'center' },
  actions: { display: 'flex', gap: 22, marginTop: 16 },
  btn: { width: 52, height: 52, borderRadius: 26, border: 'none', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
