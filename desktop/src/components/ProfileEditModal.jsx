import React, { useEffect, useState } from 'react';
import { resolveAssetUrl } from '../api';
import {
  CameraIcon, MusicIcon, LinkIcon, TrashIcon, CheckIcon,
  GameControllerIcon, GithubIcon, DiceIcon, TwitchIcon,
  PlayCircleIcon, CameraSquareIcon, TikTokIcon, GlobeIcon,
} from './Icons';

// X (antigo Twitter) não tem um ícone de linha universalmente reconhecível como os outros —
// desenhamos o "X" geométrico oficial em vez de usar texto solto tipografado.
function XLogoIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M4 4l16 16M20 4 4 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8MB — o servidor otimiza/comprime depois
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const AVATAR_COLORS = ['#2DD4BF', '#F0B429', '#818CF8', '#F87171', '#34D399', '#38BDF8', '#F0568C', '#8BD450'];

const PLATFORMS = [
  { id: 'discord', label: 'Discord', Icon: GameControllerIcon, placeholder: 'usuario#0000' },
  { id: 'x', label: 'X / Twitter', Icon: XLogoIcon, placeholder: '@usuario' },
  { id: 'instagram', label: 'Instagram', Icon: CameraSquareIcon, placeholder: '@usuario' },
  { id: 'youtube', label: 'YouTube', Icon: PlayCircleIcon, placeholder: '@canal' },
  { id: 'twitch', label: 'Twitch', Icon: TwitchIcon, placeholder: 'usuario' },
  { id: 'github', label: 'GitHub', Icon: GithubIcon, placeholder: 'usuario' },
  { id: 'steam', label: 'Steam', Icon: DiceIcon, placeholder: 'usuario' },
  { id: 'tiktok', label: 'TikTok', Icon: TikTokIcon, placeholder: '@usuario' },
  { id: 'site', label: 'Site pessoal', Icon: GlobeIcon, placeholder: 'https://...' },
];

function platformMeta(id) {
  return PLATFORMS.find((p) => p.id === id) || PLATFORMS[PLATFORMS.length - 1];
}

function emptyDraft(user, themeAccent) {
  return {
    display_name: user?.display_name || '',
    bio: user?.bio || '',
    avatar_color: user?.avatar_color || themeAccent,
    spotify_track: user?.spotify_track_id || '',
    connections: user?.connections ? [...user.connections] : [],
  };
}

