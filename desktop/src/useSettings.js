import { useCallback, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'safecord_settings';

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean, 16);
  return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
}

function shadeHex(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const clamp = (v) => Math.max(0, Math.min(255, Math.round((t - v) * p + v)));
  const toHex = (v) => v.toString(16).padStart(2, '0');
  return `#${toHex(clamp(r))}${toHex(clamp(g))}${toHex(clamp(b))}`;
}

// Temas em degradê — cada um vira o gradiente de botões, banners e realces do app inteiro
// (igual aos "Temas coloridos" do Discord Nitro, só que com paleta própria do SafeCord).
export const ACCENT_PRESETS = [
  { id: 'skyblue', label: 'Azul Claro', accent: '#22C4E8', accentSecondary: '#7FE8FF' },
  { id: 'aurora', label: 'Aurora', accent: '#16C7B3', accentSecondary: '#8C7BFA' },
  { id: 'sunset', label: 'Pôr do Sol', accent: '#F0654F', accentSecondary: '#F0B429' },
  { id: 'candy', label: 'Algodão Doce', accent: '#F0568C', accentSecondary: '#B388FF' },
  { id: 'ocean', label: 'Oceano', accent: '#38BDF8', accentSecondary: '#16C7B3' },
  { id: 'mint', label: 'Menta', accent: '#8BD450', accentSecondary: '#2FD9C6' },
  { id: 'grape', label: 'Uva', accent: '#8C7BFA', accentSecondary: '#F0568C' },
  { id: 'citrus', label: 'Cítrico', accent: '#F0D429', accentSecondary: '#8BD450' },
  { id: 'blush', label: 'Rubor', accent: '#FF8FB1', accentSecondary: '#F0B429' },
  { id: 'sky', label: 'Céu', accent: '#60A5FA', accentSecondary: '#A78BFA' },
  { id: 'lagoon', label: 'Lagoa', accent: '#2DD4BF', accentSecondary: '#3B82F6' },
  { id: 'peach', label: 'Pêssego', accent: '#FFB199', accentSecondary: '#FFD9A0' },
  { id: 'bubblegum', label: 'Bubblegum', accent: '#F472B6', accentSecondary: '#818CF8' },
  { id: 'lime', label: 'Verde-Limão', accent: '#A3E635', accentSecondary: '#22D3EE' },
  { id: 'flame', label: 'Chama', accent: '#FB923C', accentSecondary: '#EF4444' },
  { id: 'lava', label: 'Lava', accent: '#F0654F', accentSecondary: '#7A1F1F' },
  { id: 'midnight', label: 'Meia-Noite', accent: '#4C5FD5', accentSecondary: '#1B1F3B' },
  { id: 'wine', label: 'Vinho', accent: '#B23A63', accentSecondary: '#33132B' },
  { id: 'slate', label: 'Ardósia', accent: '#8A97B8', accentSecondary: '#2E3446' },
  { id: 'jade', label: 'Jade', accent: '#2FB380', accentSecondary: '#0F3D2E' },
  { id: 'indigo', label: 'Índigo', accent: '#6366F1', accentSecondary: '#1E1B4B' },
  { id: 'neon', label: 'Neon', accent: '#D6249F', accentSecondary: '#7B2FF7' },
  { id: 'gold', label: 'Dourado', accent: '#E4B454', accentSecondary: '#7A5A1E' },
  { id: 'royal', label: 'Azul Royal', accent: '#4A5AE0', accentSecondary: '#161B54' },
  { id: 'forest', label: 'Floresta Noturna', accent: '#1F5C4B', accentSecondary: '#0A1F1A' },
];

function withDerived(theme) {
  return {
    ...theme,
    accentDim: shadeHex(theme.accent, -22),
    accentSecondaryDim: shadeHex(theme.accentSecondary, -22),
  };
}

