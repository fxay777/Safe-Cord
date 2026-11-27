import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveAssetUrl } from '../api';
import { SearchIcon, CloseIcon, PlayCircleIcon, VolumeIcon } from './Icons';

// Painel do soundboard (abre pela barra da call). Clique toca pra todo mundo na call;
// o botãozinho de play escuta só pra você antes.
const VOL_KEY = 'safecord_soundboard_volume';
const readVol = () => { try { const v = localStorage.getItem(VOL_KEY); return v === null ? 70 : Number(v); } catch { return 70; } };

export default function Soundboard({ api, serverId, anchorRef, onPlay, onClose }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(null);
  const [vol, setVol] = useState(readVol);
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const previewRef = useRef(null);

  useEffect(() => {
    let alive = true;
    const url = serverId ? `/servers/${serverId}/sounds` : '/sounds/defaults';
    api.get(url).then(({ data: d }) => alive && setData({ canPlay: true, ...d })).catch(() => alive && setData({ sounds: [], canPlay: false }));
    return () => { alive = false; };
  }, [api, serverId]);

  useEffect(() => {
    const r = anchorRef?.current?.getBoundingClientRect();
    const width = 340;
    if (!r) { setPos({ left: 80, bottom: 90 }); return; }
    setPos({ left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)), bottom: Math.max(8, window.innerHeight - r.top + 8) });
  }, [anchorRef]);

  useEffect(() => {
    const onDown = (e) => { if (!ref.current?.contains(e.target) && !anchorRef?.current?.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); previewRef.current?.pause(); };
  }, [onClose, anchorRef]);

  const list = useMemo(() => (data?.sounds || []).filter((s) => s.name.toLowerCase().includes(q.trim().toLowerCase())), [data, q]);

  async function play(s) {
    setBusy(s.id); setMsg('');
    const res = await onPlay(s.id);
    setBusy(null);
    if (res?.error) setMsg(res.error);
  }

  function preview(e, s) {
    e.stopPropagation();
    previewRef.current?.pause();
    const a = new Audio(resolveAssetUrl(s.file));
    a.volume = Math.max(0, Math.min(1, (s.volume / 100) * (vol / 100)));
    previewRef.current = a;
    a.play().catch(() => {});
  }

  function changeVol(v) {
    setVol(v);
    try { localStorage.setItem(VOL_KEY, String(v)); } catch { /* ok */ }
  }

  if (!pos) return null;
  return createPortal(
    <div ref={ref} style={{ ...st.panel, left: pos.left, bottom: pos.bottom }} data-soundboard>
      <div style={st.head}>
        <div style={st.title}>Soundboard</div>
        <button type="button" style={st.close} onClick={onClose} aria-label="Fechar"><CloseIcon size={13} /></button>
      </div>
      <label style={st.search}>
        <SearchIcon size={13} style={{ color: 'var(--text-low)' }} />
        <input autoFocus style={st.searchInput} placeholder="Buscar som" value={q} onChange={(e) => setQ(e.target.value)} />
      </label>
      {!data && <div style={st.hint}>Carregando…</div>}
      {data && !data.canPlay && <div style={st.hint}>O soundboard desse servidor está liberado só pra alguns cargos.</div>}
      {data?.canPlay && list.length === 0 && <div style={st.hint}>{q ? 'Nenhum som com esse nome.' : 'Nenhum som ainda.'}</div>}
      {data?.canPlay && (
        <div style={st.grid}>
          {list.map((s) => (
            <button
              key={s.id}
              type="button"
              className="sc-sound-tile"
              style={{ ...st.tile, '--c': s.color, opacity: busy && busy !== s.id ? 0.6 : 1 }}
              onClick={() => play(s)}
              disabled={Boolean(busy)}
              title={`Tocar "${s.name}" pra todo mundo na call`}
              data-sound={s.id}
            >
              <span style={{ ...st.dot, background: s.color }} />
              <span style={st.name}>{s.name}</span>
              <span role="button" tabIndex={-1} style={st.preview} onClick={(e) => preview(e, s)} title="Ouvir só pra mim"><PlayCircleIcon size={14} /></span>
            </button>
          ))}
        </div>
      )}
      {msg && <div style={st.msg}>{msg}</div>}
      <div style={st.foot}>
        <VolumeIcon size={14} style={{ color: 'var(--text-low)', flexShrink: 0 }} />
        <input type="range" min={0} max={100} value={vol} onChange={(e) => changeVol(Number(e.target.value))} style={{ flex: 1, accentColor: 'var(--accent)' }} aria-label="Volume dos sons (só pra você)" />
        <span style={st.volLabel}>{vol}%</span>
      </div>
    </div>,
    document.body,
  );
}

const st = {
  panel: { position: 'fixed', zIndex: 420, width: 340, maxHeight: '70vh', display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 20, background: 'var(--bg-surface)', border: '1px solid var(--border)', boxShadow: 'var(--shadow-lg)', animation: 'scFadeIn 120ms ease-out' },
  head: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 14.5, fontWeight: 750, color: 'var(--text-hi)' },
  close: { width: 26, height: 26, borderRadius: 13, border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  search: { display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 11, padding: '0 10px' },
  searchInput: { flex: 1, border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-hi)', fontSize: 13, padding: '8px 0', fontFamily: 'inherit' },
  hint: { fontSize: 12.5, color: 'var(--text-low)', padding: '10px 2px', textAlign: 'center' },
  grid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, overflowY: 'auto' },
  tile: { position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 30px 9px 10px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--bg-elevated)', cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left', minWidth: 0 },
  dot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  name: { fontSize: 12.5, fontWeight: 650, color: 'var(--text-hi)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  preview: { position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, borderRadius: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-low)', cursor: 'pointer' },
  msg: { fontSize: 12, color: 'var(--warn)', background: 'color-mix(in srgb, var(--warn) 12%, transparent)', padding: '7px 10px', borderRadius: 10 },
  foot: { display: 'flex', alignItems: 'center', gap: 8, paddingTop: 8, borderTop: '1px solid var(--border)' },
  volLabel: { fontSize: 11.5, color: 'var(--text-low)', width: 34, textAlign: 'right' },
};
