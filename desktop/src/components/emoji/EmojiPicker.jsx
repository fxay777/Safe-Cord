import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SearchIcon, ClockIcon, SmileyIcon, UserIcon, PawIcon, CupIcon, BallIcon, CarIcon, BulbIcon, HeartIcon, FlagIcon } from '../Icons';
import { GROUPS, loadEmojis, searchEmojis, getTone, setTone, withTone, getRecent, pushRecent } from './emojiData';

// Seletor de emoji próprio do SafeCord: funciona offline (emojis do sistema, nada de imagem
// baixada da internet), busca em português, recentes e tom de pele. Abre num portal, ancorado
// no botão — não é cortado pelo layout.
const TAB_ICONS = { recentes: ClockIcon, 0: SmileyIcon, 1: UserIcon, 3: PawIcon, 4: CupIcon, 6: BallIcon, 5: CarIcon, 7: BulbIcon, 8: HeartIcon, 9: FlagIcon };
const TONES = ['✋', '✋🏻', '✋🏼', '✋🏽', '✋🏾', '✋🏿'];
const WIDTH = 352;
const HEIGHT = 420;

export default function EmojiPicker({ anchorRef, onPick, onClose }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState('');
  const [tone, setToneState] = useState(getTone);
  const [toneOpen, setToneOpen] = useState(false);
  const [hover, setHover] = useState(null);
  const [activeTab, setActiveTab] = useState('recentes');
  const [pos, setPos] = useState(null);
  const ref = useRef(null);
  const scrollRef = useRef(null);
  const sectionRefs = useRef({});
  const recent = useMemo(() => getRecent(), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { loadEmojis().then(setData).catch(() => setData({ emojis: [], byUnicode: new Map() })); }, []);

  useLayoutEffect(() => {
    const r = anchorRef?.current?.getBoundingClientRect();
    if (!r) { setPos({ left: 20, top: 20 }); return; }
    const left = Math.max(8, Math.min(r.right - WIDTH, window.innerWidth - WIDTH - 8));
    const above = r.top - HEIGHT - 10;
    setPos({ left, top: above >= 8 ? above : Math.min(r.bottom + 10, window.innerHeight - HEIGHT - 8) });
  }, [anchorRef]);

  useEffect(() => {
    const onDown = (e) => { if (!ref.current?.contains(e.target) && !anchorRef?.current?.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [onClose, anchorRef]);

  const sections = useMemo(() => {
    if (!data) return [];
    const out = [];
    const rec = recent.map((u) => data.byUnicode.get(u)).filter(Boolean);
    if (rec.length) out.push({ id: 'recentes', label: 'Recentes', items: rec });
    for (const g of GROUPS) {
      if (g.id === 'recentes') continue;
      out.push({ id: g.id, label: g.label, items: data.emojis.filter((e) => e.group === g.id) });
    }
    return out;
  }, [data, recent]);

  const results = useMemo(() => (data && q.trim() ? searchEmojis(data.emojis, q) : null), [data, q]);

  function pick(e, keepOpen) {
    const char = withTone(e, tone);
    pushRecent(e.u);
    onPick(char, { keepOpen });
  }

  function jump(id) {
    setActiveTab(id);
    setQ('');
    requestAnimationFrame(() => {
      const el = sectionRefs.current[id];
      if (el && scrollRef.current) scrollRef.current.scrollTop = el.offsetTop - 4;
    });
  }

  function onScroll() {
    const top = scrollRef.current?.scrollTop || 0;
    let current = sections[0]?.id;
    for (const sec of sections) {
      const el = sectionRefs.current[sec.id];
      if (el && el.offsetTop - 12 <= top) current = sec.id;
    }
    if (current !== undefined && current !== activeTab) setActiveTab(current);
  }

  function chooseTone(t) { setToneState(t); setTone(t); setToneOpen(false); }

  if (!pos) return null;
  const tabs = GROUPS.filter((g) => g.id !== 'recentes' || sections.some((s) => s.id === 'recentes'));

  return createPortal(
    <div ref={ref} style={{ ...st.panel, left: pos.left, top: pos.top }} data-emoji-picker onMouseDown={(e) => e.target.tagName !== 'INPUT' && e.preventDefault()}>
      <div style={st.top}>
        <label style={st.search}>
          <SearchIcon size={14} style={{ color: 'var(--text-low)' }} />
          <input
            autoFocus
            style={st.searchInput}
            placeholder="Buscar emoji (ex.: risada, coração)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && results?.[0]) { e.preventDefault(); pick(results[0], e.shiftKey); } }}
          />
        </label>
        <div style={{ position: 'relative' }}>
          <button type="button" style={st.toneBtn} onClick={() => setToneOpen((v) => !v)} title="Tom de pele" aria-label="Tom de pele">
            <span style={st.emojiChar}>{TONES[tone]}</span>
          </button>
          {toneOpen && (
            <div style={st.tonePop}>
              {TONES.map((t, i) => (
                <button key={t} type="button" style={{ ...st.toneOpt, ...(tone === i ? st.toneOn : {}) }} onClick={() => chooseTone(i)}>
                  <span style={st.emojiChar}>{t}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {!q.trim() && (
        <div style={st.tabs}>
          {tabs.map((g) => {
            const Icon = TAB_ICONS[g.id];
            return (
              <button key={g.id} type="button" title={g.label} onClick={() => jump(g.id)} style={{ ...st.tab, ...(activeTab === g.id ? st.tabOn : {}) }}>
                <Icon size={16} />
              </button>
            );
          })}
        </div>
      )}

      <div ref={scrollRef} style={st.scroll} onScroll={onScroll}>
        {!data && <div style={st.hint}>Carregando…</div>}
        {results && (
          results.length === 0
            ? <div style={st.hint}>Nenhum emoji encontrado pra "{q}"</div>
            : <Grid items={results} tone={tone} onPick={pick} onHover={setHover} />
        )}
        {!results && sections.map((sec) => (
          <div key={sec.id} ref={(el) => { sectionRefs.current[sec.id] = el; }}>
            <div style={st.secTitle}>{sec.label}</div>
            <Grid items={sec.items} tone={tone} onPick={pick} onHover={setHover} />
          </div>
        ))}
      </div>

      <div style={st.foot}>
        {hover ? (
          <>
            <span style={{ ...st.emojiChar, fontSize: 26 }}>{withTone(hover, tone)}</span>
            <span style={{ minWidth: 0 }}>
              <span style={st.footName}>{hover.label}</span>
              {hover.shortcodes[0] && <span style={st.footCode}>:{hover.shortcodes[0]}:</span>}
            </span>
          </>
        ) : <span style={st.footHint}>Shift + clique escolhe vários sem fechar</span>}
      </div>
    </div>,
    document.body,
  );
}

function Grid({ items, tone, onPick, onHover }) {
  return (
    <div style={st.grid}>
      {items.map((e) => (
        <button
          key={e.u}
          type="button"
          className="sc-emoji-cell"
          style={st.cell}
          title={e.label}
          aria-label={e.label}
          onClick={(ev) => onPick(e, ev.shiftKey)}
          onMouseEnter={() => onHover(e)}
        >
          <span style={st.emojiChar}>{withTone(e, tone)}</span>
        </button>
      ))}
    </div>
  );
}

const st = {
  panel: { position: 'fixed', zIndex: 460, width: WIDTH, height: HEIGHT, display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 20, boxShadow: 'var(--shadow-lg)', overflow: 'hidden', animation: 'scFadeIn 110ms ease-out' },
  top: { display: 'flex', gap: 6, padding: '10px 10px 6px' },
  search: { flex: 1, display: 'flex', alignItems: 'center', gap: 7, background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: 11, padding: '0 10px' },
  searchInput: { flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', color: 'var(--text-hi)', fontSize: 13, padding: '8px 0', fontFamily: 'inherit' },
  toneBtn: { width: 36, height: 36, borderRadius: 11, border: '1px solid var(--border)', background: 'var(--bg-base)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  tonePop: { position: 'absolute', right: 0, top: 40, zIndex: 2, display: 'flex', gap: 2, padding: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, boxShadow: 'var(--shadow-lg)' },
  toneOpt: { width: 32, height: 32, borderRadius: 9, border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 },
  toneOn: { background: 'var(--accent-soft)' },
  tabs: { display: 'flex', justifyContent: 'space-between', padding: '0 8px 4px', borderBottom: '1px solid var(--border)' },
  tab: { width: 30, height: 30, borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--text-low)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  tabOn: { color: 'var(--accent)', background: 'var(--accent-soft)' },
  scroll: { flex: 1, overflowY: 'auto', padding: '4px 8px 8px', position: 'relative' },
  secTitle: { position: 'sticky', top: -4, zIndex: 1, background: 'var(--bg-surface)', fontSize: 11, fontWeight: 750, color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '8px 4px 4px' },
  grid: { display: 'grid', gridTemplateColumns: 'repeat(9, 1fr)', gap: 1 },
  cell: { aspectRatio: '1', border: 'none', background: 'transparent', borderRadius: 9, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 },
  emojiChar: { fontFamily: 'var(--font-emoji)', fontSize: 23, lineHeight: 1 },
  hint: { fontSize: 12.5, color: 'var(--text-low)', textAlign: 'center', padding: 24 },
  foot: { display: 'flex', alignItems: 'center', gap: 10, minHeight: 46, padding: '6px 12px', borderTop: '1px solid var(--border)', background: 'var(--bg-elevated)' },
  footName: { display: 'block', fontSize: 13, fontWeight: 650, color: 'var(--text-hi)', textTransform: 'capitalize', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  footCode: { display: 'block', fontSize: 11.5, color: 'var(--text-low)', fontFamily: 'ui-monospace, monospace' },
  footHint: { fontSize: 12, color: 'var(--text-low)' },
};
