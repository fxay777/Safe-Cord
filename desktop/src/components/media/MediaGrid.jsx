import React, { useState } from 'react';
import { resolveAssetUrl } from '../../api';
import MediaViewer from './MediaViewer';
import { PlayIcon } from '../Icons';

// Fotos e vídeos de uma mensagem, em álbum (como no WhatsApp): 1 grande, 2 lado a lado,
// 3 = 1 + 2, 4 ou mais = grade 2×2 com "+N". Tamanho reservado antes de carregar (não "pula").
const MAX_W = 420;
const MAX_H = 340;

function fit(w, h) {
  if (!w || !h) return { width: 320, height: 220 };
  const r = Math.min(MAX_W / w, MAX_H / h, 1);
  return { width: Math.max(80, Math.round(w * r)), height: Math.max(60, Math.round(h * r)) };
}

const fmtDur = (s) => (s ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}` : '');

export default function MediaGrid({ items, author }) {
  const [open, setOpen] = useState(null);
  const media = items.filter((a) => a.type?.startsWith('image/') || a.type?.startsWith('video/'));
  if (media.length === 0) return null;

  // Um vídeo sozinho toca ali mesmo; com outros itens vira miniatura que abre no visualizador
  if (media.length === 1) {
    const a = media[0];
    const size = fit(a.width, a.height);
    return (
      <div style={{ marginTop: 6 }} data-media-grid="1">
        {a.type.startsWith('video/') ? (
          <video src={resolveAssetUrl(a.url)} controls preload="metadata" style={{ ...st.single, width: size.width, height: size.height, background: '#000' }} />
        ) : (
          <button type="button" style={{ ...st.cellBtn, ...st.single, width: size.width, height: size.height }} onClick={() => setOpen(0)}>
            <img src={resolveAssetUrl(a.url)} alt={a.name || 'imagem'} loading="lazy" style={st.img} />
            {a.animated && <span style={st.gif}>GIF</span>}
          </button>
        )}
        {open !== null && <MediaViewer items={media} index={open} author={author} onClose={() => setOpen(null)} />}
      </div>
    );
  }

  const shown = media.slice(0, 4);
  const extra = media.length - 4;
  const layout = shown.length === 2 ? st.two : shown.length === 3 ? st.three : st.four;
  return (
    <div style={{ ...st.album, ...layout }} data-media-grid={media.length}>
      {shown.map((a, i) => (
        <button
          key={a.url}
          type="button"
          style={{ ...st.cellBtn, ...(shown.length === 3 && i === 0 ? { gridRow: 'span 2' } : {}) }}
          onClick={() => setOpen(i)}
        >
          {a.type.startsWith('video/') ? (
            <>
              <video src={`${resolveAssetUrl(a.url)}#t=0.1`} preload="metadata" muted style={st.img} />
              <span style={st.play}><PlayIcon size={18} /></span>
              {a.duration ? <span style={st.dur}>{fmtDur(a.duration)}</span> : null}
            </>
          ) : (
            <>
              <img src={resolveAssetUrl(a.url)} alt={a.name || 'imagem'} loading="lazy" style={st.img} />
              {a.animated && <span style={st.gif}>GIF</span>}
            </>
          )}
          {i === 3 && extra > 0 && <span style={st.more}>+{extra}</span>}
        </button>
      ))}
      {open !== null && <MediaViewer items={media} index={open} author={author} onClose={() => setOpen(null)} />}
    </div>
  );
}

const st = {
  single: { display: 'block', borderRadius: 14, border: '1px solid var(--border)', overflow: 'hidden', maxWidth: '100%' },
  cellBtn: { position: 'relative', padding: 0, border: 'none', background: 'var(--bg-elevated)', cursor: 'zoom-in', overflow: 'hidden', display: 'block', width: '100%', height: '100%' },
  img: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  album: { marginTop: 6, display: 'grid', gap: 3, width: 'min(420px, 100%)', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)' },
  two: { gridTemplateColumns: '1fr 1fr', height: 220 },
  three: { gridTemplateColumns: '1.4fr 1fr', gridTemplateRows: '1fr 1fr', height: 300 },
  four: { gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', height: 340 },
  more: { position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 26, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  play: { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 42, height: 42, borderRadius: 21, background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  dur: { position: 'absolute', right: 6, bottom: 6, fontSize: 11, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '2px 6px' },
  gif: { position: 'absolute', left: 6, bottom: 6, fontSize: 10.5, fontWeight: 800, color: '#fff', background: 'rgba(0,0,0,0.6)', borderRadius: 6, padding: '2px 6px', letterSpacing: 0.5 },
};