const DEFAULT_SETTINGS = {
  themePresetId: 'skyblue',
  customAccent: null, // { accent, accentSecondary } | null — sobrepõe o preset quando definido
  audio: {
    inputDeviceId: '',
    outputDeviceId: '',
    inputVolume: 100,
    outputVolume: 100,
    joinMuted: false,
    joinDeafened: false,
  },
};

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    const merged = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      audio: { ...DEFAULT_SETTINGS.audio, ...(parsed.audio || {}) },
    };

    // Blindagem contra dados de versões antigas: um themePresetId que não existe mais
    // na lista atual, ou um customAccent incompleto/corrompido, travava a aba de Aparência
    // num estado que nunca batia com nenhum tile — parecia que clicar não fazia nada.
    if (!ACCENT_PRESETS.some((p) => p.id === merged.themePresetId)) {
      merged.themePresetId = DEFAULT_SETTINGS.themePresetId;
    }
    if (merged.customAccent && (!HEX_RE.test(merged.customAccent.accent || '') || !HEX_RE.test(merged.customAccent.accentSecondary || ''))) {
      merged.customAccent = null;
    }

    return merged;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function relativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

// Texto legível em cima da cor de destaque — temas claros (Azul Claro, Menta) pedem
// texto escuro; temas escuros (Meia-Noite, Vinho, Floresta) pedem texto claro.
// Sem isso, botões/badges ficavam ilegíveis nos temas mais escuros da grade.
function contrastFor(hex) {
  return relativeLuminance(hex) > 0.42 ? '#06222B' : '#F3F5F8';
}

export function themeToCssVars(theme) {
  const full = withDerived(theme);
  const { r, g, b } = hexToRgb(full.accent);
  const rgb2 = hexToRgb(full.accentSecondary);
  return {
    '--accent': full.accent,
    '--accent-dim': full.accentDim,
    '--accent-glow': `rgba(${r}, ${g}, ${b}, 0.32)`,
    '--accent-secondary': full.accentSecondary,
    '--accent-secondary-dim': full.accentSecondaryDim,
    '--accent-gradient': `linear-gradient(135deg, ${full.accent}, ${full.accentSecondary})`,
    '--accent-contrast': contrastFor(full.accent),
    // Tons bem suaves pra usar como brilho ambiente no fundo do app —
    // é o que faz o tema "se sentir" trocado, não só os botões.
    '--accent-ambient': `rgba(${r}, ${g}, ${b}, 0.07)`,
    '--accent-secondary-ambient': `rgba(${rgb2.r}, ${rgb2.g}, ${rgb2.b}, 0.06)`,
  };
}

export function applyThemeToDocument(theme) {
  const root = document.documentElement;
  const vars = themeToCssVars(theme);
  Object.entries(vars).forEach(([key, value]) => root.style.setProperty(key, value));
}

export function useSettings() {
  const [settings, setSettings] = useState(loadSettings);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      /* armazenamento indisponível — segue só em memória */
    }
  }, [settings]);

  const activeTheme = useMemo(() => {
    const base = settings.customAccent || ACCENT_PRESETS.find((p) => p.id === settings.themePresetId) || ACCENT_PRESETS[0];
    return withDerived(base);
  }, [settings.customAccent, settings.themePresetId]);

  useEffect(() => {
    applyThemeToDocument(activeTheme);
  }, [activeTheme]);

  const setPreset = useCallback((id) => {
    setSettings((prev) => ({ ...prev, themePresetId: id, customAccent: null }));
  }, []);

  // Tema personalizado com degradê de 2 pontas (igual aos presets, só que escolhido na hora).
  const setCustomGradient = useCallback((accent, accentSecondary) => {
    setSettings((prev) => ({ ...prev, customAccent: { accent, accentSecondary } }));
  }, []);

  const setAudio = useCallback((patch) => {
    setSettings((prev) => ({ ...prev, audio: { ...prev.audio, ...patch } }));
  }, []);

  return {
    settings,
    activeTheme,
    presets: ACCENT_PRESETS,
    isCustom: Boolean(settings.customAccent),
    setPreset,
    setCustomGradient,
    setAudio,
  };
}