export default function ProfileEditModal({ open, user, onClose, onSaveProfile, onUploadProfileImage, onRemoveProfileImage, themeAccent = '#4CC2F0' }) {
  const [draft, setDraft] = useState(() => emptyDraft(user, themeAccent));
  const [localPreview, setLocalPreview] = useState({ avatar: null, banner: null });
  const [uploading, setUploading] = useState({ avatar: false, banner: false });
  const [imageError, setImageError] = useState({ avatar: '', banner: '' });
  const [spotifyPreview, setSpotifyPreview] = useState(null); // {title, image, url}
  const [spotifyLoading, setSpotifyLoading] = useState(false);
  const [spotifyError, setSpotifyError] = useState('');
  const [addingConnection, setAddingConnection] = useState(false);
  const [newConnPlatform, setNewConnPlatform] = useState('discord');
  const [newConnValue, setNewConnValue] = useState('');
  const [saving, setSaving] = useState(false);

  const avatarUrl = resolveAssetUrl(user?.avatar_url);
  const bannerUrl = resolveAssetUrl(user?.banner_url);
  const initials = (draft.display_name || user?.username || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  useEffect(() => {
    if (open) {
      setDraft(emptyDraft(user, themeAccent));
      setSpotifyError('');
      setAddingConnection(false);
    }
  }, [open, user]);

  // Busca capa/título da faixa via oEmbed público do Spotify — só precisa do link, sem API key.
  useEffect(() => {
    const trackRef = draft.spotify_track;
    if (!trackRef) {
      setSpotifyPreview(null);
      return;
    }
    let cancelled = false;
    setSpotifyLoading(true);
    setSpotifyError('');
    const trackUrl = trackRef.startsWith('http') ? trackRef : `https://open.spotify.com/track/${trackRef}`;
    fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(trackUrl)}`)
      .then((r) => { if (!r.ok) throw new Error(); return r.json(); })
      .then((data) => {
        if (cancelled) return;
        setSpotifyPreview({ title: data.title, image: data.thumbnail_url, url: trackUrl });
      })
      .catch(() => { if (!cancelled) { setSpotifyPreview(null); setSpotifyError('Não consegui encontrar essa música — confira o link.'); } })
      .finally(() => { if (!cancelled) setSpotifyLoading(false); });
    return () => { cancelled = true; };
  }, [draft.spotify_track]);

  if (!open) return null;

  async function handleImageSelect(kind, event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setImageError((prev) => ({ ...prev, [kind]: 'Formato não suportado. Use PNG, JPG, WEBP ou GIF.' }));
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError((prev) => ({ ...prev, [kind]: 'Imagem muito grande (máx. 8MB).' }));
      return;
    }

    setImageError((prev) => ({ ...prev, [kind]: '' }));
    const localUrl = URL.createObjectURL(file);
    setLocalPreview((prev) => ({ ...prev, [kind]: localUrl }));
    setUploading((prev) => ({ ...prev, [kind]: true }));

    try {
      await onUploadProfileImage(kind, file);
    } catch (err) {
      setImageError((prev) => ({ ...prev, [kind]: err?.response?.data?.error || 'Falha ao enviar a imagem' }));
    } finally {
      setUploading((prev) => ({ ...prev, [kind]: false }));
      URL.revokeObjectURL(localUrl);
      setLocalPreview((prev) => ({ ...prev, [kind]: null }));
    }
  }

  async function handleRemoveImage(kind) {
    try {
      await onRemoveProfileImage(kind);
    } catch {
      setImageError((prev) => ({ ...prev, [kind]: 'Falha ao remover a imagem' }));
    }
  }

  function addConnection() {
    const value = newConnValue.trim();
    if (!value) return;
    setDraft((prev) => ({
      ...prev,
      connections: [...prev.connections, { platform: newConnPlatform, label: value, url: value }],
    }));
    setNewConnValue('');
    setAddingConnection(false);
  }

  function removeConnection(index) {
    setDraft((prev) => ({ ...prev, connections: prev.connections.filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSaveProfile({
        display_name: draft.display_name,
        bio: draft.bio,
        avatar_color: draft.avatar_color,
        spotify_track: draft.spotify_track,
        connections: draft.connections,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const shownAvatar = localPreview.avatar || avatarUrl;
  const shownBanner = localPreview.banner || bannerUrl;

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <button type="button" style={styles.closeBtn} onClick={onClose}>×</button>

        {/* HERO: banner + avatar, edição direto na imagem (estilo Telegram) */}
        <div style={styles.hero}>
          <div
            style={{
              ...styles.banner,
              ...(shownBanner
                ? { backgroundImage: `url(${shownBanner})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : { background: `linear-gradient(135deg, ${draft.avatar_color}, var(--accent-secondary))` }),
              opacity: uploading.banner ? 0.55 : 1,
            }}
          >
            <label style={styles.bannerEditBtn} title="Trocar banner">
              <CameraIcon size={14} />
              <input type="file" accept="image/*" style={styles.hiddenInput} onChange={(e) => handleImageSelect('banner', e)} disabled={uploading.banner} />
            </label>
            {bannerUrl && !uploading.banner && (
              <button type="button" style={styles.bannerRemoveBtn} onClick={() => handleRemoveImage('banner')} title="Remover banner"><TrashIcon size={13} /></button>
            )}
          </div>

          <div style={styles.avatarWrap}>
            {shownAvatar ? (
              <img src={shownAvatar} alt="avatar" style={{ ...styles.avatarImg, opacity: uploading.avatar ? 0.55 : 1 }} />
            ) : (
              <div style={{ ...styles.avatarFallback, background: draft.avatar_color }}>{initials}</div>
            )}
            <label style={styles.avatarEditBtn} title="Trocar foto">
              <CameraIcon size={12} />
              <input type="file" accept="image/*" style={styles.hiddenInput} onChange={(e) => handleImageSelect('avatar', e)} disabled={uploading.avatar} />
            </label>
          </div>
        </div>

        {(imageError.avatar || imageError.banner) && (
          <div style={styles.errorBanner}>{imageError.avatar || imageError.banner}</div>
        )}

        <div style={styles.body}>
          {/* NOME + BIO */}
          <div style={styles.section}>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Nome de exibição</label>
              <input
                value={draft.display_name}
                onChange={(e) => setDraft((prev) => ({ ...prev, display_name: e.target.value }))}
                style={styles.input}
                placeholder={user?.username || 'Seu nome'}
                maxLength={40}
              />
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Bio</label>
              <textarea
                value={draft.bio}
                onChange={(e) => setDraft((prev) => ({ ...prev, bio: e.target.value }))}
                style={styles.textarea}
                rows={3}
                maxLength={220}
                placeholder="Conte um pouco sobre você"
              />
              <div style={styles.charCount}>{draft.bio.length}/220</div>
            </div>
            <div style={styles.fieldGroup}>
              <label style={styles.label}>Cor do avatar</label>
              <div style={styles.colorRow}>
                {AVATAR_COLORS.map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, avatar_color: color }))}
                    style={{ ...styles.colorSwatch, background: color, ...(draft.avatar_color === color ? styles.colorSwatchActive : {}) }}
                    title={color}
                  >
                    {draft.avatar_color === color && <CheckIcon size={12} />}
                  </button>
                ))}
                <input
                  type="color"
                  value={draft.avatar_color}
                  onChange={(e) => setDraft((prev) => ({ ...prev, avatar_color: e.target.value }))}
                  style={styles.colorPicker}
                />
              </div>
            </div>
          </div>

          <div style={styles.divider} />

          {/* MÚSICA (Spotify) — igual à música fixada do Instagram */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionIcon}><MusicIcon size={15} /></span>
              <span style={styles.sectionTitle}>Música do perfil</span>
            </div>
            <div style={styles.hint}>Cole o link de uma faixa do Spotify pra fixar no seu perfil.</div>
            <input
              value={draft.spotify_track}
              onChange={(e) => setDraft((prev) => ({ ...prev, spotify_track: e.target.value }))}
              style={styles.input}
              placeholder="https://open.spotify.com/track/..."
            />
            {spotifyLoading && <div style={styles.hint}>Buscando música…</div>}
            {spotifyError && <div style={styles.errorText}>{spotifyError}</div>}
            {spotifyPreview && (
              <div style={styles.spotifyCard}>
                {spotifyPreview.image && <img src={spotifyPreview.image} alt="" style={styles.spotifyArt} />}
                <div style={styles.spotifyMeta}>
                  <div style={styles.spotifyTitle}>{spotifyPreview.title}</div>
                  <div style={styles.spotifyBrand}>Spotify</div>
                </div>
                <button type="button" style={styles.smallGhostBtn} onClick={() => setDraft((prev) => ({ ...prev, spotify_track: '' }))}>
                  Remover
                </button>
              </div>
            )}
          </div>

          <div style={styles.divider} />

          {/* CONTAS CONECTADAS — igual às "conexões" do Discord */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionIcon}><LinkIcon size={15} /></span>
              <span style={styles.sectionTitle}>Contas conectadas</span>
            </div>

            {draft.connections.length > 0 && (
              <div style={styles.connectionList}>
                {draft.connections.map((c, i) => {
                  const meta = platformMeta(c.platform);
                  const MetaIcon = meta.Icon;
                  return (
                    <div key={`${c.platform}-${i}`} style={styles.connectionChip}>
                      <span style={styles.connectionIcon}><MetaIcon size={16} /></span>
                      <div style={styles.connectionMeta}>
                        <div style={styles.connectionPlatform}>{meta.label}</div>
                        <div style={styles.connectionValue}>{c.label}</div>
                      </div>
                      <button type="button" style={styles.connectionRemoveBtn} onClick={() => removeConnection(i)}>×</button>
                    </div>
                  );
                })}
              </div>
            )}

            {addingConnection ? (
              <div style={styles.addConnectionForm}>
                <div style={styles.platformPickerRow}>
                  {PLATFORMS.map((p) => {
                    const PIcon = p.Icon;
                    const active = newConnPlatform === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setNewConnPlatform(p.id)}
                        style={{ ...styles.platformPickerBtn, ...(active ? styles.platformPickerBtnActive : {}) }}
                        title={p.label}
                      >
                        <PIcon size={16} />
                      </button>
                    );
                  })}
                </div>
                <div style={styles.hint}>{platformMeta(newConnPlatform).label}</div>
                <input
                  value={newConnValue}
                  onChange={(e) => setNewConnValue(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addConnection()}
                  style={styles.input}
                  placeholder={platformMeta(newConnPlatform).placeholder}
                  autoFocus
                />
                <div style={styles.addConnectionActions}>
                  <button type="button" style={styles.secondaryBtn} onClick={() => setAddingConnection(false)}>Cancelar</button>
                  <button type="button" style={styles.primaryBtnSm} onClick={addConnection} disabled={!newConnValue.trim()}>Adicionar</button>
                </div>
              </div>
            ) : (
              draft.connections.length < 6 && (
                <button type="button" style={styles.addConnectionBtn} onClick={() => setAddingConnection(true)}>
                  + Conectar uma conta
                </button>
              )
            )}
          </div>
        </div>

        <div style={styles.footer}>
          <button type="button" style={styles.secondaryBtn} onClick={onClose}>Cancelar</button>
          <button type="button" style={styles.primaryBtn} onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(6,10,14,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90, padding: 20,
  },
  card: {
    width: 460, maxWidth: '100%', maxHeight: '90vh', background: 'var(--bg-surface)',
    borderRadius: 'var(--radius-lg, 18px)', border: '1px solid var(--border)', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow-lg)', position: 'relative',
  },
  closeBtn: {
    position: 'absolute', top: 10, right: 10, zIndex: 5, width: 30, height: 30, borderRadius: '50%',
    border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 18, cursor: 'pointer', lineHeight: 1,
  },
  hero: { position: 'relative', flexShrink: 0 },
  banner: { height: 128, position: 'relative' },
  bannerEditBtn: {
    position: 'absolute', bottom: 10, right: 10, width: 32, height: 32, borderRadius: '50%',
    background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 14, cursor: 'pointer',
  },
  bannerRemoveBtn: {
    position: 'absolute', bottom: 10, right: 50, width: 32, height: 32, borderRadius: '50%', border: 'none',
    background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontSize: 13, cursor: 'pointer',
  },
  hiddenInput: { display: 'none' },
  avatarWrap: { position: 'absolute', left: 20, bottom: -34 },
  avatarImg: { width: 84, height: 84, borderRadius: '50%', objectFit: 'cover', border: '4px solid var(--bg-surface)', display: 'block' },
  avatarFallback: {
    width: 84, height: 84, borderRadius: '50%', border: '4px solid var(--bg-surface)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 26,
  },
  avatarEditBtn: {
    position: 'absolute', right: -2, bottom: 2, width: 28, height: 28, borderRadius: '50%',
    background: 'var(--bg-hover)', border: '3px solid var(--bg-surface)', color: 'var(--text-hi)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, cursor: 'pointer',
  },
  errorBanner: { margin: '44px 20px 0', fontSize: 11.5, color: 'var(--danger)' },
  body: { padding: '46px 22px 4px', overflowY: 'auto', flex: 1, minHeight: 0 },
  section: { display: 'flex', flexDirection: 'column', gap: 14 },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 },
  sectionIcon: { fontSize: 15 },
  sectionTitle: { fontSize: 13.5, fontWeight: 700, color: 'var(--text-hi)' },
  divider: { height: 1, background: 'var(--border)', margin: '20px 0' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 11, fontWeight: 700, color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: 0.4 },
  input: {
    width: '100%', boxSizing: 'border-box', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: '10px 12px', color: 'var(--text-hi)', fontSize: 13.5,
  },
  textarea: {
    width: '100%', boxSizing: 'border-box', background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: '10px 12px', color: 'var(--text-hi)', fontSize: 13.5,
    fontFamily: 'inherit', resize: 'vertical',
  },
  charCount: { fontSize: 10.5, color: 'var(--text-low)', textAlign: 'right' },
  colorRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  colorSwatch: {
    width: 26, height: 26, borderRadius: '50%', border: '2px solid transparent', cursor: 'pointer',
    color: 'var(--accent-contrast)', fontWeight: 900, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  colorSwatchActive: { border: '2px solid #fff', boxShadow: '0 0 0 1px rgba(255,255,255,0.3)' },
  colorPicker: { width: 28, height: 26, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer' },
  hint: { fontSize: 11.5, color: 'var(--text-low)', lineHeight: 1.5 },
  errorText: { fontSize: 11.5, color: 'var(--danger)' },
  spotifyCard: {
    display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: 10,
  },
  spotifyArt: { width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0 },
  spotifyMeta: { flex: 1, minWidth: 0 },
  spotifyTitle: { fontSize: 12.5, fontWeight: 700, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  spotifyBrand: { fontSize: 10.5, color: '#1DB954', fontWeight: 700 },
  smallGhostBtn: {
    background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-hi)', borderRadius: 'var(--radius-sm)',
    padding: '6px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
  },
  connectionList: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 },
  connectionChip: {
    display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: '8px 10px',
  },
  connectionIcon: { width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: 'var(--text-mid)' },
  connectionMeta: { flex: 1, minWidth: 0 },
  connectionPlatform: { fontSize: 10.5, color: 'var(--text-low)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 },
  connectionValue: { fontSize: 12.5, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  connectionRemoveBtn: { width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--text-low)', fontSize: 15, cursor: 'pointer', flexShrink: 0 },
  addConnectionBtn: {
    width: '100%', background: 'var(--bg-elevated)', border: '1px dashed var(--border)', color: 'var(--text-mid)',
    borderRadius: 'var(--radius-sm)', padding: '10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  },
  addConnectionForm: { display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 10 },
  platformPickerRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  platformPickerBtn: {
    width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--bg-surface)',
    color: 'var(--text-mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  platformPickerBtnActive: { border: '1px solid var(--accent)', color: 'var(--accent)', background: 'rgba(22,199,179,0.1)' },
  addConnectionActions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  primaryBtnSm: {
    border: 'none', background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))', color: '#fff',
    fontWeight: 700, padding: '7px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
  },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '14px 22px', borderTop: '1px solid var(--border)', flexShrink: 0,
  },
  secondaryBtn: { border: '1px solid var(--border)', background: 'rgba(255,255,255,0.02)', color: 'var(--text-mid)', padding: '9px 14px', borderRadius: 10, cursor: 'pointer', fontSize: 13 },
  primaryBtn: {
    border: 'none', background: 'linear-gradient(135deg, var(--accent), var(--accent-secondary))', color: '#fff',
    fontWeight: 700, padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13,
    boxShadow: '0 12px 28px rgba(22,199,179,0.3)',
  },
};
