import React, { useEffect, useMemo, useState } from 'react';
import { resolveAssetUrl } from '../api';
import {
  CameraIcon, MusicIcon, LinkIcon, TrashIcon, CheckIcon, CloseIcon, UserIcon, SearchIcon, PaletteIcon,
} from './Icons';
import { SpotifyMiniCard } from './UserProfilePopup';
import { PLATFORMS, platformMeta } from './profilePlatforms';
import ProfileCard from './ProfileCard';

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'];
const NAME_MAX = 40;
const BIO_MAX = 220;
const MAX_CONNECTIONS = 6;
const PRONOUNS_MAX = 24;
const STATUS_MAX = 80;
const PRONOUN_SUGGESTIONS = ['ele/dele', 'ela/dela', 'elu/delu', 'qualquer pronome'];

// Temas prontos do cartão de perfil (degradê de cima para baixo)
const THEME_PRESETS = [
  { name: 'Céu', primary: '#7CC4FF', secondary: '#1E7BFF' },
  { name: 'Aurora', primary: '#4CD6A0', secondary: '#5B8CFF' },
  { name: 'Pôr do sol', primary: '#FFC857', secondary: '#FF7EB6' },
  { name: 'Uva', primary: '#B794FF', secondary: '#5B3FD6' },
  { name: 'Brasa', primary: '#FF8A65', secondary: '#C2185B' },
  { name: 'Menta', primary: '#A8F0D8', secondary: '#2EC4C4' },
  { name: 'Noite', primary: '#3B4A6B', secondary: '#0E1424' },
  { name: 'Algodão', primary: '#FFD6E8', secondary: '#C9E4FF' },
];

// Paleta do perfil: tons que combinam com o azul claro do app, mais algumas cores vivas
const PROFILE_COLORS = [
  '#3A9BFF', '#7CC4FF', '#A9D8FF', '#5B8CFF', '#8B7CFF',
  '#FF7EB6', '#FF8A65', '#FFC857', '#4CD6A0', '#2EC4C4',
];


const TABS = [
  { id: 'perfil', label: 'Perfil', Icon: UserIcon },
  { id: 'musica', label: 'Música', Icon: MusicIcon },
  { id: 'tema', label: 'Tema', Icon: PaletteIcon },
  { id: 'conexoes', label: 'Conexões', Icon: LinkIcon },
];


function draftFrom(user, fallbackColor) {
  return {
    display_name: user?.display_name || '',
    bio: user?.bio || '',
    avatar_color: user?.avatar_color || fallbackColor,
    spotify_track: user?.spotify_track || null,
    connections: user?.connections ? [...user.connections] : [],
    pronouns: user?.pronouns || '',
    status_text: user?.status_text || '',
    theme_primary: user?.theme_primary || null,
    theme_secondary: user?.theme_secondary || null,
  };
}

