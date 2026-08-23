import React, { useState } from 'react';
import { resolveAssetUrl } from '../api';
import { EditIcon } from './Icons';

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export default function ServerBanner({ server, user, isOwner, onUploadServerImage, onRemoveServerImage }) {
  const name = server?.name || 'Seu servidor';
  const color = server?.color || 'var(--accent)';
  const [uploading, setUploading] = useState({ icon: false, banner: false });
  const [error, setError] = useState('');

  const bannerUrl = resolveAssetUrl(server?.banner_url);
  const iconUrl = resolveAssetUrl(server?.icon_url);
  const initials = (name || '?').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase() || '?';

  async function handleSelect(kind, event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file || !onUploadServerImage) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setError('Formato não suportado. Use PNG, JPG, WEBP ou GIF.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Imagem muito grande (máx. 8MB).');
      return;
    }

    setError('');
    setUploading((prev) => ({ ...prev, [kind]: true }));
    try {
      await onUploadServerImage(kind, file);
    } catch (err) {
      setError(err?.response?.data?.error || 'Falha ao enviar a imagem');
    } finally {
      setUploading((prev) => ({ ...prev, [kind]: false }));
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.banner}>
        {bannerUrl ? (
          <div style={{ ...styles.bannerImage, backgroundImage: `url(${bannerUrl})`, opacity: uploading.banner ? 0.5 : 1 }} />
        ) : (
          <div style={{ ...styles.bannerFallback, background: `linear-gradient(135deg, ${color}, var(--accent-secondary))` }} />
        )}

        {isOwner && (
          <div style={styles.bannerControls}>
            <input
              type="file"
              id="server-banner-upload"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              style={styles.fileInput}
              disabled={uploading.banner}
              onChange={(e) => handleSelect('banner', e)}
            />
            <label htmlFor="server-banner-upload" style={styles.ghostChip}>
              {uploading.banner ? 'Enviando…' : bannerUrl ? 'Trocar banner' : 'Adicionar banner'}
            </label>
            {bannerUrl && !uploading.banner && (
              <button type="button" style={styles.ghostChip} onClick={() => onRemoveServerImage?.('banner')}>
                Remover
              </button>
            )}
          </div>
        )}
      </div>

      <div style={styles.card}>
        <div style={styles.avatarWrap}>
          {iconUrl ? (
            <img src={iconUrl} alt={name} style={{ ...styles.avatar, opacity: uploading.icon ? 0.5 : 1 }} />
          ) : (
            <div style={{ ...styles.avatarFallback, background: `linear-gradient(135deg, ${color}, var(--accent-secondary))` }}>{initials}</div>
          )}

          {isOwner && (
            <>
              <input
                type="file"
                id="server-icon-upload"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                style={styles.fileInput}
                disabled={uploading.icon}
                onChange={(e) => handleSelect('icon', e)}
              />
              <label htmlFor="server-icon-upload" style={styles.iconEditBtn} title="Trocar ícone do servidor">
                <EditIcon size={13} />
              </label>
            </>
          )}
        </div>

        <div style={styles.meta}>
          <div style={styles.serverName}>{name}</div>
          <div style={styles.serverMeta}>#{server?.invite_code || 'convite'} · {user?.username || 'usuario'}</div>
        </div>
      </div>

      {error && <div style={styles.errorText}>{error}</div>}
    </div>
  );
}

const styles = {
  wrap: {
    width: '100%',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-base)',
  },
  banner: {
    height: 118,
    position: 'relative',
    overflow: 'hidden',
    background: 'linear-gradient(135deg, rgba(45,212,191,0.28), rgba(129,140,248,0.18))',
  },
  bannerImage: {
    width: '100%',
    height: '100%',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
  },
  bannerFallback: {
    width: '100%',
    height: '100%',
    background: 'var(--accent-gradient)',
  },
  bannerControls: {
    position: 'absolute',
    top: 10,
    right: 10,
    display: 'flex',
    gap: 8,
  },
  fileInput: { display: 'none' },
  ghostChip: {
    background: 'rgba(11,13,18,0.6)',
    border: '1px solid rgba(255,255,255,0.16)',
    color: '#fff',
    fontSize: 11.5,
    fontWeight: 700,
    padding: '6px 10px',
    borderRadius: 8,
    cursor: 'pointer',
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 16px 14px',
    marginTop: -28,
    position: 'relative',
    zIndex: 1,
  },
  avatarWrap: { flexShrink: 0, position: 'relative' },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: '50%',
    objectFit: 'cover',
    border: '4px solid var(--bg-base)',
    boxShadow: '0 10px 30px rgba(0,0,0,0.35)',
  },
  avatarFallback: {
    width: 60,
    height: 60,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: '4px solid var(--bg-base)',
    background: 'var(--accent-gradient)',
    color: 'var(--accent-contrast)',
    fontWeight: 800,
    fontSize: 18,
  },
  iconEditBtn: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 22,
    height: 22,
    borderRadius: '50%',
    background: 'var(--bg-elevated)',
    border: '2px solid var(--bg-base)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-hi)',
    cursor: 'pointer',
  },
  meta: { minWidth: 0, flex: 1 },
  serverName: {
    fontSize: 18,
    fontWeight: 800,
    color: 'var(--text-hi)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  serverMeta: {
    fontSize: 12,
    color: 'var(--text-low)',
    lineHeight: 1.4,
  },
  errorText: {
    color: 'var(--danger)',
    fontSize: 11.5,
    padding: '0 16px 10px',
  },
};
