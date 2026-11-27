import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { resolveAssetUrl } from '../../api';
import { CloseIcon, DownloadIcon, ChevronLeftIcon, ChevronRightIcon } from '../Icons';

// Visualizador em tela cheia das fotos e vídeos de uma mensagem (setas, zoom, baixar).
export default function MediaViewer({ items, index: start = 0, author, onClose }) {
  const [i, setI] = useState(start);
  const [zoom, setZoom] = useState(false);
  const item = items[i];
  const go = useCallback((d) => { setZoom(false); setI((x) => (x + d + items.length) % items.length); }, [items.length]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight' && items.length > 1) go(1);
      else if (e.key === 'ArrowLeft' && items.length > 1) go(-1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, items.length, onClose]);

  if (!item) return null;
  const url = resolveAssetUrl(item.url);
  const isVideo = item.type?.startsWith('video/');

  return createPortal(
    <div style={st.overlay} onClick={onClose} data-media-viewer>
      <div style={st.top} onClick={(e) => e.stopPropagation()}>
        <div style={{ minWidth: 0 }}>
          <div style={st.name}>{item.name || (isVideo ? 'Vídeo' : 'Imagem')}</div>
          <div style={st.meta}>
            {author ? `${author} · ` : ''}{items.length > 1 ? `${i + 1} de ${items.length}` : ''}
            {item.width && item.height ? ` · ${item.width}×${item.height}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <a href={url} download={item.name || true} style={st.btn} title="Baixar" onClick={(e) => e.stopPropagation()}><DownloadIcon size={17} /></a>
          <button type="button" style={st.btn} onClick={onClose} title="Fechar (Esc)"><CloseIcon size={17} /></button>
        </div>
      </div>

      <div style={st.stage} onClick={(e) => e.stopPropagation()}>
        {isVideo ? (
          <video key={url} src={url} controls autoPlay style={st.media} />
        ) : (
          <img
            key={url}
            src={url}
            alt={item.name || ''}
            onClick={() => setZoom((z) => !z)}
            style={{ ...st.media, ...(zoom ? st.zoomed : {}), cursor: zoom ? 'zoom-out' : 'zoom-in' }}
          />
        )}
      </div>

      {items.length > 1 && (
        <>
          <button type="button" style={{ ...st.nav, left: 18 }} onClick={(e) => { e.stopPropagation(); go(-1); }} aria-label="Anterior"><ChevronLeftIcon size={22} /></button>
          <button type="button" style={{ ...st.nav, right: 18 }} onClick={(e) => { e.stopPropagation(); go(1); }} aria-label="Próxima"><ChevronRightIcon size={22} /></button>
        </>
      )}
    </div>,
    document.body,
  );
}

const st = {
  overlay: { position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(4,7,14,0.94)', display: 'flex', flexDirection: 'column', animation: 'scFadeIn 120ms ease-out' },
  top: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '14px 18px', color: '#fff' },
  name: { fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  meta: { fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  btn: { width: 38, height: 38, borderRadius: 19, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  stage: { flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 70px 28px', overflow: 'auto' },
  media: { maxWidth: '100%', maxHeight: '100%', borderRadius: 10, display: 'block', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' },
  zoomed: { maxWidth: 'none', maxHeight: 'none' },
  nav: { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 46, height: 46, borderRadius: 23, border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
};
