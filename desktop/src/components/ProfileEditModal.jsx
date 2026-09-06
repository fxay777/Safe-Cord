import React, { useEffect, useState } from 'react';
import { resolveAssetUrl } from '../api';
import {
  CameraIcon, MusicIcon, LinkIcon, TrashIcon, CheckIcon,
  GameControllerIcon, GithubIcon, DiceIcon, TwitchIcon,
  PlayCircleIcon, CameraSquareIcon, TikTokIcon, GlobeIcon,
} from './Icons';
import { SpotifyMiniCard } from './UserProfilePopup';

function XLogoIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" {...props}>
      <path d="M4 4l16 16M20 4 4 20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
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

function emptyDraft(user) {
  return {
    display_name: user?.display_name || '',
    bio: user?.bio || '',
    avatar_color: user?.avatar_color || null,
    spotify_track: user?.spotify_track || null,
    connections: user?.connections ? [...user.connections] : [],
  };
}

export default function ProfileEditModal({ open, user, api, onClose, onSaveProfile, onUploadProfileImage, onRemoveProfileImage, themeAccent = '#38BDF8' }) {
  const [draft, setDraft] = useState(() => ({ ...emptyDraft(user), avatar_color: user?.avatar_color || themeAccent }));
  const [localPreview, setLocalPreview] = useState({ avatar: null, banner: null });
  const [uploading, setUploading] = useState({ avatar: false, banner: false });
  const [imageError, setImageError] = useState({ avatar: '', banner: '' });
  const [musicQuery, setMusicQuery] = useState('');
  const [musicResults, setMusicResults] = useState([]);
  const [musicSearching, setMusicSearching] = useState(false);
  const [musicError, setMusicError] = useState('');
  const [musicConfigured, setMusicConfigured] = useState(true);
  const [addingConnection, setAddingConnection] = useState(false);
  const [newConnPlatform, setNewConnPlatform] = useState('discord');
  const [newConnValue, setNewConnValue] = useState('');
  const [saving, setSaving] = useState(false);

  const avatarUrl = resolveAssetUrl(user?.avatar_url);
  const bannerUrl = resolveAssetUrl(user?.banner_url);
  const initials = (draft.display_name || user?.username || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  useEffect(() => {
    if (open) {
      setDraft({ ...emptyDraft(user), avatar_color: user?.avatar_color || themeAccent });
      setAddingConnection(false);
      setMusicQuery('');
      setMusicResults([]);
    }
  }, [open, user]);

  useEffect(() => {
    if (!open || !api) return;
    api.get('/spotify/status').then(({ data }) => setMusicConfigured(data.configured)).catch(() => setMusicConfigured(false));
  }, [open, api]);

  useEffect(() => {
    if (!musicQuery.trim() || !api) {
      setMusicResults([]);
      return;
    }
    setMusicSearching(true);
    setMusicError('');
    const timer = setTimeout(() => {
      api.get('/spotify/search', { params: { q: musicQuery.trim() } })
        .then(({ data }) => setMusicResults(data.tracks || []))
        .catch((err) => setMusicError(err?.response?.data?.error || 'Não foi possível buscar agora.'))
        .finally(() => setMusicSearching(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [musicQuery, api]);

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

        {/* HERO: banner + avatar */}
        <div style={styles.hero}>
          <div
            style={{
              ...styles.banner,
              ...(shownBanner
                ? { backgroundImage: `url(${shownBanner})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                : { background: `linear-gradient(135deg, ${draft.avatar_color}, #0284c7)` }),
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

          {/* MÚSICA (Spotify) */}
          <div style={styles.section}>
            <div style={styles.sectionHeader}>
              <span style={styles.sectionIcon}><MusicIcon size={15} /></span>
              <span style={styles.sectionTitle}>Música do perfil</span>
            </div>

            {!musicConfigured ? (
              <div style={styles.hint}>
                Busca do Spotify não configurada neste servidor. Peça ao administrador para adicionar as credenciais no arquivo <code>.env</code>.
              </div>
            ) : (
              <>
                {draft.spotify_track ? (
                  <div style={styles.selectedTrackWrap}>
                    <SpotifyMiniCard track={draft.spotify_track} />
                    <button type="button" style={styles.smallGhostBtn} onClick={() => setDraft((prev) => ({ ...prev, spotify_track: null }))}>
                      Remover
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={musicQuery}
                      onChange={(e) => setMusicQuery(e.target.value)}
                      style={styles.input}
                      placeholder="Buscar uma música ou artista…"
                    />
                    {musicSearching && <div style={styles.hint}>Buscando…</div>}
                    {musicError && <div style={styles.errorText}>{musicError}</div>}
                    {musicResults.length > 0 && (
                      <div style={styles.musicResultsList}>
                        {musicResults.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            style={styles.musicResultRow}
                            onClick={() => { setDraft((prev) => ({ ...prev, spotify_track: t })); setMusicQuery(''); setMusicResults([]); }}
                          >
                            {t.image && <img src={t.image} alt="" style={styles.musicResultArt} />}
                            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                              <div style={styles.musicResultTitle}>{t.name}</div>
                              <div style={styles.musicResultArtist}>{t.artists}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <div style={styles.divider} />

          {/* CONTAS CONECTADAS */}
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
    position: 'fixed', inset: 0, background: 'rgba(5, 10, 18, 0.75)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90, padding: 20,
  },
  card: {
    width: 480, maxWidth: '100%', maxHeight: '90vh', background: '#0b1320',
    borderRadius: '16px', border: '1px solid rgba(56, 189, 248, 0.2)', overflow: 'hidden',
    display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.7)', position: 'relative',
    color: '#f8fafc', fontFamily: 'inherit',
  },
  closeBtn: {
    position: 'absolute', top: 12, right: 12, zIndex: 5, width: 32, height: 32, borderRadius: '50%',
    border: '1px solid rgba(56, 189, 248, 0.2)', background: 'rgba(11, 19, 32, 0.7)', color: '#f8fafc',
    fontSize: 18, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
    transition: 'all 0.2s',
  },
  hero: { position: 'relative', flexShrink: 0 },
  banner: { height: 136, position: 'relative', borderBottom: '1px solid rgba(56, 189, 248, 0.15)' },
  bannerEditBtn: {
    position: 'absolute', bottom: 12, right: 12, width: 34, height: 34, borderRadius: '50%',
    background: 'rgba(11, 19, 32, 0.85)', border: '1px solid rgba(56, 189, 248, 0.3)', color: '#38bdf8',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  },
  bannerRemoveBtn: {
    position: 'absolute', bottom: 12, right: 54, width: 34, height: 34, borderRadius: '50%',
    border: '1px solid rgba(248, 113, 113, 0.3)', background: 'rgba(11, 19, 32, 0.85)', color: '#f87171',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, cursor: 'pointer',
    boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
  },
  hiddenInput: { display: 'none' },
  avatarWrap: { position: 'absolute', left: 22, bottom: -38 },
  avatarImg: { width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', border: '4px solid #0b1320', display: 'block', boxShadow: '0 6px 16px rgba(0,0,0,0.5)' },
  avatarFallback: {
    width: 88, height: 88, borderRadius: '50%', border: '4px solid #0b1320', display: 'flex',
    alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 28,
    boxShadow: '0 6px 16px rgba(0,0,0,0.5)',
  },
  avatarEditBtn: {
    position: 'absolute', right: -2, bottom: 2, width: 30, height: 30, borderRadius: '50%',
    background: '#121d31', border: '3px solid #0b1320', color: '#38bdf8',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, cursor: 'pointer',
    boxShadow: '0 4px 10px rgba(0,0,0,0.4)',
  },
  errorBanner: { margin: '48px 22px 0', fontSize: 12, color: '#f87171', background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.3)', padding: '8px 12px', borderRadius: 8 },
  body: { padding: '50px 24px 16px', overflowY: 'auto', flex: 1, minHeight: 0 },
  section: { display: 'flex', flexDirection: 'column', gap: 14 },
  sectionHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 },
  sectionIcon: { color: '#38bdf8', display: 'flex', alignItems: 'center' },
  sectionTitle: { fontSize: 13.5, fontWeight: 700, color: '#f8fafc', letterSpacing: '0.3px' },
  divider: { height: 1, background: 'rgba(56, 189, 248, 0.1)', margin: '20px 0' },
  fieldGroup: { display: 'flex', flexDirection: 'column', gap: 6 },
  label: { fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: 0.6 },
  input: {
    width: '100%', boxSizing: 'border-box', background: '#111b2d', border: '1px solid rgba(56, 189, 248, 0.2)',
    borderRadius: 10, padding: '10px 14px', color: '#f8fafc', fontSize: 13.5, outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  textarea: {
    width: '100%', boxSizing: 'border-box', background: '#111b2d', border: '1px solid rgba(56, 189, 248, 0.2)',
    borderRadius: 10, padding: '10px 14px', color: '#f8fafc', fontSize: 13.5,
    fontFamily: 'inherit', resize: 'vertical', outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s',
  },
  charCount: { fontSize: 11, color: '#64748b', textAlign: 'right' },
  colorRow: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  colorSwatch: {
    width: 28, height: 28, borderRadius: '50%', border: '2px solid transparent', cursor: 'pointer',
    color: '#fff', fontWeight: 900, fontSize: 12, display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'transform 0.15s',
  },
  colorSwatchActive: { border: '2px solid #fff', boxShadow: '0 0 0 2px rgba(56, 189, 248, 0.5)', transform: 'scale(1.1)' },
  colorPicker: { width: 30, height: 28, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', borderRadius: '50%' },
  hint: { fontSize: 12, color: '#94a3b8', lineHeight: 1.5 },
  errorText: { fontSize: 12, color: '#f87171' },
  selectedTrackWrap: { display: 'flex', alignItems: 'center', gap: 10, background: '#111b2d', padding: 8, borderRadius: 10, border: '1px solid rgba(56, 189, 248, 0.2)' },
  musicResultsList: {
    display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4, maxHeight: 220, overflowY: 'auto',
    border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: 10, padding: 6, background: '#111b2d',
  },
  musicResultRow: {
    display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none',
    borderRadius: 8, padding: 8, cursor: 'pointer', width: '100%', textAlign: 'left',
    transition: 'background 0.15s',
  },
  musicResultArt: { width: 36, height: 36, borderRadius: 8, objectFit: 'cover', flexShrink: 0 },
  musicResultTitle: { fontSize: 13, fontWeight: 700, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  musicResultArtist: { fontSize: 11.5, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  smallGhostBtn: {
    background: 'rgba(248, 113, 113, 0.1)', border: '1px solid rgba(248, 113, 113, 0.3)', color: '#f87171', borderRadius: 8,
    padding: '7px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
  },
  connectionList: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 },
  connectionChip: {
    display: 'flex', alignItems: 'center', gap: 12, background: '#111b2d', border: '1px solid rgba(56, 189, 248, 0.2)',
    borderRadius: 10, padding: '10px 14px',
  },
  connectionIcon: { width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, color: '#38bdf8' },
  connectionMeta: { flex: 1, minWidth: 0 },
  connectionPlatform: { fontSize: 10.5, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 },
  connectionValue: { fontSize: 13, color: '#f8fafc', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  connectionRemoveBtn: { width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 18, cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  addConnectionBtn: {
    width: '100%', background: '#111b2d', border: '1px dashed rgba(56, 189, 248, 0.35)', color: '#38bdf8',
    borderRadius: 10, padding: '12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
    transition: 'background 0.2s',
  },
  addConnectionForm: { display: 'flex', flexDirection: 'column', gap: 10, background: '#111b2d', border: '1px solid rgba(56, 189, 248, 0.2)', borderRadius: 10, padding: 12 },
  platformPickerRow: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  platformPickerBtn: {
    width: 36, height: 36, borderRadius: 10, border: '1px solid rgba(56, 189, 248, 0.2)', background: '#0b1320',
    color: '#94a3b8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.15s',
  },
  platformPickerBtnActive: { border: '1px solid #38bdf8', color: '#38bdf8', background: 'rgba(56, 189, 248, 0.15)' },
  addConnectionActions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  primaryBtnSm: {
    border: 'none', background: 'linear-gradient(135deg, #38bdf8, #0284c7)', color: '#0b1320',
    fontWeight: 700, padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5,
  },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 12, padding: '16px 24px', borderTop: '1px solid rgba(56, 189, 248, 0.15)', flexShrink: 0, background: '#080e18',
  },
  secondaryBtn: { 
    border: '1px solid rgba(56, 189, 248, 0.25)', background: 'transparent', color: '#94a3b8', 
    padding: '9px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13, transition: 'color 0.2s' 
  },
  primaryBtn: {
    border: 'none', background: 'linear-gradient(135deg, #38bdf8, #0284c7)', color: '#0b1320',
    fontWeight: 700, padding: '9px 18px', borderRadius: 10, cursor: 'pointer', fontSize: 13.5,
    boxShadow: '0 6px 20px rgba(56, 189, 248, 0.35)', transition: 'transform 0.15s, box-shadow 0.15s',
  },
};