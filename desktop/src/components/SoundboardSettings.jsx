import React, { useEffect, useRef, useState } from 'react';
import { resolveAssetUrl } from '../api';
import { PlayCircleIcon, TrashIcon, PlusIcon, MusicIcon } from './Icons';

// Seção "Soundboard" das configurações do servidor: quem pode tocar, sons padrão e sons próprios.
const COLORS = ['#1E7BFF', '#4CD6A0', '#F0B429', '#E5484D', '#B794FF', '#FF7EB6', '#2EC4C4', '#FF8A65'];
const errText = (err, fb = 'Algo deu errado') => err?.response?.data?.error || fb;

export default function SoundboardSettings({ api, server }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState({ name: '', color: COLORS[0], volume: 80, file: null, duration: 0 });
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);
  const previewRef = useRef(null);

  const load = () => api.get(`/servers/${server.id}/sounds`).then(({ data: d }) => setData(d)).catch((err) => setError(errText(err)));
  useEffect(() => { load(); return () => previewRef.current?.pause(); }, [server.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function play(url, volume = 80) {
    previewRef.current?.pause();
    const a = new Audio(url);
    a.volume = Math.min(1, volume / 100);
    previewRef.current = a;
    a.play().catch(() => {});
  }

  async function setSetting(patch) {
    try { await api.put(`/servers/${server.id}/sounds/settings`, patch); load(); } catch (err) { setError(errText(err)); }
  }

  function pickFile(file) {
    if (!file) return;
    setError('');
    if (file.size > 1024 * 1024) { setError('O som pode ter no máximo 1 MB'); return; }
    const url = URL.createObjectURL(file);
    const probe = new Audio(url);
    probe.onloadedmetadata = () => {
      const d = probe.duration;
      setForm((f) => ({ ...f, file, duration: d, url, name: f.name || file.name.replace(/\.[^.]+$/, '').slice(0, 32) }));
      if (d > 5.2) setError(`O som pode ter no máximo 5 segundos (esse tem ${d.toFixed(1)}s). Corte antes de enviar.`);
    };
    probe.onerror = () => setError('Não consegui ler esse arquivo de áudio');
  }

  async function upload() {
    if (!form.file) return;
    setBusy(true); setError('');
    try {
      const fd = new FormData();
      fd.append('sound', form.file);
      fd.append('name', form.name.trim());
      fd.append('color', form.color);
      fd.append('volume', String(form.volume));
      await api.post(`/servers/${server.id}/sounds`, fd);
      if (form.url) URL.revokeObjectURL(form.url);
      setForm({ name: '', color: COLORS[0], volume: 80, file: null, duration: 0 });
      load();
    } catch (err) {
      setError(errText(err, 'Não foi possível enviar o som'));
    } finally {
      setBusy(false);
    }
  }

  async function update(sound, patch) {
    try { await api.put(`/servers/${server.id}/sounds/${sound.id}`, patch); load(); } catch (err) { setError(errText(err)); }
  }
  async function remove(sound) {
    try { await api.delete(`/servers/${server.id}/sounds/${sound.id}`); load(); } catch (err) { setError(errText(err)); }
  }

  if (!data) return <div style={st.hint}>{error || 'Carregando…'}</div>;
  const own = data.sounds.filter((s) => !s.is_default);
  const defaults = data.sounds.filter((s) => s.is_default);

  return (
    <div data-soundboard-settings>
      <h2 style={st.h2}>Soundboard</h2>
      <div style={st.sub}>Sons curtos que quem está na call toca pra todo mundo ouvir, como no Discord. Cada pessoa ajusta o volume pra ela.</div>

      <div style={st.group}>
        <Toggle label="Todo mundo pode tocar sons" hint="Desligado: só quem tem a permissão 'Gerenciar soundboard'." on={data.settings.everyone} onChange={(v) => setSetting({ everyone: v })} />
        <Toggle label="Usar os sons padrão do SafeCord" hint={`${defaults.length || 8} sons prontos: palmas, buzina, moeda…`} on={data.settings.defaults} onChange={(v) => setSetting({ defaults: v })} />
      </div>

      <div style={st.groupTitle}>Adicionar som ({own.length}/{data.limits.max})</div>
      <div style={st.group}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" style={st.fileBtn} onClick={() => fileRef.current?.click()}>
            <MusicIcon size={15} /> {form.file ? 'Trocar arquivo' : 'Escolher arquivo'}
          </button>
          <input ref={fileRef} type="file" accept="audio/*" style={{ display: 'none' }} onChange={(e) => { pickFile(e.target.files?.[0]); e.target.value = ''; }} />
          <span style={st.hint}>{form.file ? `${form.file.name} · ${form.duration.toFixed(1)}s` : 'MP3, OGG, WAV ou M4A · até 5 segundos · até 1 MB'}</span>
          {form.url && <button type="button" style={st.iconBtn} onClick={() => play(form.url, form.volume)} title="Ouvir"><PlayCircleIcon size={16} /></button>}
        </div>
        {form.file && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <label><span style={st.label}>Nome</span><input style={st.input} maxLength={32} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></label>
              <label><span style={st.label}>Volume: {form.volume}%</span><input type="range" min={5} max={100} value={form.volume} onChange={(e) => setForm({ ...form, volume: Number(e.target.value) })} style={{ width: '100%', accentColor: 'var(--accent)', marginTop: 10 }} /></label>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setForm({ ...form, color: c })} aria-label={`Cor ${c}`} style={{ width: 24, height: 24, borderRadius: 12, background: c, border: form.color === c ? '3px solid var(--text-hi)' : '3px solid transparent', cursor: 'pointer', padding: 0, boxSizing: 'border-box' }} />
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" style={st.btnPrimary} disabled={busy || form.name.trim().length < 2 || form.duration > 5.2} onClick={upload}>
                <PlusIcon size={14} /> {busy ? 'Enviando…' : 'Adicionar ao soundboard'}
              </button>
            </div>
          </>
        )}
        {error && <div style={st.error}>{error}</div>}
      </div>

      {own.length > 0 && (
        <>
          <div style={st.groupTitle}>Sons do servidor</div>
          <div style={st.list}>
            {own.map((s) => (
              <div key={s.id} style={st.row} data-sound-row={s.id}>
                <span style={{ ...st.dot, background: s.color }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={st.rowName}>{s.name}</span>
                  <span style={st.rowMeta}>{(s.duration_ms / 1000).toFixed(1)}s · tocado {s.uses}x</span>
                </span>
                <input type="range" min={5} max={100} defaultValue={s.volume} title={`Volume ${s.volume}%`} onMouseUp={(e) => update(s, { volume: Number(e.target.value) })} onKeyUp={(e) => update(s, { volume: Number(e.target.value) })} style={{ width: 90, accentColor: s.color }} />
                <button type="button" style={st.iconBtn} onClick={() => play(resolveAssetUrl(s.file), s.volume)} title="Ouvir"><PlayCircleIcon size={16} /></button>
                <button type="button" style={{ ...st.iconBtn, color: 'var(--danger)' }} onClick={() => remove(s)} title="Excluir"><TrashIcon size={14} /></button>
              </div>
            ))}
          </div>
        </>
      )}

      {data.settings.defaults && (
        <>
          <div style={st.groupTitle}>Sons padrão</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {defaults.map((s) => (
              <button key={s.id} type="button" style={st.chip} onClick={() => play(resolveAssetUrl(s.file), s.volume)}>
                <span style={{ ...st.dot, width: 8, height: 8, background: s.color }} /> {s.name} <PlayCircleIcon size={13} style={{ color: 'var(--text-low)' }} />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Toggle({ label, hint, on, onChange }) {
  return (
    <label style={st.toggleRow}>
      <span style={{ flex: 1 }}>
        <span style={{ display: 'block', fontSize: 13.5, fontWeight: 650, color: 'var(--text-hi)' }}>{label}</span>
        {hint && <span style={{ display: 'block', fontSize: 12, color: 'var(--text-low)', marginTop: 2 }}>{hint}</span>}
      </span>
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)} style={{ ...st.switch, background: on ? 'var(--accent)' : 'var(--bg-hover)' }}>
        <span style={{ ...st.knob, transform: on ? 'translateX(18px)' : 'none' }} />
      </button>
    </label>
  );
}

const st = {
  h2: { fontSize: 20, fontWeight: 800, color: 'var(--text-hi)', margin: '0 0 4px', letterSpacing: -0.3 },
  sub: { fontSize: 13.5, color: 'var(--text-mid)', lineHeight: 1.5, marginBottom: 16 },
  hint: { fontSize: 12.5, color: 'var(--text-low)' },
  label: { display: 'block', fontSize: 12.5, fontWeight: 650, color: 'var(--text-mid)', marginBottom: 6 },
  group: { background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 16, padding: 14, display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 },
  groupTitle: { fontSize: 11.5, fontWeight: 750, color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '0 2px 8px' },
  toggleRow: { display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' },
  switch: { width: 40, height: 22, borderRadius: 11, border: 'none', padding: 2, cursor: 'pointer', flexShrink: 0, transition: 'background .15s' },
  knob: { display: 'block', width: 18, height: 18, borderRadius: 9, background: '#fff', transition: 'transform .15s' },
  fileBtn: { display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--border)', background: 'var(--bg-surface)', color: 'var(--text-hi)', fontWeight: 650, fontSize: 13, padding: '9px 14px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit' },
  input: { width: '100%', boxSizing: 'border-box', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 11, padding: '9px 11px', color: 'var(--text-hi)', fontSize: 13.5, fontFamily: 'inherit', outline: 'none' },
  btnPrimary: { display: 'inline-flex', alignItems: 'center', gap: 7, border: 'none', background: 'var(--accent)', color: '#fff', fontWeight: 650, fontSize: 13.5, padding: '10px 16px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit' },
  iconBtn: { width: 32, height: 32, borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-mid)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  error: { fontSize: 12.5, color: 'var(--danger)', background: 'color-mix(in srgb, var(--danger) 10%, transparent)', padding: '8px 11px', borderRadius: 10 },
  list: { display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 },
  row: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 14 },
  dot: { width: 12, height: 12, borderRadius: 6, flexShrink: 0, display: 'inline-block' },
  rowName: { display: 'block', fontSize: 13.5, fontWeight: 650, color: 'var(--text-hi)' },
  rowMeta: { display: 'block', fontSize: 11.5, color: 'var(--text-low)' },
  chip: { display: 'inline-flex', alignItems: 'center', gap: 6, border: '1px solid var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-hi)', fontSize: 12.5, fontWeight: 600, padding: '6px 10px', borderRadius: 999, cursor: 'pointer', fontFamily: 'inherit' },
};
