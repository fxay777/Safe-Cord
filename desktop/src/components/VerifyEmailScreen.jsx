import React, { useEffect, useRef, useState } from 'react';
import { verifyEmail, resendVerification, changeEmail } from '../api';
import SafeCordMark from './SafeCordMark';

const CODE_LENGTH = 6;

/**
 * Tela de verificação de email. Aparece depois do cadastro, antes de entrar no app.
 * Dá pra pular e verificar depois — mas o perfil fica sem a insígnia de verificado até verificar.
 */
export default function VerifyEmailScreen({ api, user, devCode, onVerified, onSkip, onLogout }) {
  const [digits, setDigits] = useState(Array(CODE_LENGTH).fill(''));
  const [error, setError] = useState('');
  const [info, setInfo] = useState(devCode ? `Modo de desenvolvimento: seu código é ${devCode}` : '');
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [editingEmail, setEditingEmail] = useState(false);
  const [newEmail, setNewEmail] = useState(user?.email || '');
  const inputsRef = useRef([]);

  useEffect(() => { inputsRef.current[0]?.focus(); }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Preenche sozinho no modo dev, pra não ter que copiar do console
  useEffect(() => {
    if (devCode && devCode.length === CODE_LENGTH) setDigits(devCode.split(''));
  }, [devCode]);

  function setDigit(index, value) {
    const clean = value.replace(/\D/g, '');
    if (!clean) {
      setDigits((prev) => prev.map((d, i) => (i === index ? '' : d)));
      return;
    }
    // Cola de uma vez: distribui os números pelos campos
    if (clean.length > 1) {
      const chars = clean.slice(0, CODE_LENGTH).split('');
      setDigits((prev) => prev.map((d, i) => chars[i] ?? d));
      inputsRef.current[Math.min(chars.length, CODE_LENGTH - 1)]?.focus();
      return;
    }
    setDigits((prev) => prev.map((d, i) => (i === index ? clean : d)));
    if (index < CODE_LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') submit();
  }

  async function submit() {
    const code = digits.join('');
    if (code.length !== CODE_LENGTH) {
      setError('Digite os 6 números do código');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await verifyEmail(api, code);
      onVerified(data.user);
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível verificar agora');
      setLoading(false);
    }
  }

  async function resend() {
    setError('');
    setInfo('');
    try {
      const data = await resendVerification(api);
      setCooldown(60);
      setInfo(data.devCode
        ? `Modo de desenvolvimento: seu código é ${data.devCode}`
        : 'Mandamos um código novo pro seu email.');
      if (data.devCode) setDigits(data.devCode.split(''));
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível reenviar agora');
    }
  }

  async function saveEmail() {
    setError('');
    setInfo('');
    try {
      const data = await changeEmail(api, newEmail);
      setEditingEmail(false);
      setDigits(Array(CODE_LENGTH).fill(''));
      setInfo(data.devCode
        ? `Email atualizado. Modo de desenvolvimento: código ${data.devCode}`
        : 'Email atualizado — enviamos um código novo.');
      if (data.devCode) setDigits(data.devCode.split(''));
    } catch (err) {
      setError(err?.response?.data?.error || 'Não foi possível trocar o email');
    }
  }

  return (
    <div style={styles.wrap}>
      <div style={styles.card}>
        <div style={styles.brand}>
          <SafeCordMark size={30} />
          <span style={styles.brandName}>SafeCord</span>
        </div>

        <h1 style={styles.title}>Confirme seu email</h1>
        <p style={styles.subtitle}>
          Mandamos um código de 6 números para{' '}
          <strong style={styles.email}>{user?.email}</strong>.
        </p>

        {editingEmail ? (
          <div style={styles.emailEditRow}>
            <input
              style={styles.emailInput}
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="seu@email.com"
              autoFocus
            />
            <button style={styles.smallBtn} onClick={saveEmail}>Salvar</button>
            <button style={styles.smallBtnGhost} onClick={() => setEditingEmail(false)}>Cancelar</button>
          </div>
        ) : (
          <button style={styles.linkBtn} onClick={() => setEditingEmail(true)}>
            Errou o email? Trocar
          </button>
        )}

        <div style={styles.codeRow}>
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => { inputsRef.current[i] = el; }}
              style={{ ...styles.codeInput, ...(digit ? styles.codeInputFilled : {}) }}
              value={digit}
              onChange={(e) => setDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              inputMode="numeric"
              maxLength={CODE_LENGTH}
              aria-label={`Dígito ${i + 1}`}
            />
          ))}
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {info && !error && <div style={styles.info}>{info}</div>}

        <button style={styles.submit} onClick={submit} disabled={loading}>
          {loading ? 'Verificando…' : 'Verificar email'}
        </button>

        <div style={styles.footerRow}>
          <button style={styles.linkBtn} onClick={resend} disabled={cooldown > 0}>
            {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar código'}
          </button>
          <span style={styles.dotSep}>•</span>
          <button style={styles.linkBtn} onClick={onSkip}>Verificar depois</button>
          <span style={styles.dotSep}>•</span>
          <button style={styles.linkBtn} onClick={onLogout}>Sair da conta</button>
        </div>
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'radial-gradient(circle at 30% 20%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 42%), var(--bg-void)',
    padding: 20,
  },
  card: {
    width: 420, background: 'var(--bg-surface)', border: '1px solid var(--border)',
    borderRadius: 24, padding: '30px 28px',
  },
  brand: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 },
  brandName: { fontSize: 19, fontWeight: 750, color: 'var(--text-hi)', letterSpacing: -0.4 },
  title: { fontSize: 21, fontWeight: 750, color: 'var(--text-hi)', margin: '0 0 6px' },
  subtitle: { fontSize: 13.5, color: 'var(--text-mid)', margin: '0 0 6px', lineHeight: 1.55 },
  email: { color: 'var(--text-hi)' },
  emailEditRow: { display: 'flex', gap: 6, marginTop: 10, marginBottom: 4 },
  emailInput: {
    flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '8px 10px', color: 'var(--text-hi)', fontSize: 13, outline: 'none',
  },
  smallBtn: {
    background: 'var(--accent)', color: 'var(--accent-contrast, #052622)', border: 'none',
    borderRadius: 12, padding: '0 12px', fontWeight: 700, fontSize: 12, cursor: 'pointer',
  },
  smallBtnGhost: {
    background: 'transparent', color: 'var(--text-mid)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '0 10px', fontSize: 12, cursor: 'pointer',
  },
  codeRow: { display: 'flex', gap: 8, margin: '20px 0 4px', justifyContent: 'space-between' },
  codeInput: {
    width: 54, height: 60, textAlign: 'center', fontSize: 24, fontWeight: 800,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 16,
    color: 'var(--text-hi)', outline: 'none',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  },
  codeInputFilled: { borderColor: 'var(--accent)', color: 'var(--accent)' },
  error: {
    marginTop: 12, fontSize: 12.5, color: 'var(--danger)',
    background: 'rgba(240,101,79,0.1)', borderRadius: 12, padding: '8px 11px',
  },
  info: {
    marginTop: 12, fontSize: 12.5, color: 'var(--accent)',
    background: 'color-mix(in srgb, var(--accent) 8%, transparent)', borderRadius: 12, padding: '8px 11px',
  },
  submit: {
    marginTop: 16, width: '100%', background: 'var(--accent)',
    color: 'var(--accent-contrast, #052622)', fontWeight: 750, border: 'none',
    borderRadius: 16, padding: '12px 0', cursor: 'pointer', fontSize: 14,
  },
  footerRow: {
    marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: 8, flexWrap: 'wrap',
  },
  linkBtn: {
    background: 'transparent', border: 'none', color: 'var(--accent)',
    fontSize: 12.5, cursor: 'pointer', padding: 0,
  },
  dotSep: { color: 'var(--text-low)', fontSize: 11 },
};