export default function ProfileEditModal({
  open, user, api, onClose, onSaveProfile, onUploadProfileImage, onRemoveProfileImage, themeAccent = '#3A9BFF',
}) {
  const [tab, setTab] = useState('perfil');
  const [draft, setDraft] = useState(() => draftFrom(user, themeAccent));
  const [localPreview, setLocalPreview] = useState({ avatar: null, banner: null });
  const [uploading, setUploading] = useState({ avatar: false, banner: false });
  const [imageError, setImageError] = useState('');
  const [musicQuery, setMusicQuery] = useState('');
  const [musicResults, setMusicResults] = useState([]);
  const [musicSearching, setMusicSearching] = useState(false);
  const [musicError, setMusicError] = useState('');
  const [musicConfigured, setMusicConfigured] = useState(true);
  const [newConnPlatform, setNewConnPlatform] = useState(null);
  const [newConnValue, setNewConnValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    if (open) {
      setDraft(draftFrom(user, themeAccent));
      setTab('perfil');
      setNewConnPlatform(null);
      setNewConnValue('');
      setMusicQuery('');
      setMusicResults([]);
      setImageError('');
      setSaveError('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || !api) return;
    api.get('/spotify/status').then(({ data }) => setMusicConfigured(data.configured)).catch(() => setMusicConfigured(false));
  }, [open, api]);

  useEffect(() => {
    if (!musicQuery.trim() || !api) {
      setMusicResults([]);
      return undefined;
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

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const original = useMemo(() => draftFrom(user, themeAccent), [user, themeAccent]);
  const dirty = JSON.stringify(original) !== JSON.stringify(draft);

  if (!open) return null;

  const avatarUrl = resolveAssetUrl(user?.avatar_url);
  const bannerUrl = resolveAssetUrl(user?.banner_url);
  const shownAvatar = localPreview.avatar || avatarUrl;
  const shownBanner = localPreview.banner || bannerUrl;
  const shownName = draft.display_name.trim() || user?.username || 'Você';
  const initials = shownName.split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  async function handleImageSelect(kind, event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      setImageError('Formato não suportado. Use PNG, JPG, WEBP ou GIF.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setImageError('Imagem muito grande (máx. 8MB).');
      return;
    }
    setImageError('');
    const localUrl = URL.createObjectURL(file);
    setLocalPreview((prev) => ({ ...prev, [kind]: localUrl }));
    setUploading((prev) => ({ ...prev, [kind]: true }));
    try {
      await onUploadProfileImage(kind, file);
    } catch (err) {
      setImageError(err?.response?.data?.error || 'Falha ao enviar a imagem');
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
      setImageError('Falha ao remover a imagem');
    }
  }

  function addConnection() {
    const value = newConnValue.trim();
    if (!value || !newConnPlatform) return;
    setDraft((prev) => ({
      ...prev,
      connections: [...prev.connections, { platform: newConnPlatform, label: value, url: value }],
    }));
    setNewConnValue('');
    setNewConnPlatform(null);
  }

  function removeConnection(index) {
    setDraft((prev) => ({ ...prev, connections: prev.connections.filter((_, i) => i !== index) }));
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    try {
      await onSaveProfile({
        display_name: draft.display_name,
        bio: draft.bio,
        avatar_color: draft.avatar_color,
        spotify_track: draft.spotify_track,
        connections: draft.connections,
        pronouns: draft.pronouns.trim(),
        status_text: draft.status_text.trim(),
        theme_primary: draft.theme_primary,
        theme_secondary: draft.theme_secondary,
      });
      onClose();
    } catch (err) {
      setSaveError(err?.response?.data?.error || 'Não foi possível salvar. Tente de novo.');
    } finally {
      setSaving(false);
    }
  }

  const previewUser = {
    ...user,
    ...draft,
    display_name: shownName,
    avatar_url: shownAvatar,
    banner_url: shownBanner,
    status_mode: user?.status_mode === 'invisible' ? 'invisible' : (user?.status_mode || 'online'),
  };

  const bannerStyle = shownBanner
    ? { backgroundImage: `url(${shownBanner})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    : { background: `linear-gradient(135deg, ${draft.avatar_color}, var(--accent-secondary))` };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        {/* ── COLUNA DO FORMULÁRIO ─────────────────────────── */}
        <div style={styles.formCol}>
          <div style={styles.header}>
            <h2 style={styles.title}>Editar perfil</h2>
            <div style={styles.subtitle}>É assim que a galera te vê no SafeCord</div>
          </div>

          <div style={styles.tabs}>
            {TABS.map((t) => {
              const active = tab === t.id;
              return (
                <button key={t.id} type="button" onClick={() => setTab(t.id)} style={{ ...styles.tab, ...(active ? styles.tabActive : {}) }}>
                  <t.Icon size={14} /> {t.label}
                  {t.id === 'conexoes' && draft.connections.length > 0 && <span style={styles.tabCount}>{draft.connections.length}</span>}
                </button>
              );
            })}
          </div>

          <div style={styles.formBody}>
            {tab === 'perfil' && (
              <>
                <Section title="Imagens">
                  <div style={styles.imageRow}>
                    <div style={styles.imageTile}>
                      <div style={styles.avatarTilePreview}>
                        {shownAvatar ? (
                          <img src={shownAvatar} alt="" style={{ ...styles.avatarTileImg, opacity: uploading.avatar ? 0.5 : 1 }} />
                        ) : (
                          <div style={{ ...styles.avatarTileImg, ...styles.initials, background: draft.avatar_color }}>{initials}</div>
                        )}
                      </div>
                      <div style={styles.imageTileMeta}>
                        <div style={styles.imageTileTitle}>Foto de perfil</div>
                        <div style={styles.imageTileHint}>Quadrada, até 8MB. GIF funciona.</div>
                        <div style={styles.imageTileActions}>
                          <label style={styles.pillBtnPrimary}>
                            <CameraIcon size={13} /> {uploading.avatar ? 'Enviando…' : 'Trocar'}
                            <input type="file" accept="image/*" style={styles.hiddenInput} onChange={(e) => handleImageSelect('avatar', e)} disabled={uploading.avatar} />
                          </label>
                          {avatarUrl && !uploading.avatar && (
                            <button type="button" style={styles.pillBtnGhost} onClick={() => handleRemoveImage('avatar')}>Remover</button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div style={styles.imageTile}>
                      <div style={{ ...styles.bannerTilePreview, ...bannerStyle, opacity: uploading.banner ? 0.5 : 1 }} />
                      <div style={styles.imageTileMeta}>
                        <div style={styles.imageTileTitle}>Banner</div>
                        <div style={styles.imageTileHint}>Sem banner, usamos um degradê da sua cor.</div>
                        <div style={styles.imageTileActions}>
                          <label style={styles.pillBtnPrimary}>
                            <CameraIcon size={13} /> {uploading.banner ? 'Enviando…' : 'Trocar'}
                            <input type="file" accept="image/*" style={styles.hiddenInput} onChange={(e) => handleImageSelect('banner', e)} disabled={uploading.banner} />
                          </label>
                          {bannerUrl && !uploading.banner && (
                            <button type="button" style={styles.pillBtnGhost} onClick={() => handleRemoveImage('banner')}>Remover</button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                  {imageError && <div style={styles.errorBox}>{imageError}</div>}
                </Section>

                <div style={styles.twoCol}>
                  <Section title="Nome de exibição" counter={`${draft.display_name.length}/${NAME_MAX}`}>
                    <input
                      value={draft.display_name}
                      onChange={(e) => setDraft((prev) => ({ ...prev, display_name: e.target.value }))}
                      style={styles.input}
                      placeholder={user?.username || 'Seu nome'}
                      maxLength={NAME_MAX}
                    />
                  </Section>
                  <Section title="Pronomes" counter={`${draft.pronouns.length}/${PRONOUNS_MAX}`}>
                    <input
                      value={draft.pronouns}
                      onChange={(e) => setDraft((prev) => ({ ...prev, pronouns: e.target.value }))}
                      style={styles.input}
                      placeholder="ex.: ele/dele"
                      maxLength={PRONOUNS_MAX}
                      list="sc-pronoun-suggestions"
                    />
                    <datalist id="sc-pronoun-suggestions">
                      {PRONOUN_SUGGESTIONS.map((p) => <option key={p} value={p} />)}
                    </datalist>
                  </Section>
                </div>

                <Section title="Recado" hint="Uma frase curta que aparece no seu cartão e embaixo do seu nome na lista de membros." counter={`${draft.status_text.length}/${STATUS_MAX}`}>
                  <div style={styles.statusField}>
                    <input
                      value={draft.status_text}
                      onChange={(e) => setDraft((prev) => ({ ...prev, status_text: e.target.value }))}
                      style={{ ...styles.input, paddingRight: 40 }}
                      placeholder="No que você está pensando?"
                      maxLength={STATUS_MAX}
                    />
                    {draft.status_text && (
                      <button type="button" style={styles.clearInputBtn} title="Limpar" onClick={() => setDraft((prev) => ({ ...prev, status_text: '' }))}>
                        <CloseIcon size={12} />
                      </button>
                    )}
                  </div>
                </Section>

                <Section title="Sobre mim" counter={`${draft.bio.length}/${BIO_MAX}`}>
                  <textarea
                    value={draft.bio}
                    onChange={(e) => setDraft((prev) => ({ ...prev, bio: e.target.value }))}
                    style={styles.textarea}
                    rows={3}
                    maxLength={BIO_MAX}
                    placeholder="Conte um pouco sobre você, seus jogos, o que curte…"
                  />
                </Section>

                <Section title="Cor do perfil">
                  <div style={styles.colorRow}>
                    {PROFILE_COLORS.map((color) => {
                      const active = draft.avatar_color?.toLowerCase() === color.toLowerCase();
                      return (
                        <button
                          key={color}
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, avatar_color: color }))}
                          style={{ ...styles.swatch, background: color, ...(active ? styles.swatchActive : {}) }}
                          title={color}
                        >
                          {active && <CheckIcon size={13} />}
                        </button>
                      );
                    })}
                    <label style={styles.customSwatch} title="Escolher outra cor">
                      <span style={{ ...styles.customSwatchDot, background: draft.avatar_color }} />
                      <input
                        type="color"
                        value={draft.avatar_color || '#3A9BFF'}
                        onChange={(e) => setDraft((prev) => ({ ...prev, avatar_color: e.target.value }))}
                        style={styles.hiddenColorInput}
                      />
                    </label>
                  </div>
                </Section>
              </>
            )}

            {tab === 'musica' && (
              <Section title="Música do perfil" hint="Aparece no seu perfil com prévia de 30 segundos.">
                {!musicConfigured ? (
                  <div style={styles.emptyCard}>
                    <span style={styles.emptyIcon}><MusicIcon size={20} /></span>
                    <div>
                      <div style={styles.emptyTitle}>Busca do Spotify desativada</div>
                      <div style={styles.emptyText}>
                        O servidor precisa das credenciais <code style={styles.code}>SPOTIFY_CLIENT_ID</code> e <code style={styles.code}>SPOTIFY_CLIENT_SECRET</code> no <code style={styles.code}>.env</code>.
                      </div>
                    </div>
                  </div>
                ) : draft.spotify_track ? (
                  <div style={styles.trackSelected}>
                    <div style={{ flex: 1, minWidth: 0 }}><SpotifyMiniCard track={draft.spotify_track} /></div>
                    <button type="button" style={styles.pillBtnGhost} onClick={() => setDraft((prev) => ({ ...prev, spotify_track: null }))}>
                      Trocar
                    </button>
                  </div>
                ) : (
                  <>
                    <div style={styles.searchField}>
                      <SearchIcon size={15} style={{ color: 'var(--text-low)', flexShrink: 0 }} />
                      <input
                        value={musicQuery}
                        onChange={(e) => setMusicQuery(e.target.value)}
                        style={styles.searchInput}
                        placeholder="Buscar música ou artista…"
                        autoFocus
                      />
                    </div>
                    {musicSearching && <div style={styles.hint}>Buscando…</div>}
                    {musicError && <div style={styles.errorBox}>{musicError}</div>}
                    {musicResults.length > 0 && (
                      <div style={styles.trackList}>
                        {musicResults.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            style={styles.trackRow}
                            onClick={() => { setDraft((prev) => ({ ...prev, spotify_track: t })); setMusicQuery(''); setMusicResults([]); }}
                          >
                            {t.image
                              ? <img src={t.image} alt="" style={styles.trackArt} />
                              : <span style={{ ...styles.trackArt, ...styles.trackArtEmpty }}><MusicIcon size={14} /></span>}
                            <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                              <div style={styles.trackTitle}>{t.name}</div>
                              <div style={styles.trackArtist}>{t.artists}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                    {!musicQuery && <div style={styles.hint}>Escolha uma música que combine com você.</div>}
                  </>
                )}
              </Section>
            )}

            {tab === 'tema' && (
              <>
                <Section title="Tema do perfil" hint="Pinta o seu cartão inteiro com um degradê. Todo mundo que abrir seu perfil vê.">
                  <div style={styles.themeGrid}>
                    <button
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, theme_primary: null, theme_secondary: null }))}
                      style={{ ...styles.themeTile, ...(!draft.theme_primary && !draft.theme_secondary ? styles.themeTileActive : {}) }}
                    >
                      <span style={{ ...styles.themeSwatch, background: 'var(--bg-elevated)', border: '1px dashed var(--border-strong, var(--border))' }} />
                      <span style={styles.themeName}>Sem tema</span>
                    </button>
                    {THEME_PRESETS.map((t) => {
                      const active = draft.theme_primary?.toLowerCase() === t.primary.toLowerCase()
                        && draft.theme_secondary?.toLowerCase() === t.secondary.toLowerCase();
                      return (
                        <button
                          key={t.name}
                          type="button"
                          onClick={() => setDraft((prev) => ({ ...prev, theme_primary: t.primary, theme_secondary: t.secondary }))}
                          style={{ ...styles.themeTile, ...(active ? styles.themeTileActive : {}) }}
                        >
                          <span style={{ ...styles.themeSwatch, background: `linear-gradient(180deg, ${t.primary}, ${t.secondary})` }}>
                            {active && <CheckIcon size={14} style={{ color: '#fff' }} />}
                          </span>
                          <span style={styles.themeName}>{t.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </Section>

                <Section title="Personalizado" hint="Escolha as duas cores do degradê.">
                  <div style={styles.twoCol}>
                    {[['theme_primary', 'Cor de cima'], ['theme_secondary', 'Cor de baixo']].map(([key, label]) => (
                      <label key={key} style={styles.colorPick}>
                        <span style={{ ...styles.colorPickDot, background: draft[key] || 'var(--bg-elevated)' }} />
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={styles.colorPickLabel}>{label}</span>
                          <span style={styles.colorPickValue}>{draft[key] ? draft[key].toUpperCase() : 'Nenhuma'}</span>
                        </span>
                        <input
                          type="color"
                          value={draft[key] || draft.theme_primary || draft.theme_secondary || '#3A9BFF'}
                          onChange={(e) => setDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                          style={styles.hiddenColorInput}
                        />
                      </label>
                    ))}
                  </div>
                </Section>
              </>
            )}

            {tab === 'conexoes' && (
              <>
                <Section title="Adicionar conta" hint={`Até ${MAX_CONNECTIONS} contas aparecem no seu perfil.`}>
                  <div style={styles.platformGrid}>
                    {PLATFORMS.map((p) => {
                      const active = newConnPlatform === p.id;
                      const full = draft.connections.length >= MAX_CONNECTIONS;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          disabled={full}
                          onClick={() => { setNewConnPlatform(active ? null : p.id); setNewConnValue(''); }}
                          style={{ ...styles.platformTile, ...(active ? styles.platformTileActive : {}), opacity: full ? 0.45 : 1 }}
                        >
                          <span style={{ ...styles.platformIcon, color: p.color, background: `${p.color}1F` }}><p.Icon size={16} /></span>
                          <span style={styles.platformLabel}>{p.label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {newConnPlatform && (
                    <div style={styles.addRow}>
                      <input
                        value={newConnValue}
                        onChange={(e) => setNewConnValue(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && addConnection()}
                        style={{ ...styles.input, flex: 1 }}
                        placeholder={`${platformMeta(newConnPlatform).label}: ${platformMeta(newConnPlatform).placeholder}`}
                        autoFocus
                      />
                      <button type="button" style={styles.pillBtnPrimary} onClick={addConnection} disabled={!newConnValue.trim()}>
                        Adicionar
                      </button>
                    </div>
                  )}
                </Section>

                <Section title="Suas contas">
                  {draft.connections.length === 0 ? (
                    <div style={styles.hint}>Nenhuma conta conectada ainda.</div>
                  ) : (
                    <div style={styles.connList}>
                      {draft.connections.map((c, i) => {
                        const meta = platformMeta(c.platform);
                        return (
                          <div key={`${c.platform}-${i}`} style={styles.connRow}>
                            <span style={{ ...styles.platformIcon, color: meta.color, background: `${meta.color}1F` }}><meta.Icon size={16} /></span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={styles.connPlatform}>{meta.label}</div>
                              <div style={styles.connValue}>{c.label}</div>
                            </div>
                            <button type="button" style={styles.iconBtn} onClick={() => removeConnection(i)} title="Remover">
                              <TrashIcon size={14} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </Section>
              </>
            )}
          </div>
        </div>

        {/* ── COLUNA DA PRÉVIA (atualiza enquanto você edita) ── */}
        <div style={styles.previewCol}>
          <div style={styles.previewHeader}>
            <span style={styles.previewLabel}>Prévia</span>
            <button type="button" style={styles.closeBtn} onClick={onClose} aria-label="Fechar"><CloseIcon size={16} /></button>
          </div>

          <ProfileCard user={previewUser} width="100%" />
          {!draft.bio && !draft.spotify_track && draft.connections.length === 0 && !draft.status_text && (
            <div style={styles.profileEmpty}>Adicione uma bio, um recado, música ou conexões pra deixar seu perfil com a sua cara.</div>
          )}
        </div>

        {/* ── BARRA DE ALTERAÇÕES NÃO SALVAS ───────────────── */}
        {(dirty || saveError) && (
          <div style={styles.saveBar}>
            <span style={styles.saveBarText}>{saveError || 'Cuidado — você tem alterações não salvas!'}</span>
            <button type="button" style={styles.saveBarReset} onClick={() => setDraft(original)} disabled={saving}>Redefinir</button>
            <button type="button" style={styles.saveBarSave} onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando…' : 'Salvar alterações'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, hint, counter, children }) {
  return (
    <div style={styles.section}>
      <div style={styles.sectionHead}>
        <span style={styles.sectionTitle}>{title}</span>
        {counter && <span style={styles.counter}>{counter}</span>}
      </div>
      {hint && <div style={{ ...styles.hint, marginTop: -4 }}>{hint}</div>}
      {children}
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'var(--scrim)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 90, padding: 20,
  },
  card: {
    position: 'relative', width: 900, maxWidth: '100%', height: 640, maxHeight: '92vh',
    background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-xl)',
    boxShadow: 'var(--shadow-lg)', display: 'flex', overflow: 'hidden', color: 'var(--text-hi)',
  },

  // formulário
  formCol: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' },
  header: { padding: '24px 28px 14px' },
  title: { margin: 0, fontSize: 21, fontWeight: 700, letterSpacing: -0.3, color: 'var(--text-hi)' },
  subtitle: { fontSize: 13, color: 'var(--text-low)', marginTop: 3 },
  tabs: { display: 'flex', gap: 6, padding: '0 28px 14px', borderBottom: '1px solid var(--border)' },
  tab: {
    display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'transparent',
    color: 'var(--text-mid)', fontSize: 13.5, fontWeight: 600, padding: '8px 14px',
    borderRadius: 'var(--radius-pill)', cursor: 'pointer',
  },
  tabActive: { background: 'var(--accent-soft)', color: 'var(--text-hi)' },
  tabCount: {
    minWidth: 18, height: 18, borderRadius: 9, background: 'var(--accent)', color: 'var(--accent-contrast)',
    fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px',
  },
  formBody: { flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 28px 90px', display: 'flex', flexDirection: 'column', gap: 22 },

  section: { display: 'flex', flexDirection: 'column', gap: 10 },
  sectionHead: { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 13.5, fontWeight: 650, color: 'var(--text-hi)' },
  counter: { fontSize: 11.5, color: 'var(--text-low)', fontVariantNumeric: 'tabular-nums' },
  hint: { fontSize: 12.5, color: 'var(--text-low)', lineHeight: 1.5 },

  imageRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 },
  imageTile: {
    background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 20, padding: 12,
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  avatarTilePreview: { height: 72, display: 'flex', alignItems: 'center' },
  avatarTileImg: { width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', display: 'block' },
  bannerTilePreview: { height: 72, borderRadius: 14 },
  imageTileMeta: { display: 'flex', flexDirection: 'column', gap: 3 },
  imageTileTitle: { fontSize: 13.5, fontWeight: 650, color: 'var(--text-hi)' },
  imageTileHint: { fontSize: 11.5, color: 'var(--text-low)', lineHeight: 1.4 },
  imageTileActions: { display: 'flex', gap: 6, marginTop: 8 },
  initials: { display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--on-color)', fontWeight: 700, fontSize: 22 },
  hiddenInput: { display: 'none' },

  pillBtnPrimary: {
    display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'var(--accent)',
    color: 'var(--accent-contrast)', fontWeight: 650, fontSize: 12.5, padding: '8px 14px',
    borderRadius: 'var(--radius-pill)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  },
  pillBtnGhost: {
    display: 'inline-flex', alignItems: 'center', gap: 6, border: 'none', background: 'var(--bg-elevated)',
    color: 'var(--text-mid)', fontWeight: 600, fontSize: 12.5, padding: '8px 14px',
    borderRadius: 'var(--radius-pill)', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
  },

  input: {
    width: '100%', boxSizing: 'border-box', background: 'var(--bg-elevated)', border: '1px solid transparent',
    borderRadius: 14, padding: '12px 14px', color: 'var(--text-hi)', fontSize: 14, outline: 'none',
  },
  textarea: {
    width: '100%', boxSizing: 'border-box', background: 'var(--bg-elevated)', border: '1px solid transparent',
    borderRadius: 16, padding: '12px 14px', color: 'var(--text-hi)', fontSize: 14, lineHeight: 1.5,
    fontFamily: 'inherit', resize: 'none', outline: 'none',
  },

  twoCol: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  statusField: { position: 'relative' },
  clearInputBtn: {
    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', width: 22, height: 22, borderRadius: 11,
    border: 'none', background: 'var(--bg-hover)', color: 'var(--text-mid)', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  themeGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  themeTile: {
    display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-base)', border: '2px solid transparent',
    borderRadius: 16, padding: 8, cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
  },
  themeTileActive: { border: '2px solid var(--accent)' },
  themeSwatch: {
    width: 34, height: 34, borderRadius: 11, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxSizing: 'border-box',
  },
  themeName: { fontSize: 12.5, fontWeight: 600, color: 'var(--text-hi)' },
  colorPick: {
    position: 'relative', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-base)',
    border: '1px solid var(--border)', borderRadius: 16, padding: 10, cursor: 'pointer',
  },
  colorPickDot: { width: 30, height: 30, borderRadius: 10, flexShrink: 0, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' },
  colorPickLabel: { display: 'block', fontSize: 12.5, fontWeight: 650, color: 'var(--text-hi)' },
  colorPickValue: { display: 'block', fontSize: 11.5, color: 'var(--text-low)', fontFamily: 'ui-monospace, monospace' },
  colorRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  swatch: {
    width: 32, height: 32, borderRadius: '50%', border: 'none', cursor: 'pointer', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)',
  },
  swatchActive: { boxShadow: '0 0 0 3px var(--bg-surface), 0 0 0 5px var(--accent)' },
  customSwatch: {
    position: 'relative', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer',
    background: 'conic-gradient(#FF7EB6, #FFC857, #4CD6A0, #3A9BFF, #8B7CFF, #FF7EB6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  customSwatchDot: { width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--bg-surface)' },
  hiddenColorInput: { position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' },

  errorBox: {
    fontSize: 12.5, color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)',
    borderRadius: 12, padding: '9px 12px',
  },

  // música
  searchField: {
    display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-elevated)',
    borderRadius: 'var(--radius-pill)', padding: '0 16px',
  },
  searchInput: {
    flex: 1, border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-hi)',
    fontSize: 14, padding: '12px 0', fontFamily: 'inherit',
  },
  trackList: { display: 'flex', flexDirection: 'column', gap: 2, background: 'var(--bg-base)', borderRadius: 18, padding: 6 },
  trackRow: {
    display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 'none',
    borderRadius: 14, padding: 8, cursor: 'pointer', width: '100%',
  },
  trackArt: { width: 42, height: 42, borderRadius: 10, objectFit: 'cover', flexShrink: 0 },
  trackArtEmpty: { background: 'var(--bg-elevated)', color: 'var(--text-low)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  trackTitle: { fontSize: 13.5, fontWeight: 600, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  trackArtist: { fontSize: 12, color: 'var(--text-low)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  trackSelected: { display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg-base)', borderRadius: 18, padding: 10 },
  emptyCard: { display: 'flex', gap: 12, background: 'var(--bg-base)', borderRadius: 18, padding: 14 },
  emptyIcon: {
    width: 40, height: 40, borderRadius: 14, background: 'var(--accent-soft)', color: 'var(--accent)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  emptyTitle: { fontSize: 13.5, fontWeight: 650, color: 'var(--text-hi)', marginBottom: 3 },
  emptyText: { fontSize: 12.5, color: 'var(--text-low)', lineHeight: 1.55 },
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 11.5, background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 6 },

  // conexões
  platformGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 },
  platformTile: {
    display: 'flex', alignItems: 'center', gap: 9, background: 'var(--bg-base)', border: '2px solid transparent',
    borderRadius: 16, padding: '8px 10px', cursor: 'pointer', textAlign: 'left',
  },
  platformTileActive: { border: '2px solid var(--accent)' },
  platformIcon: {
    width: 30, height: 30, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  platformLabel: { fontSize: 12.5, fontWeight: 600, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  addRow: { display: 'flex', gap: 8, alignItems: 'center' },
  connList: { display: 'flex', flexDirection: 'column', gap: 6 },
  connRow: { display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-base)', borderRadius: 16, padding: '8px 8px 8px 10px' },
  connPlatform: { fontSize: 11.5, color: 'var(--text-low)', fontWeight: 600 },
  connValue: { fontSize: 13.5, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  iconBtn: {
    width: 32, height: 32, borderRadius: 16, border: 'none', background: 'transparent', color: 'var(--text-low)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },

  // prévia
  previewCol: {
    width: 340, flexShrink: 0, background: 'var(--bg-base)', borderLeft: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', padding: '18px 20px 90px', overflowY: 'auto',
  },
  previewHeader: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  previewLabel: { fontSize: 12.5, fontWeight: 650, color: 'var(--text-low)' },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16, border: 'none', background: 'var(--bg-elevated)', color: 'var(--text-mid)',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  profileCard: {
    background: 'var(--bg-surface)', borderRadius: 22, overflow: 'hidden',
    border: '1px solid var(--border)', boxShadow: 'var(--shadow-md)', flexShrink: 0,
  },
  profileBanner: { height: 104 },
  profileAvatarWrap: { position: 'relative', width: 88, height: 88, marginTop: -46, marginLeft: 16 },
  profileAvatar: {
    width: 88, height: 88, borderRadius: '50%', objectFit: 'cover', display: 'block',
    border: '6px solid var(--bg-surface)', boxSizing: 'border-box',
  },
  profileStatus: {
    position: 'absolute', right: 4, bottom: 4, width: 20, height: 20, borderRadius: '50%',
    background: 'var(--success)', border: '4px solid var(--bg-surface)', boxSizing: 'border-box',
  },
  profileBody: { padding: '6px 16px 18px' },
  profileName: { fontSize: 19, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: -0.2, wordBreak: 'break-word' },
  profileHandleRow: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 2 },
  profileHandle: { fontSize: 13, color: 'var(--text-mid)' },
  profileDivider: { height: 1, background: 'var(--border)', margin: '14px 0' },
  profileBlock: { marginBottom: 14 },
  profileBlockTitle: { fontSize: 11.5, fontWeight: 700, color: 'var(--text-low)', marginBottom: 6 },
  profileBio: { fontSize: 13.5, color: 'var(--text-hi)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' },
  profileConns: { display: 'flex', flexWrap: 'wrap', gap: 6 },
  profileConn: {
    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-hi)',
    background: 'var(--bg-elevated)', borderRadius: 'var(--radius-pill)', padding: '5px 10px',
  },
  profileEmpty: { fontSize: 12.5, color: 'var(--text-low)', lineHeight: 1.5, marginTop: 12 },

  // barra de salvar
  saveBar: {
    position: 'absolute', left: 16, right: 16, bottom: 16, display: 'flex', alignItems: 'center', gap: 10,
    background: 'var(--text-hi)', color: 'var(--bg-surface)', borderRadius: 18, padding: '10px 10px 10px 18px',
    boxShadow: 'var(--shadow-lg)', zIndex: 3,
  },
  saveBarText: { flex: 1, fontSize: 13.5, fontWeight: 550 },
  saveBarReset: {
    border: 'none', background: 'transparent', color: 'var(--bg-surface)', fontSize: 13, fontWeight: 600,
    cursor: 'pointer', padding: '9px 12px', opacity: 0.8,
  },
  saveBarSave: {
    border: 'none', background: 'var(--accent)', color: 'var(--accent-contrast)', fontSize: 13, fontWeight: 650,
    cursor: 'pointer', padding: '9px 18px', borderRadius: 'var(--radius-pill)',
  },
};
