import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ProfileCard from './ProfileCard';
import { EditIcon } from './Icons';

const WIDTH = 300;

// Cartão de perfil de outra pessoa — abre ao clicar num membro da lista ou num nome/avatar no chat.
// target: { userId, serverId, rect (DOMRect do elemento clicado), preview (dados que já temos) }
export default function ProfileViewer({ api, target, me, onClose, onEditOwn }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [pos, setPos] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!target) return undefined;
    let alive = true;
    setData(null);
    setError('');
    const qs = target.serverId ? `?serverId=${encodeURIComponent(target.serverId)}` : '';
    api.get(`/users/${target.userId}/profile${qs}`)
      .then(({ data: d }) => { if (alive) setData(d); })
      .catch((err) => { if (alive) setError(err?.response?.data?.error || 'Não foi possível abrir o perfil'); });
    return () => { alive = false; };
  }, [api, target]);

  // Posiciona ao lado do que foi clicado e mantém dentro da janela
  useLayoutEffect(() => {
    if (!target) return;
    const r = target.rect;
    const h = ref.current?.offsetHeight || 380;
    let left = r.right + 12;
    if (left + WIDTH > window.innerWidth - 8) left = r.left - WIDTH - 12;
    left = Math.max(8, Math.min(left, window.innerWidth - WIDTH - 8));
    const top = Math.max(8, Math.min(r.top, window.innerHeight - h - 8));
    setPos({ left, top });
  }, [target, data, error]);

  useEffect(() => {
    if (!target) return undefined;
    function onDown(e) { if (!ref.current?.contains(e.target)) onClose(); }
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    // adia um tique para o mesmo clique que abriu não fechar
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [target, onClose]);

  if (!target) return null;
  const isMe = me?.id === target.userId;
  const user = data?.user || (isMe ? me : target.preview) || null;

  return createPortal(
    <div
      ref={ref}
      data-profile-viewer
      style={{
        position: 'fixed', zIndex: 400, left: pos?.left ?? -9999, top: pos?.top ?? 0,
        maxHeight: 'calc(100vh - 16px)', overflowY: 'auto', borderRadius: 20,
        animation: 'scFadeIn 120ms ease-out',
      }}
    >
      <ProfileCard user={user} member={data?.member} mutualServers={data?.mutual_servers} width={WIDTH} showStatus={Boolean(user?.status_mode)}>
        {!data && !error && <div style={st.hint}>Carregando perfil…</div>}
        {error && <div style={st.error}>{error}</div>}
        {data?.friendship === 'accepted' && <div style={st.friend}>Vocês são amigos</div>}
        {isMe && (
          <button type="button" style={st.btn} onClick={() => { onEditOwn?.(); onClose(); }}>
            <EditIcon size={13} /> Editar perfil
          </button>
        )}
      </ProfileCard>
    </div>,
    document.body,
  );
}

const st = {
  hint: { fontSize: 12, color: 'var(--text-low)', padding: '10px 0 6px' },
  error: { fontSize: 12, color: 'var(--danger)', padding: '10px 0 6px' },
  friend: { fontSize: 11.5, color: 'var(--success)', fontWeight: 650, padding: '8px 0 4px' },
  btn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', margin: '10px 0 6px',
    background: 'var(--accent)', color: 'var(--on-color, #fff)', border: 'none', borderRadius: 12, padding: '9px 10px',
    fontSize: 12.5, fontWeight: 650, cursor: 'pointer', fontFamily: 'inherit',
  },
};
