import React, { useEffect, useState } from 'react';
import { ScreenShareIcon, CloseIcon } from './Icons';
import { SCREEN_QUALITIES } from '../useVoiceChannel';

const PREF_KEY = 'safecord_screen_prefs';
function loadPrefs() {
  try { return { quality: '1080p30', withAudio: false, ...JSON.parse(localStorage.getItem(PREF_KEY) || '{}') }; } catch { return { quality: '1080p30', withAudio: false }; }
}

// Seletor de tela/janela no estilo do Discord. No app desktop lista as telas e janelas;
// no navegador só escolhe a qualidade e o próprio navegador mostra o seletor dele depois.
export default function ScreenSharePicker({ loadSources, onPick, onClose }) {
  const desktop = Boolean(window.safecord?.isDesktop);
  const audioPossible = !desktop || window.safecord?.platform === 'win32';
  const [prefs, setPrefs] = useState(loadPrefs);
  const savePrefs = (next) => { setPrefs(next); try { localStorage.setItem(PREF_KEY, JSON.stringify(next)); } catch { /* ok */ } };
  const [sources, setSources] = useState(desktop ? null : []);
  const [tab, setTab] = useState('screen'); // 'screen' | 'window'
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  async function refresh() {
    try {
      const list = await loadSources();
      setSources(list || []);
      setError('');
    } catch (err) {
      setError('Não foi possível listar suas telas. No macOS, libere "Gravação de Tela" pro SafeCord nas Preferências do Sistema.');
      setSources([]);
    }
  }

  useEffect(() => {
    if (!desktop) return undefined;
    refresh();
    const timer = setInterval(refresh, 4000); // miniaturas atualizadas, como no Discord
    return () => clearInterval(timer);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const visible = (sources || []).filter((s) => s.kind === tab);

  async function start(id = selected) {
    if (desktop && !id) return;
    setStarting(true);
    try {
      await onPick({ sourceId: desktop ? id : null, quality: prefs.quality, withAudio: audioPossible && prefs.withAudio });
    } finally {
      setStarting(false);
    }
  }

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div style={styles.header}>
          <div style={styles.title}><ScreenShareIcon size={18} /> Compartilhar tela</div>
          <button style={styles.closeBtn} onClick={onClose} aria-label="Fechar"><CloseIcon size={16} /></button>
        </div>

        {desktop && <div style={styles.tabs}>
          {[['screen', 'Telas'], ['window', 'Janelas']].map(([key, label]) => (
            <button
              key={key}
              style={{ ...styles.tab, ...(tab === key ? styles.tabActive : {}) }}
              onClick={() => { setTab(key); setSelected(null); }}
            >
              {label}
            </button>
          ))}
        </div>}

        {desktop && <div style={styles.body}>
          {error && <div style={styles.error}>{error}</div>}
          {sources === null && <div style={styles.hint}>Procurando telas e janelas…</div>}
          {sources !== null && visible.length === 0 && !error && (
            <div style={styles.hint}>{tab === 'screen' ? 'Nenhuma tela encontrada.' : 'Nenhuma janela aberta.'}</div>
          )}

          <div style={styles.grid}>
            {visible.map((s) => {
              const active = selected === s.id;
              return (
                <button
                  key={s.id}
                  style={{ ...styles.card, ...(active ? styles.cardActive : {}) }}
                  onClick={() => setSelected(s.id)}
                  onDoubleClick={() => { setSelected(s.id); start(s.id); }}
                >
                  <div style={styles.thumbWrap}>
                    {s.thumbnail
                      ? <img src={s.thumbnail} alt="" style={styles.thumb} />
                      : <ScreenShareIcon size={28} style={{ color: 'var(--text-low)' }} />}
                  </div>
                  <div style={styles.cardLabel}>
                    {s.icon && <img src={s.icon} alt="" style={styles.appIcon} />}
                    <span style={styles.cardName}>{s.name}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>}

        {!desktop && (
          <div style={{ ...styles.hint, padding: '6px 22px 4px', textAlign: 'left' }}>
            Escolha a qualidade e clique em <strong>Escolher tela</strong> — o navegador vai perguntar qual tela, janela ou aba você quer mostrar.
          </div>
        )}

        <div style={styles.options}>
          <div>
            <div style={styles.optLabel}>Qualidade</div>
            <div style={styles.segmented}>
              {Object.entries(SCREEN_QUALITIES).map(([id, q]) => (
                <button key={id} type="button" onClick={() => savePrefs({ ...prefs, quality: id })} style={{ ...styles.seg, ...(prefs.quality === id ? styles.segOn : {}) }}>
                  {q.label}
                </button>
              ))}
            </div>
          </div>
          {audioPossible && (
            <label style={styles.audioToggle}>
              <input type="checkbox" checked={prefs.withAudio} onChange={(e) => savePrefs({ ...prefs, withAudio: e.target.checked })} style={{ accentColor: 'var(--accent)' }} />
              <span>
                Transmitir o som {desktop ? 'do computador' : 'da aba/tela'}
                <span style={styles.optHint}>{desktop ? 'Use fone de ouvido — senão o pessoal da call se escuta de volta.' : 'Funciona melhor compartilhando uma aba do navegador.'}</span>
              </span>
            </label>
          )}
        </div>

        <div style={styles.footer}>
          <button style={styles.cancelBtn} onClick={onClose}>Cancelar</button>
          <button
            style={{ ...styles.goBtn, opacity: (selected || !desktop) && !starting ? 1 : 0.5 }}
            disabled={(desktop && !selected) || starting}
            onClick={() => start()}
          >
            {starting ? 'Iniciando…' : desktop ? 'Transmitir' : 'Escolher tela'}
          </button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed', inset: 0, background: 'var(--scrim)', 
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 140, padding: 20,
  },
  modal: {
    width: 680, maxHeight: '84vh', background: 'var(--bg-surface)',
    border: '1px solid var(--border)', borderRadius: 24,
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  },
  header: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 10px',
  },
  title: { fontSize: 17, fontWeight: 750, color: 'var(--text-hi)', display: 'flex', alignItems: 'center', gap: 9 },
  closeBtn: { background: 'transparent', border: 'none', color: 'var(--text-mid)', cursor: 'pointer', display: 'flex' },
  tabs: { display: 'flex', gap: 6, padding: '0 22px 12px' },
  tab: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-mid)',
    borderRadius: 12, padding: '7px 16px', fontSize: 13, fontWeight: 650, cursor: 'pointer',
  },
  tabActive: { background: 'var(--accent)', borderColor: 'var(--accent)', color: 'var(--accent-contrast, #052622)' },
  body: { padding: '0 22px 8px', overflowY: 'auto', flex: 1 },
  hint: { color: 'var(--text-low)', fontSize: 13, textAlign: 'center', padding: '30px 0' },
  error: {
    fontSize: 12.5, color: 'var(--danger)', background: 'rgba(240,101,79,0.1)',
    borderRadius: 12, padding: '9px 12px', marginBottom: 12, lineHeight: 1.5,
  },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 12 },
  card: {
    background: 'var(--bg-elevated)', border: '2px solid transparent', borderRadius: 16,
    padding: 8, cursor: 'pointer', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 8,
  },
  cardActive: { border: '2px solid var(--accent)', background: 'color-mix(in srgb, var(--accent) 8%, transparent)' },
  thumbWrap: {
    aspectRatio: '16 / 9', borderRadius: 11, background: '#05080C', overflow: 'hidden',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  thumb: { width: '100%', height: '100%', objectFit: 'contain' },
  cardLabel: { display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, padding: '0 2px 2px' },
  appIcon: { width: 16, height: 16, flexShrink: 0 },
  cardName: {
    fontSize: 12.5, fontWeight: 600, color: 'var(--text-hi)',
    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
  },
  options: { display: 'flex', alignItems: 'flex-end', gap: 18, flexWrap: 'wrap', padding: '12px 22px 4px' },
  optLabel: { fontSize: 11.5, fontWeight: 750, color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  segmented: { display: 'flex', gap: 3, padding: 3, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12 },
  seg: { border: 'none', background: 'transparent', color: 'var(--text-mid)', fontWeight: 650, fontSize: 12.5, padding: '7px 11px', borderRadius: 9, cursor: 'pointer', fontFamily: 'inherit', whiteSpace: 'nowrap' },
  segOn: { background: 'var(--accent)', color: '#fff' },
  audioToggle: { display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, color: 'var(--text-hi)', fontWeight: 600, cursor: 'pointer', maxWidth: 300 },
  optHint: { display: 'block', fontSize: 11.5, color: 'var(--text-low)', fontWeight: 400, marginTop: 2, lineHeight: 1.4 },
  footer: {
    display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '14px 22px 18px',
    borderTop: '1px solid var(--border)',
  },
  cancelBtn: {
    background: 'transparent', border: 'none', color: 'var(--text-mid)',
    fontSize: 13, fontWeight: 650, cursor: 'pointer', padding: '9px 14px',
  },
  goBtn: {
    background: 'var(--accent)', color: 'var(--accent-contrast, #052622)', border: 'none',
    borderRadius: 13, padding: '9px 20px', fontWeight: 750, fontSize: 13, cursor: 'pointer',
  },
};
