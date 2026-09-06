import React, { useState } from 'react';
import { createApiClient } from '../api';
import { ArrowLeftIcon, MailIcon, PhoneIcon, ArrowRightIcon } from './Icons';
import SafeCordMark from './SafeCordMark';

export default function AuthScreen({ onAuth, onCancel }) {
  const [mode, setMode] = useState('login');
  const [contactType, setContactType] = useState('email');

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function formatPhone(value) {
    const numbers = value.replace(/\D/g, '').slice(0, 11);

    if (numbers.length <= 2) {
      return numbers.length ? `(${numbers}` : '';
    }

    if (numbers.length <= 7) {
      return `(${numbers.slice(0, 2)}) ${numbers.slice(2)}`;
    }

    if (numbers.length <= 10) {
      return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 6)}-${numbers.slice(6)}`;
    }

    return `(${numbers.slice(0, 2)}) ${numbers.slice(2, 7)}-${numbers.slice(7)}`;
  }

  function handlePhoneChange(e) {
    setPhone(formatPhone(e.target.value));
  }

  function validate() {
    if (!username.trim()) {
      return 'Digite seu usuário.';
    }

    if (password.length < 6) {
      return 'A senha precisa ter pelo menos 6 caracteres.';
    }

    if (mode === 'register') {
      if (contactType === 'email') {
        if (!email.trim()) {
          return 'Digite seu e-mail.';
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!emailRegex.test(email)) {
          return 'Digite um e-mail válido.';
        }
      }

      if (contactType === 'phone') {
        const numbers = phone.replace(/\D/g, '');

        if (numbers.length !== 10 && numbers.length !== 11) {
          return 'Digite um telefone válido com DDD.';
        }
      }
    }

    return '';
  }

  async function submit(e) {
    e.preventDefault();
    setError('');

    const validationError = validate();

    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);

    try {
      const api = createApiClient();

      const path =
        mode === 'login'
          ? '/auth/login'
          : '/auth/register';

      const payload = {
        username: username.trim(),
        password,
      };

      if (mode === 'register') {
        if (contactType === 'email') {
          payload.email = email.trim();
        } else {
          payload.phone = phone.replace(/\D/g, '');
        }
      }

      const { data } = await api.post(path, payload);

      onAuth(data.token, data.user);
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.message ||
          'Não foi possível conectar ao servidor.'
      );
    } finally {
      setLoading(false);
    }
  }

  function changeMode() {
    setMode(mode === 'login' ? 'register' : 'login');
    setError('');
  }

  return (
    <div style={styles.page}>
      <div style={styles.backgroundGlowOne} />
      <div style={styles.backgroundGlowTwo} />

      <div style={styles.container}>
        {/* LOGO */}
        <div style={styles.logoArea}>
          <div style={styles.logo}>
            <SafeCordMark size={28} />
          </div>

          <div>
            <div style={styles.brandName}>SafeCord</div>
            <div style={styles.brandSub}>Conecte. Converse. Compartilhe.</div>
          </div>
        </div>

        {/* CARD */}
        <div style={styles.card}>
          {onCancel && (
            <button type="button" style={styles.backLink} onClick={onCancel}>
              <ArrowLeftIcon size={12} /> Voltar
            </button>
          )}
          <div style={styles.cardHeader}>
            <h1 style={styles.title}>
              {mode === 'login'
                ? 'Bem-vindo de volta'
                : 'Crie sua conta'}
            </h1>

            <p style={styles.subtitle}>
              {onCancel
                ? 'Entre com outra conta SafeCord — a atual continua salva.'
                : mode === 'login'
                ? 'Entre na sua conta para continuar.'
                : 'Crie sua conta e comece a conversar com sua galera.'}
            </p>
          </div>

          <form onSubmit={submit} style={styles.form}>
            {/* USUÁRIO */}
            <div style={styles.field}>
              <label style={styles.label}>Usuário</label>

              <div style={styles.inputWrapper}>
                <span style={styles.inputIcon}>@</span>

                <input
                  style={styles.input}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="seuusuario"
                  autoComplete="username"
                  autoFocus
                />
              </div>
            </div>

            {/* CADASTRO */}
            {mode === 'register' && (
              <div style={styles.contactSection}>
                <label style={styles.label}>Como podemos te encontrar?</label>

                <div style={styles.tabs}>
                  <button
                    type="button"
                    onClick={() => {
                      setContactType('email');
                      setError('');
                    }}
                    style={{
                      ...styles.tab,
                      ...(contactType === 'email'
                        ? styles.tabActive
                        : {}),
                    }}
                  >
                    <span><MailIcon size={13} /></span>
                    E-mail
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setContactType('phone');
                      setError('');
                    }}
                    style={{
                      ...styles.tab,
                      ...(contactType === 'phone'
                        ? styles.tabActive
                        : {}),
                    }}
                  >
                    <span><PhoneIcon size={13} /></span>
                    Telefone
                  </button>
                </div>

                {contactType === 'email' ? (
                  <div style={styles.inputWrapper}>
                    <span style={styles.inputIcon}><MailIcon size={14} /></span>

                    <input
                      style={styles.input}
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="seuemail@gmail.com"
                      autoComplete="email"
                    />
                  </div>
                ) : (
                  <div style={styles.inputWrapper}>
                    <span style={styles.inputIcon}><PhoneIcon size={14} /></span>

                    <input
                      style={styles.input}
                      type="tel"
                      value={phone}
                      onChange={handlePhoneChange}
                      placeholder="(54) 99999-9999"
                      autoComplete="tel"
                      maxLength={15}
                    />
                  </div>
                )}
              </div>
            )}

            {/* SENHA */}
            <div style={styles.field}>
              <label style={styles.label}>Senha</label>

              <div style={styles.inputWrapper}>
                <span style={styles.inputIcon}>••</span>

                <input
                  style={styles.input}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  autoComplete={
                    mode === 'login'
                      ? 'current-password'
                      : 'new-password'
                  }
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={styles.passwordButton}
                  aria-label={
                    showPassword
                      ? 'Ocultar senha'
                      : 'Mostrar senha'
                  }
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>

              {mode === 'register' && (
                <div style={styles.passwordHint}>
                  Sua senha deve ter pelo menos 6 caracteres.
                </div>
              )}
            </div>

            {/* ERRO */}
            {error && (
              <div style={styles.error}>
                <span style={styles.errorIcon}>!</span>
                <span>{error}</span>
              </div>
            )}

            {/* BOTÃO */}
            <button
              style={{
                ...styles.submit,
                ...(loading ? styles.submitLoading : {}),
              }}
              disabled={loading}
              type="submit"
            >
              {loading ? (
                <>
                  <span style={styles.spinner} />
                  {mode === 'login'
                    ? 'Entrando...'
                    : 'Criando conta...'}
                </>
              ) : (
                <>
                  {mode === 'login'
                    ? 'Entrar na conta'
                    : 'Criar minha conta'}

                  <span style={styles.arrow}><ArrowRightIcon size={15} /></span>
                </>
              )}
            </button>
          </form>

          {/* TROCAR MODO */}
          <div style={styles.switchArea}>
            <span style={styles.switchText}>
              {mode === 'login'
                ? 'Ainda não possui uma conta?'
                : 'Já possui uma conta?'}
            </span>

            <button
              type="button"
              style={styles.switchButton}
              onClick={changeMode}
            >
              {mode === 'login'
                ? 'Criar agora'
                : 'Entrar'}
            </button>
          </div>
        </div>

        <div style={styles.footer}>
          <span>© {new Date().getFullYear()} SafeCord</span>
          <span style={styles.footerDot}>•</span>
          <span>Feito para sua comunidade</span>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100%',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
    background: `
      radial-gradient(
        circle at 20% 20%,
        rgba(45, 212, 191, 0.12),
        transparent 30%
      ),
      radial-gradient(
        circle at 80% 80%,
        rgba(99, 102, 241, 0.10),
        transparent 30%
      ),
      var(--bg-void)
    `,
    padding: '40px 20px',
    boxSizing: 'border-box',
  },

  backgroundGlowOne: {
    position: 'absolute',
    width: 350,
    height: 350,
    borderRadius: '50%',
    background: 'rgba(45, 212, 191, 0.06)',
    filter: 'blur(80px)',
    top: '-180px',
    left: '-120px',
    pointerEvents: 'none',
  },

  backgroundGlowTwo: {
    position: 'absolute',
    width: 350,
    height: 350,
    borderRadius: '50%',
    background: 'rgba(99, 102, 241, 0.06)',
    filter: 'blur(80px)',
    bottom: '-180px',
    right: '-120px',
    pointerEvents: 'none',
  },

  container: {
    width: '100%',
    maxWidth: 430,
    position: 'relative',
    zIndex: 2,
  },

  logoArea: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 24,
  },

  logo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255,255,255,0.06)',
    border: '1px solid rgba(255,255,255,0.1)',
    boxShadow:
      '0 10px 35px rgba(45, 212, 191, 0.20)',
  },

  brandName: {
    fontFamily: 'var(--font-display)',
    fontSize: 24,
    fontWeight: 800,
    letterSpacing: -0.8,
    color: 'var(--text-hi)',
  },

  brandSub: {
    marginTop: 2,
    fontSize: 11,
    color: 'var(--text-mid)',
  },

  card: {
    width: '100%',
    boxSizing: 'border-box',
    background:
      'linear-gradient(145deg, rgba(255,255,255,0.045), rgba(255,255,255,0.018))',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: 20,
    padding: '32px',
    boxShadow:
      '0 25px 80px rgba(0,0,0,0.35)',
  },

  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'transparent',
    border: 'none',
    color: 'var(--text-mid)',
    fontSize: 12.5,
    fontWeight: 600,
    cursor: 'pointer',
    padding: 0,
    marginBottom: 18,
  },

  cardHeader: {
    marginBottom: 26,
  },

  title: {
    margin: 0,
    fontSize: 25,
    fontWeight: 800,
    letterSpacing: -0.7,
    color: 'var(--text-hi)',
  },

  subtitle: {
    margin: '8px 0 0',
    color: 'var(--text-mid)',
    fontSize: 13.5,
    lineHeight: 1.5,
  },

  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: 17,
  },

  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: 7,
  },

  contactSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: 9,
  },

  label: {
    fontSize: 12,
    fontWeight: 700,
    color: 'var(--text-mid)',
  },

  inputWrapper: {
    width: '100%',
    height: 46,
    display: 'flex',
    alignItems: 'center',
    boxSizing: 'border-box',
    background: 'rgba(0,0,0,0.18)',
    border: '1px solid var(--border)',
    borderRadius: 11,
    transition: 'all 0.2s ease',
  },

  inputIcon: {
    width: 40,
    textAlign: 'center',
    color: 'var(--text-mid)',
    fontSize: 13,
    flexShrink: 0,
  },

  input: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'var(--text-hi)',
    fontSize: 14,
    padding: '0 12px 0 0',
    fontFamily: 'inherit',
  },

  passwordButton: {
    border: 'none',
    background: 'transparent',
    color: 'var(--accent)',
    fontSize: 11,
    fontWeight: 700,
    cursor: 'pointer',
    padding: '8px 12px',
  },

  tabs: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: 6,
    padding: 4,
    borderRadius: 10,
    background: 'rgba(0,0,0,0.15)',
    border: '1px solid var(--border)',
  },

  tab: {
    border: 'none',
    borderRadius: 10,
    background: 'transparent',
    color: 'var(--text-mid)',
    padding: '9px 8px',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: 600,
    transition: 'all 0.2s ease',
  },

  tabActive: {
    background: 'rgba(45,212,191,0.12)',
    color: 'var(--accent)',
  },

  passwordHint: {
    fontSize: 10.5,
    color: 'var(--text-mid)',
    marginTop: 1,
  },

  error: {
    display: 'flex',
    alignItems: 'center',
    gap: 9,
    color: 'var(--danger)',
    fontSize: 12,
    background: 'rgba(240,101,79,0.08)',
    border: '1px solid rgba(240,101,79,0.16)',
    padding: '10px 12px',
    borderRadius: 13,
  },

  errorIcon: {
    width: 18,
    height: 18,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(240,101,79,0.15)',
    fontWeight: 800,
    flexShrink: 0,
  },

  submit: {
    marginTop: 3,
    width: '100%',
    height: 48,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    border: 'none',
    borderRadius: 11,
    background:
      'var(--accent-gradient)',
    color: '#04211e',
    fontSize: 13.5,
    fontWeight: 800,
    cursor: 'pointer',
    boxShadow:
      '0 8px 25px rgba(45,212,191,0.18)',
    transition: 'all 0.2s ease',
  },

  submitLoading: {
    opacity: 0.7,
    cursor: 'wait',
  },

  arrow: {
    fontSize: 18,
    lineHeight: 1,
  },

  spinner: {
    width: 14,
    height: 14,
    border: '2px solid rgba(4,33,30,0.3)',
    borderTopColor: '#04211e',
    borderRadius: '50%',
    display: 'inline-block',
    animation: 'spin 0.7s linear infinite',
  },

  switchArea: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    marginTop: 24,
    paddingTop: 20,
    borderTop: '1px solid rgba(255,255,255,0.06)',
  },

  switchText: {
    fontSize: 12,
    color: 'var(--text-mid)',
  },

  switchButton: {
    border: 'none',
    background: 'transparent',
    color: 'var(--accent)',
    fontSize: 12,
    fontWeight: 700,
    cursor: 'pointer',
    padding: 0,
  },

  footer: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 20,
    color: 'var(--text-mid)',
    fontSize: 10.5,
    opacity: 0.7,
  },

  footerDot: {
    opacity: 0.5,
  },
};