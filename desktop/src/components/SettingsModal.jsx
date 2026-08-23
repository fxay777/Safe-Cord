import React, { useEffect, useRef, useState } from 'react';
import { ACCENT_PRESETS } from '../useSettings';
import { UserIcon, MicIcon, PaletteIcon, CheckIcon, SparklesIcon, EditIcon, CameraIcon, MusicIcon, LinkIcon } from './Icons';
import { resolveAssetUrl } from '../api';

export default function SettingsModal({
  open,
  initialTab = 'voz',
  onClose,
  settings,
  activeTheme,
  isCustom,
  setPreset,
  setCustomGradient,
  setAudio,
  voice,
  accounts = [],
  activeUserId,
  onSwitchAccount,
  onAddAccount,
  onLogoutAccount,
  onOpenProfile,
  user,
}) {  const [tab, setTab] = useState(initialTab);
  const [devices, setDevices] = useState({ inputs: [], outputs: [] });
  const [permissionState, setPermissionState] = useState('unknown'); // 'unknown' | 'granted' | 'denied'
  const [testingMic, setTestingMic] = useState(false);
  const [micLevel, setMicLevel] = useState(0);

  const testStreamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (open) setTab(initialTab);
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    refreshDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    return () => stopMicTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function refreshDevices() {
    try {
      const list = await navigator.mediaDevices.enumerateDevices();
      const inputs = list.filter((d) => d.kind === 'audioinput');
      const outputs = list.filter((d) => d.kind === 'audiooutput');
      setDevices({ inputs, outputs });
      if (inputs.some((d) => d.label)) setPermissionState('granted');
    } catch {
      /* enumerateDevices indisponível */
    }
  }

  async function requestMicPermission() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setPermissionState('granted');
      await refreshDevices();
    } catch {
      setPermissionState('denied');
    }
  }

  async function toggleMicTest() {
    if (testingMic) {
      stopMicTest();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: settings.audio.inputDeviceId ? { deviceId: { exact: settings.audio.inputDeviceId } } : true,
      });
      testStreamRef.current = stream;
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteFrequencyData(data);
        const avg = data.reduce((sum, v) => sum + v, 0) / data.length;
        setMicLevel(Math.min(100, Math.round((avg / 128) * 100)));
        rafRef.current = requestAnimationFrame(tick);
      };
      tick();
      setTestingMic(true);
      setPermissionState('granted');
    } catch {
      setPermissionState('denied');
    }
  }

  function stopMicTest() {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    testStreamRef.current?.getTracks().forEach((t) => t.stop());
    testStreamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setMicLevel(0);
    setTestingMic(false);
  }

  function handleClose() {
    stopMicTest();
    onClose();
  }

  function handleInputDeviceChange(deviceId) {
    setAudio({ inputDeviceId: deviceId });
    if (testingMic) {
      stopMicTest();
    }
  }

  function handleOutputDeviceChange(deviceId) {
    setAudio({ outputDeviceId: deviceId });
    voice?.setOutputDevice?.(deviceId);
  }

  function handleOutputVolume(value) {
    setAudio({ outputVolume: value });
    voice?.setOutputVolume?.(value / 100);
  }

  if (!open) return null;

  return (
    <div style={styles.overlay} onClick={handleClose}>
      <div style={styles.card} onClick={(e) => e.stopPropagation()}>
        <div style={styles.sidebar}>
          <div style={styles.sidebarTitle}>Configurações</div>
          <button type="button" style={tab === 'perfil' ? styles.tabActive : styles.tab} onClick={() => setTab('perfil')}>
            <EditIcon size={15} /> Meu Perfil
          </button>
          <button type="button" style={tab === 'conta' ? styles.tabActive : styles.tab} onClick={() => setTab('conta')}>
            <UserIcon size={15} /> Contas
          </button>
          <button type="button" style={tab === 'voz' ? styles.tabActive : styles.tab} onClick={() => setTab('voz')}>
            <MicIcon size={15} /> Voz e Vídeo
          </button>
          <button type="button" style={tab === 'aparencia' ? styles.tabActive : styles.tab} onClick={() => setTab('aparencia')}>
            <PaletteIcon size={15} /> Aparência
          </button>
          <div style={{ flex: 1 }} />
          <button type="button" style={styles.closeSidebarBtn} onClick={handleClose}>
            Fechar ×
          </button>
        </div>

        <div style={styles.content}>
          {tab === 'perfil' && (
            <ProfileTab user={user} onOpenProfile={onOpenProfile} />
          )}
          {tab === 'conta' && (
            <AccountTab
              accounts={accounts}
              activeUserId={activeUserId}
              onSwitchAccount={(userId) => { onSwitchAccount?.(userId); handleClose(); }}
              onAddAccount={() => { onAddAccount?.(); handleClose(); }}
              onLogoutAccount={onLogoutAccount}
            />
          )}
          {tab === 'voz' && (
            <VoiceTab
              devices={devices}
              permissionState={permissionState}
              audio={settings.audio}
              testingMic={testingMic}
              micLevel={micLevel}
              onRequestPermission={requestMicPermission}
              onToggleMicTest={toggleMicTest}
              onInputDeviceChange={handleInputDeviceChange}
              onOutputDeviceChange={handleOutputDeviceChange}
              onInputVolume={(v) => setAudio({ inputVolume: v })}
              onOutputVolume={handleOutputVolume}
              onJoinMutedChange={(v) => setAudio({ joinMuted: v })}
            />
          )}
          {tab === 'aparencia' && (
            <AppearanceTab
              presets={ACCENT_PRESETS}
              activeTheme={activeTheme}
              isCustom={isCustom}
              themePresetId={settings.themePresetId}
              setPreset={setPreset}
              setCustomGradient={setCustomGradient}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function ProfileTab({ user, onOpenProfile }) {
  const name = user?.display_name || user?.username || 'Usuário';
  const initials = (name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
  const avatarUrl = resolveAssetUrl(user?.avatar_url);
  const bannerUrl = resolveAssetUrl(user?.banner_url);
  const connections = user?.connections || [];

  return (
    <div>
      <h3 style={styles.sectionTitle}>Meu Perfil</h3>
      <div style={styles.hint}>Como os outros te veem no SafeCord — nome, foto, bio, música fixada e contas conectadas.</div>

      <div
        style={{
          ...styles.profilePreviewHero,
          ...(bannerUrl
            ? { backgroundImage: `url(${bannerUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
            : { background: 'var(--accent-gradient)' }),
        }}
      >
        <div style={styles.profilePreviewAvatarWrap}>
          {avatarUrl ? (
            <img src={avatarUrl} alt={name} style={styles.profilePreviewAvatarImg} />
          ) : (
            <div style={{ ...styles.profilePreviewAvatar, background: user?.avatar_color || 'var(--accent)' }}>{initials}</div>
          )}
        </div>
      </div>

      <div style={styles.profilePreviewBody}>
        <div style={styles.profilePreviewName}>{name}</div>
        <div style={styles.profilePreviewTag}>#{user?.tag}</div>
        {user?.bio && <div style={styles.profilePreviewBio}>{user.bio}</div>}

        <div style={styles.profileQuickRow}>
          {user?.spotify_track_id && (
            <span style={styles.profileQuickChip}><MusicIcon size={12} /> Música fixada</span>
          )}
          {connections.length > 0 && (
            <span style={styles.profileQuickChip}><LinkIcon size={12} /> {connections.length} conta{connections.length > 1 ? 's' : ''} conectada{connections.length > 1 ? 's' : ''}</span>
          )}
        </div>
      </div>

      <button type="button" style={styles.editProfileBtn} onClick={onOpenProfile}>
        <CameraIcon size={14} /> Editar perfil completo
      </button>
    </div>
  );
}

function AccountTab({ accounts, activeUserId, onSwitchAccount, onAddAccount, onLogoutAccount }) {
  const [confirmLogoutFor, setConfirmLogoutFor] = useState(null);

  return (
    <div>
      <h3 style={styles.sectionTitle}>Contas</h3>
      <div style={styles.hint}>Troque entre contas salvas sem digitar a senha de novo, ou entre com uma conta nova.</div>

      <div style={styles.accountList}>
        {accounts.map((acc) => {
          const isActive = String(acc.user.id) === String(activeUserId);
          const name = acc.user.display_name || acc.user.username;
          const initials = (name || '?').split(' ').map((p) => p[0]).join('').slice(0, 2).toUpperCase();
          return (
            <div key={acc.user.id} style={{ ...styles.accountRow, ...(isActive ? styles.accountRowActive : {}) }}>
              <button
                type="button"
                style={styles.accountRowMain}
                onClick={() => !isActive && onSwitchAccount(acc.user.id)}
                disabled={isActive}
              >
                <div style={{ ...styles.accountAvatar, background: acc.user.avatar_color || 'var(--accent)' }}>{initials}</div>
                <div style={{ minWidth: 0 }}>
                  <div style={styles.accountName}>{name}</div>
                  <div style={styles.accountTag}>#{acc.user.tag}</div>
                </div>
              </button>
              {isActive ? (
                <span style={styles.activeBadge}>Ativa</span>
              ) : (
                <button type="button" style={styles.accountSwitchBtn} onClick={() => onSwitchAccount(acc.user.id)}>
                  Trocar
                </button>
              )}
              <button
                type="button"
                style={styles.accountRemoveBtn}
                title="Sair desta conta"
                onClick={() => setConfirmLogoutFor(acc.user.id)}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <button type="button" style={styles.addAccountBtn} onClick={onAddAccount}>
        + Adicionar outra conta
      </button>

      {confirmLogoutFor && (
        <div style={styles.confirmBox}>
          <div style={styles.confirmText}>
            Sair da conta <strong>{accounts.find((a) => String(a.user.id) === String(confirmLogoutFor))?.user?.display_name || accounts.find((a) => String(a.user.id) === String(confirmLogoutFor))?.user?.username}</strong>?
            {accounts.length === 1 && ' Como é a única conta salva, você voltará pra tela de login.'}
          </div>
          <div style={styles.confirmActions}>
            <button type="button" style={styles.smallBtn} onClick={() => setConfirmLogoutFor(null)}>Cancelar</button>
            <button
              type="button"
              style={styles.dangerBtn}
              onClick={() => { onLogoutAccount(confirmLogoutFor); setConfirmLogoutFor(null); }}
            >
              Sair
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function VoiceTab({
  devices,
  permissionState,
  audio,
  testingMic,
  micLevel,
  onRequestPermission,
  onToggleMicTest,
  onInputDeviceChange,
  onOutputDeviceChange,
  onInputVolume,
  onOutputVolume,
  onJoinMutedChange,
}) {
  const supportsOutputSelect = typeof document !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

  return (
    <div>
      <h3 style={styles.sectionTitle}>Voz e Vídeo</h3>

      {permissionState !== 'granted' && (
        <div style={styles.permissionBanner}>
          <span>O SafeCord precisa de acesso ao microfone pra listar seus dispositivos de áudio.</span>
          <button type="button" style={styles.smallBtn} onClick={onRequestPermission}>
            Permitir acesso
          </button>
        </div>
      )}

      <div style={styles.block}>
        <label style={styles.label}>Dispositivo de entrada (microfone)</label>
        <select
          style={styles.select}
          value={audio.inputDeviceId}
          onChange={(e) => onInputDeviceChange(e.target.value)}
        >
          <option value="">Padrão do sistema</option>
          {devices.inputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Microfone ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>

        <div style={styles.testRow}>
          <button type="button" style={styles.smallBtn} onClick={onToggleMicTest}>
            {testingMic ? 'Parar teste' : 'Testar microfone'}
          </button>
          <div style={styles.meterTrack}>
            <div style={{ ...styles.meterFill, width: `${micLevel}%` }} />
          </div>
        </div>

        <label style={styles.label}>Volume de entrada</label>
        <input
          type="range"
          min={0}
          max={100}
          value={audio.inputVolume}
          onChange={(e) => onInputVolume(Number(e.target.value))}
          style={styles.slider}
        />
      </div>

      <div style={styles.block}>
        <label style={styles.label}>Dispositivo de saída (headset / alto-falante)</label>
        <select
          style={styles.select}
          value={audio.outputDeviceId}
          onChange={(e) => onOutputDeviceChange(e.target.value)}
          disabled={!supportsOutputSelect}
        >
          <option value="">Padrão do sistema</option>
          {devices.outputs.map((d) => (
            <option key={d.deviceId} value={d.deviceId}>
              {d.label || `Saída ${d.deviceId.slice(0, 6)}`}
            </option>
          ))}
        </select>
        {!supportsOutputSelect && (
          <div style={styles.hint}>Este navegador/Electron não permite trocar a saída de áudio por app — use as configurações do sistema.</div>
        )}

        <label style={styles.label}>Volume de saída</label>
        <input
          type="range"
          min={0}
          max={100}
          value={audio.outputVolume}
          onChange={(e) => onOutputVolume(Number(e.target.value))}
          style={styles.slider}
        />
      </div>

      <div style={styles.block}>
        <label style={styles.checkboxRow}>
          <input
            type="checkbox"
            checked={audio.joinMuted}
            onChange={(e) => onJoinMutedChange(e.target.checked)}
          />
          Entrar sempre com o microfone mutado
        </label>
      </div>
    </div>
  );
}

function AppearanceTab({ presets, activeTheme, isCustom, themePresetId, setPreset, setCustomGradient }) {
  const [customOpen, setCustomOpen] = useState(false);
  const [fromDraft, setFromDraft] = useState(activeTheme.accent);
  const [toDraft, setToDraft] = useState(activeTheme.accentSecondary);

  useEffect(() => {
    if (isCustom) {
      setFromDraft(activeTheme.accent);
      setToDraft(activeTheme.accentSecondary);
    }
  }, [isCustom, activeTheme.accent, activeTheme.accentSecondary]);

  function openCustom() {
    setCustomOpen(true);
    setCustomGradient(fromDraft, toDraft);
  }

  function updateFrom(hex) {
    setFromDraft(hex);
    setCustomGradient(hex, toDraft);
  }

  function updateTo(hex) {
    setToDraft(hex);
    setCustomGradient(fromDraft, hex);
  }

  return (
    <div>
      <h3 style={styles.sectionTitle}>Temas coloridos</h3>
      <div style={styles.hint}>Deixe o SafeCord do seu jeito — a cor escolhida vira o degradê de botões, banners e realces em todo o app.</div>

      <div style={styles.swatchGrid}>
        <button
          type="button"
          style={{ ...styles.gradTile, ...styles.customTile, ...(isCustom ? styles.gradTileActive : {}) }}
          onClick={openCustom}
          title="Cor personalizada"
        >
          <span style={styles.newBadge}>NOVO</span>
          <PaletteIcon size={20} />
          {isCustom && <span style={styles.tileCheck}><CheckIcon size={11} /></span>}
        </button>

        {presets.map((p) => {
          const active = !isCustom && themePresetId === p.id;
          return (
            <button
              key={p.id}
              type="button"
              style={{
                ...styles.gradTile,
                background: `linear-gradient(135deg, ${p.accent}, ${p.accentSecondary})`,
                ...(active ? styles.gradTileActive : {}),
              }}
              onClick={() => { setPreset(p.id); setCustomOpen(false); }}
              title={p.label}
            >
              {active && <span style={styles.tileCheck}><CheckIcon size={11} /></span>}
            </button>
          );
        })}
      </div>

      {customOpen && (
        <div style={styles.block}>
          <label style={styles.label}>Degradê personalizado</label>
          <div style={styles.customGradRow}>
            <div style={styles.customColorField}>
              <input type="color" value={fromDraft} onChange={(e) => updateFrom(e.target.value)} style={styles.colorInput} />
              <span style={styles.customColorLabel}>De</span>
            </div>
            <div style={styles.customGradPreview} />
            <div style={styles.customColorField}>
              <input type="color" value={toDraft} onChange={(e) => updateTo(e.target.value)} style={styles.colorInput} />
              <span style={styles.customColorLabel}>Para</span>
            </div>
          </div>
        </div>
      )}

      <button
        type="button"
        style={styles.resetLink}
        onClick={() => { setPreset('skyblue'); setCustomOpen(false); }}
      >
        Restaurar tema padrão
      </button>

      <div style={styles.block}>
        <label style={styles.label}>Pré-visualização</label>
        <div style={styles.previewCard}>
          <div style={styles.previewAvatar}>SC</div>
          <div style={{ flex: 1 }}>
            <div style={styles.previewMsgAuthor}>SafeCord <span style={styles.previewBadge}>ADMIN</span></div>
            <div style={styles.previewMsgText}>A nova cor fica assim no chat e nos botões <SparklesIcon size={12} style={{ display: 'inline', verticalAlign: '-2px' }} /></div>
          </div>
          <button type="button" style={styles.previewBtn}>Ação</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(6,10,14,0.55)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 80,
  },
  card: {
    width: 760, maxWidth: '92vw', height: 560, maxHeight: '88vh', background: 'var(--bg-surface)',
    border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', display: 'flex', overflow: 'hidden',
    boxShadow: 'var(--shadow-lg)',
  },
  sidebar: {
    width: 200, flexShrink: 0, background: 'var(--bg-elevated)', borderRight: '1px solid var(--border)',
    display: 'flex', flexDirection: 'column', padding: '16px 10px', gap: 4,
  },
  sidebarTitle: { fontSize: 11, fontWeight: 800, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--text-low)', padding: '0 8px 8px' },
  tab: {
    display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', background: 'transparent', border: 'none',
    borderRadius: 'var(--radius-sm)', padding: '9px 10px', color: 'var(--text-mid)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  },
  tabActive: {
    display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left', background: 'var(--bg-hover)', border: 'none',
    borderRadius: 'var(--radius-sm)', padding: '9px 10px', color: 'var(--text-hi)', fontSize: 13, fontWeight: 700, cursor: 'pointer',
  },
  closeSidebarBtn: {
    background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-mid)', borderRadius: 'var(--radius-sm)',
    padding: '8px 10px', fontSize: 12.5, cursor: 'pointer',
  },
  content: { flex: 1, minWidth: 0, padding: '22px 26px', overflowY: 'auto' },
  sectionTitle: { fontFamily: 'var(--font-display)', fontSize: 18, margin: '0 0 16px', color: 'var(--text-hi)' },
  block: { marginBottom: 22 },
  label: { display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: 0.3, margin: '0 0 8px' },
  select: {
    width: '100%', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
    padding: '9px 10px', color: 'var(--text-hi)', fontSize: 13, marginBottom: 12,
  },
  slider: { width: '100%', accentColor: 'var(--accent)' },
  testRow: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 },
  meterTrack: { flex: 1, height: 8, borderRadius: 6, background: 'var(--bg-elevated)', overflow: 'hidden', border: '1px solid var(--border)' },
  meterFill: { height: '100%', background: 'var(--accent)', transition: 'width 0.08s linear' },
  smallBtn: {
    background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-hi)', borderRadius: 'var(--radius-sm)',
    padding: '8px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
  },
  permissionBanner: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: 'rgba(240,180,41,0.1)',
    border: '1px solid rgba(240,180,41,0.35)', borderRadius: 'var(--radius-sm)', padding: '10px 14px', fontSize: 12.5,
    color: 'var(--text-mid)', marginBottom: 18,
  },
  hint: { fontSize: 12, color: 'var(--text-low)', lineHeight: 1.5, marginBottom: 16 },
  checkboxRow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-mid)', cursor: 'pointer' },
  swatchGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 8 },
  gradTile: {
    position: 'relative',
    aspectRatio: '1 / 1',
    borderRadius: 12,
    border: '2px solid transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'transform 0.12s ease, border-color 0.12s ease',
  },
  gradTileActive: {
    border: '2px solid #fff',
    boxShadow: '0 0 0 2px var(--bg-surface), 0 0 0 4px var(--accent), 0 6px 16px rgba(0,0,0,0.35)',
    transform: 'scale(1.04)',
  },
  customTile: {
    background: 'var(--bg-elevated)',
    border: '2px dashed rgba(240,86,140,0.55)',
    color: '#F0568C',
  },
  newBadge: {
    position: 'absolute', top: -6, left: -6, background: '#F0568C', color: '#fff', fontSize: 8,
    fontWeight: 900, letterSpacing: 0.3, padding: '2px 5px', borderRadius: 5, boxShadow: '0 2px 6px rgba(0,0,0,0.35)',
  },
  tileCheck: {
    position: 'absolute', top: 4, right: 4, width: 16, height: 16, borderRadius: '50%',
    background: 'rgba(0,0,0,0.55)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  customGradRow: { display: 'flex', alignItems: 'center', gap: 14 },
  customColorField: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 },
  customColorLabel: { fontSize: 10.5, color: 'var(--text-low)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3 },
  customGradPreview: { flex: 1, height: 34, borderRadius: 9, background: 'var(--accent-gradient)', border: '1px solid var(--border)' },
  resetLink: {
    background: 'transparent', border: 'none', color: 'var(--text-low)', fontSize: 11.5, fontWeight: 600,
    cursor: 'pointer', textDecoration: 'underline', padding: '2px 0', marginBottom: 18,
  },
  colorInput: { width: 42, height: 36, border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'transparent', padding: 2, cursor: 'pointer' },
  previewCard: {
    display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-md)', padding: 14,
  },
  previewAvatar: {
    width: 38, height: 38, borderRadius: '50%', background: 'var(--accent)', color: 'var(--accent-contrast)', fontWeight: 800,
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, flexShrink: 0,
  },
  previewMsgAuthor: { fontSize: 13, fontWeight: 700, color: 'var(--text-hi)', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 },
  previewBadge: { fontSize: 9, fontWeight: 800, background: 'var(--accent)', color: 'var(--accent-contrast)', borderRadius: 4, padding: '1px 5px' },
  previewMsgText: { fontSize: 12.5, color: 'var(--text-mid)' },
  previewBtn: { background: 'var(--accent)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 'var(--radius-sm)', padding: '8px 14px', fontWeight: 700, fontSize: 12.5, cursor: 'pointer', flexShrink: 0 },
  profilePreviewHero: { height: 96, borderRadius: 'var(--radius-md)', position: 'relative', marginBottom: 40 },
  profilePreviewAvatarWrap: { position: 'absolute', left: 18, bottom: -30 },
  profilePreviewAvatarImg: { width: 68, height: 68, borderRadius: '50%', objectFit: 'cover', border: '4px solid var(--bg-surface)', display: 'block' },
  profilePreviewAvatar: {
    width: 68, height: 68, borderRadius: '50%', border: '4px solid var(--bg-surface)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', color: 'var(--accent-contrast)', fontWeight: 800, fontSize: 22,
  },
  profilePreviewBody: { marginBottom: 18 },
  profilePreviewName: { fontSize: 17, fontWeight: 800, color: 'var(--text-hi)' },
  profilePreviewTag: { fontSize: 12, color: 'var(--text-low)', marginBottom: 10 },
  profilePreviewBio: { fontSize: 12.5, color: 'var(--text-mid)', lineHeight: 1.5, marginBottom: 10 },
  profileQuickRow: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  profileQuickChip: {
    display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--text-mid)',
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 999, padding: '5px 10px',
  },
  editProfileBtn: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%',
    background: 'var(--accent-gradient)', color: 'var(--accent-contrast)', border: 'none', borderRadius: 'var(--radius-sm)',
    padding: '11px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
  },
  accountList: { display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 },
  accountRow: {
    display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', padding: '8px 10px',
  },
  accountRowActive: { border: '1px solid var(--accent)' },
  accountRowMain: {
    display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0, background: 'transparent', border: 'none',
    padding: 0, cursor: 'pointer', textAlign: 'left',
  },
  accountAvatar: {
    width: 34, height: 34, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 800, fontSize: 12, color: '#fff', flexShrink: 0,
  },
  accountName: { fontSize: 13, fontWeight: 700, color: 'var(--text-hi)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  accountTag: { fontSize: 11, color: 'var(--text-low)' },
  activeBadge: {
    fontSize: 10.5, fontWeight: 800, color: 'var(--accent)', background: 'rgba(255,255,255,0.06)',
    borderRadius: 6, padding: '4px 8px', flexShrink: 0,
  },
  accountSwitchBtn: {
    background: 'var(--bg-hover)', border: '1px solid var(--border)', color: 'var(--text-hi)', borderRadius: 'var(--radius-sm)',
    padding: '6px 10px', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0,
  },
  accountRemoveBtn: {
    width: 26, height: 26, borderRadius: '50%', border: 'none', background: 'transparent', color: 'var(--text-low)',
    fontSize: 16, cursor: 'pointer', flexShrink: 0, lineHeight: 1,
  },
  addAccountBtn: {
    width: '100%', background: 'var(--bg-elevated)', border: '1px dashed var(--border)', color: 'var(--text-mid)',
    borderRadius: 'var(--radius-sm)', padding: '10px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
  },
  confirmBox: {
    marginTop: 16, background: 'rgba(240,101,79,0.08)', border: '1px solid rgba(240,101,79,0.35)',
    borderRadius: 'var(--radius-sm)', padding: 14,
  },
  confirmText: { fontSize: 12.5, color: 'var(--text-mid)', lineHeight: 1.5, marginBottom: 12 },
  confirmActions: { display: 'flex', justifyContent: 'flex-end', gap: 8 },
  dangerBtn: {
    background: 'var(--danger)', border: 'none', color: '#fff', borderRadius: 'var(--radius-sm)',
    padding: '8px 14px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
  },
};
