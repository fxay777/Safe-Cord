// Dados de emoji (nomes e palavras-chave em português) — carregados só quando precisa,
// empacotados no app: nada de baixar imagem de emoji da internet.
let cache = null;

export const GROUPS = [
  { id: 'recentes', label: 'Recentes' },
  { id: 0, label: 'Carinhas e emoções' },
  { id: 1, label: 'Pessoas' },
  { id: 3, label: 'Animais e natureza' },
  { id: 4, label: 'Comida e bebida' },
  { id: 6, label: 'Atividades' },
  { id: 5, label: 'Viagens e lugares' },
  { id: 7, label: 'Objetos' },
  { id: 8, label: 'Símbolos' },
  { id: 9, label: 'Bandeiras' },
];

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export async function loadEmojis() {
  if (cache) return cache;
  const [{ default: list }, { default: codes }] = await Promise.all([
    import('emojibase-data/pt/compact.json'),
    import('emojibase-data/pt/shortcodes/cldr.json'),
  ]);
  const emojis = list
    .filter((e) => e.group !== undefined && e.group !== 2)
    .sort((a, b) => a.order - b.order)
    .map((e) => {
      const sc = codes[e.hexcode];
      const shortcodes = Array.isArray(sc) ? sc : sc ? [sc] : [];
      return {
        u: e.unicode,
        label: e.label,
        group: e.group,
        shortcodes,
        skins: e.skins ? e.skins.map((s) => s.unicode) : null,
        search: norm([e.label, ...(e.tags || []), ...shortcodes].join(' ')),
      };
    });
  const byUnicode = new Map(emojis.map((e) => [e.u, e]));
  cache = { emojis, byUnicode };
  return cache;
}

export function searchEmojis(emojis, query, limit = 200) {
  const q = norm(query).trim();
  if (!q) return [];
  const words = q.split(/\s+/);
  const scored = [];
  for (const e of emojis) {
    if (!words.every((w) => e.search.includes(w))) continue;
    const label = norm(e.label);
    const score = (label.startsWith(q) ? 0 : 2) + (e.shortcodes.some((c) => c.startsWith(q.replace(/\s+/g, '_'))) ? 0 : 1);
    scored.push([score, e]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  return scored.slice(0, limit).map((x) => x[1]);
}

// Tom de pele (0 = padrão amarelo, 1..5 = clara → escura) e recentes ficam salvos no aparelho
const TONE_KEY = 'safecord_emoji_tone';
const RECENT_KEY = 'safecord_emoji_recent';
export function getTone() { try { return Number(localStorage.getItem(TONE_KEY)) || 0; } catch { return 0; } }
export function setTone(t) { try { localStorage.setItem(TONE_KEY, String(t)); } catch { /* ok */ } }
export function withTone(e, tone) { return tone && e.skins?.[tone - 1] ? e.skins[tone - 1] : e.u; }
export function getRecent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } }
export function pushRecent(base) {
  try {
    const list = [base, ...getRecent().filter((x) => x !== base)].slice(0, 32);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch { /* ok */ }
}

const EMOJI_ONLY = /^(?:\p{Extended_Pictographic}|\p{Emoji_Component}|\p{Regional_Indicator}|‍|️|\s)+$/u;
/** Mensagem só com emojis (até 6)? Vira "emoji grande", como no WhatsApp/Discord. */
export function isJumbo(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 60 || !EMOJI_ONLY.test(t) || /^[\d#*\s]+$/.test(t)) return false;
  const count = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(t)].filter((s) => s.segment.trim()).length;
  return count <= 6;
}
