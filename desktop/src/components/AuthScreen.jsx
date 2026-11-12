import React, { useState } from 'react';
import { createApiClient } from '../api';
import { ArrowLeftIcon, MailIcon, ArrowRightIcon, UserIcon, LockIcon, EyeIcon, EyeOffIcon, AlertIcon } from './Icons';
import logo from '../assets/logo.png';

// Estrelinhas do fundo (posição fixa pra não "pular" a cada render)
const STARS = [
  [26, 14, 3], [22, 27, 2], [12, 62, 2], [72, 9, 2], [93, 34, 3], [79, 52, 2], [95, 52, 2],
  [74, 79, 2], [8, 88, 2], [55, 6, 1.5], [40, 92, 1.5], [88, 92, 1.5], [62, 70, 1.5], [33, 46, 1.5],
];

export default function AuthScreen({ onAuth, onCancel }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const isLogin = mode === 'login';

  function validate() {
    if (!username.trim()) return isLogin ? 'Digite seu usuário ou email.' : 'Escolha um nome de usuário.';
    if (password.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
    if (!isLogin) {
      if (!email.trim()) return 'Digite seu email.';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Digite um email válido.';
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
      const payload = { username: username.trim(), password };
      if (!isLogin) payload.email = email.trim();
      const { data } = await api.post(isLogin ? '/auth/login' : '/auth/register', payload);
      // No cadastro vem também o estado da verificação (e, sem SMTP, o código de dev)
      onAuth(data.token, data.user, data.verification);
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.message || 'Não foi possível conectar ao servidor.');
    } finally {
      setLoading(false);
    }
  }

  function changeMode() {
    setMode(isLogin ? 'register' : 'login');
    setError('');
  }

  return (
    <div style={styles.page}>
      <SpaceBackground />

      <div style={styles.container}>
        {/* MARCA */}
        <div style={styles.brand}>
          <div style={styles.logoWrap}>
            <img src={logo} alt="SafeCord" style={styles.logo} draggable={false} />
          </div>
          <div style={styles.brandName}>SafeCord</div>
          <div style={styles.brandSub}>Conecte. Converse. Compartilhe.</div>
        </div>

        {/* CARD */}
        <div style={styles.card}>
          {onCancel && (
            <button type="button" style={styles.backLink} onClick={onCancel}>
              <ArrowLeftIcon size={12} /> Voltar
            </button>
          )}

          <h1 style={styles.title}>{isLogin ? 'Bem-vindo de volta' : 'Crie sua conta'}</h1>
          <p style={styles.subtitle}>
            {onCancel
              ? 'Entre com outra conta SafeCord — a atual continua salva.'
              : isLogin
                ? 'Entre na sua conta para continuar.'
                : 'Leva menos de um minuto. Bora!'}
          </p>

          <form onSubmit={submit} style={styles.form} noValidate>
            <Field label="Usuário">
              <InputShell icon={<UserIcon size={17} />}>
                <input
                  style={styles.input}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={isLogin ? 'usuario, usuario#0000 ou email' : 'seuusuario'}
                  autoComplete="username"
                  autoFocus
                />
              </InputShell>
            </Field>

            {!isLogin && (
              <Field label="Email" hint="Mandamos um código pra confirmar que é seu.">
                <InputShell icon={<MailIcon size={16} />}>
                  <input
                    style={styles.input}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="seuemail@gmail.com"
                    autoComplete="email"
                  />
                </InputShell>
              </Field>
            )}

            <Field label="Senha" hint={!isLogin ? 'Pelo menos 6 caracteres.' : null}>
              <InputShell icon={<LockIcon size={17} />}>
                <input
                  style={styles.input}
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={isLogin ? 'Digite sua senha' : 'Crie uma senha'}
                  autoComplete={isLogin ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  style={styles.eyeBtn}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  title={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOffIcon size={18} /> : <EyeIcon size={18} />}
                </button>
              </InputShell>
            </Field>

            {error && (
              <div style={styles.error} role="alert">
                <AlertIcon size={15} style={{ flexShrink: 0 }} />
                <span>{error}</span>
              </div>
            )}

            <button
              className="sc-auth-submit"
              style={{ ...styles.submit, ...(loading ? styles.submitLoading : {}) }}
              disabled={loading}
              type="submit"
            >
              {loading ? (
                <>
                  <span style={styles.spinner} />
                  {isLogin ? 'Entrando…' : 'Criando conta…'}
                </>
              ) : (
                <>
                  {isLogin ? 'Entrar na conta' : 'Criar minha conta'}
                  <ArrowRightIcon size={17} />
                </>
              )}
            </button>
          </form>

          <div style={styles.divider}>
            <span style={styles.dividerLine} />
            <span style={styles.dividerText}>ou</span>
            <span style={styles.dividerLine} />
          </div>

          <div style={styles.switchArea}>
            <span>{isLogin ? 'Ainda não possui uma conta?' : 'Já possui uma conta?'}</span>
            <button type="button" style={styles.switchButton} onClick={changeMode}>
              {isLogin ? 'Criar agora' : 'Entrar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={styles.field}>
      <label style={styles.label}>{label}</label>
      {children}
      {hint && <div style={styles.hint}>{hint}</div>}
    </div>
  );
}

function InputShell({ icon, children }) {
  return (
    <div className="sc-auth-input" style={styles.inputShell}>
      <span style={styles.inputIcon}>{icon}</span>
      {children}
    </div>
  );
}

// Fundo "espacial": planetas com borda azul brilhante, órbitas e estrelas
export function SpaceBackground() {
  return (
    <div style={styles.bg} aria-hidden="true">
      <div style={styles.vignette} />

      {/* planeta grande, canto superior esquerdo */}
      <div style={{ ...styles.planet, width: 340, height: 340, left: -150, top: -120 }} />
      <div style={{ ...styles.orbit, width: 520, height: 520, left: -250, top: -260 }} />

      {/* planeta grande, canto inferior direito */}
      <div style={{ ...styles.planet, width: 460, height: 460, right: -170, bottom: -230 }} />
      <div style={{ ...styles.orbit, width: 760, height: 760, right: -330, bottom: -420, transform: 'rotate(-18deg)' }} />

      {/* lua pequena flutuando */}
      <div style={{ ...styles.planet, width: 54, height: 54, right: '15%', top: '45%', animation: 'sc-float 7s ease-in-out infinite', boxShadow: 'inset -6px -6px 14px rgba(0,0,0,0.5), inset 3px 3px 10px rgba(80,150,255,0.3), 0 0 18px rgba(30,123,255,0.35)' }} />

      {STARS.map(([x, y, size], i) => (
        <span
          key={i}
          style={{
            ...styles.star,
            left: `${x}%`,
            top: `${y}%`,
            width: size,
            height: size,
            animation: `sc-twinkle ${3 + (i % 4)}s ease-in-out ${(i % 5) * 0.6}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

const styles = {
  page: {
    minHeight: '100%',
    height: '100%',
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 20px',
    boxSizing: 'border-box',
    background: 'radial-gradient(ellipse at 50% 40%, #0E1A33 0%, #08101F 45%, #050A14 100%)',
    color: '#EEF3FB',
    overflowY: 'auto',
  },

  // fundo
  bg: { position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' },
  vignette: {
    position: 'absolute', inset: 0,
    background: 'radial-gradient(circle at 50% 55%, rgba(30,123,255,0.10), transparent 45%)',
  },
  planet: {
    position: 'absolute',
    borderRadius: '50%',
    background: 'radial-gradient(circle at 35% 30%, #1B3B78 0%, #0F2550 45%, #0A1630 75%)',
    boxShadow: 'inset -12px -10px 40px rgba(0,0,0,0.55), inset 6px 6px 30px rgba(80,150,255,0.25), 0 0 60px rgba(30,123,255,0.25)',
    border: '1px solid rgba(90,160,255,0.35)',
  },
  orbit: {
    position: 'absolute',
    borderRadius: '50%',
    border: '1px solid rgba(90,160,255,0.14)',
  },
  star: {
    position: 'absolute',
    borderRadius: '50%',
    background: '#4C9BFF',
    boxShadow: '0 0 8px rgba(76,155,255,0.9)',
  },

  container: { position: 'relative', zIndex: 2, width: '100%', maxWidth: 412, margin: 'auto' },

  // marca
  brand: { display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 22 },
  logoWrap: {
    width: 76, height: 76, borderRadius: '50%', marginBottom: 14,
    boxShadow: '0 0 0 1px rgba(120,180,255,0.25), 0 10px 40px rgba(30,123,255,0.55), 0 0 90px rgba(30,123,255,0.35)',
  },
  logo: { width: '100%', height: '100%', borderRadius: '50%', display: 'block' },
  brandName: { fontSize: 32, fontWeight: 800, letterSpacing: -0.8, color: '#FFFFFF', lineHeight: 1.1 },
  brandSub: { fontSize: 14.5, color: '#9FB0CC', marginTop: 6 },

  // card de vidro
  card: {
    position: 'relative',
    background: 'linear-gradient(180deg, rgba(22,34,58,0.72), rgba(12,20,38,0.78))',
    backdropFilter: 'blur(18px)',
    WebkitBackdropFilter: 'blur(18px)',
    border: '1px solid rgba(80,150,255,0.35)',
    borderRadius: 22,
    padding: '32px 32px 26px',
    boxShadow: '0 0 0 1px rgba(30,123,255,0.06), 0 0 50px rgba(30,123,255,0.22), 0 30px 80px rgba(0,0,0,0.5)',
  },
  backLink: {
    display: 'inline-flex', alignItems: 'center', gap: 5, border: 'none', background: 'transparent',
    color: '#9FB0CC', fontSize: 12.5, cursor: 'pointer', padding: 0, marginBottom: 14,
  },
  title: { margin: 0, fontSize: 25, fontWeight: 750, letterSpacing: -0.5, color: '#FFFFFF' },
  subtitle: { margin: '8px 0 0', fontSize: 14.5, color: '#93A3BF', lineHeight: 1.45 },

  form: { display: 'flex', flexDirection: 'column', gap: 18, marginTop: 26 },
  field: { display: 'flex', flexDirection: 'column', gap: 9 },
  label: { fontSize: 13.5, fontWeight: 600, color: '#D5DEEC' },
  hint: { fontSize: 12, color: '#7F90AE', paddingLeft: 2 },

  inputShell: {
    height: 50,
    display: 'flex',
    alignItems: 'center',
    background: 'rgba(8,14,28,0.55)',
    border: '1px solid rgba(110,140,190,0.22)',
    borderRadius: 13,
    transition: 'border-color 0.15s ease, box-shadow 0.15s ease',
  },
  inputIcon: { width: 46, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8C9CB8', flexShrink: 0 },
  input: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: '#EEF3FB',
    fontSize: 14.5,
    fontFamily: 'inherit',
    paddingRight: 14,
  },
  eyeBtn: {
    width: 46, height: '100%', border: 'none', background: 'transparent', color: '#8C9CB8',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  },

  error: {
    display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, color: '#FF8A8E',
    background: 'rgba(242,85,90,0.10)', border: '1px solid rgba(242,85,90,0.28)',
    borderRadius: 12, padding: '10px 12px',
  },

  submit: {
    marginTop: 4,
    height: 52,
    border: 'none',
    borderRadius: 14,
    background: 'linear-gradient(180deg, #3D93FF 0%, #1E7BFF 55%, #1468E6 100%)',
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: 650,
    fontFamily: 'inherit',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    boxShadow: '0 0 0 1px rgba(120,180,255,0.35) inset, 0 10px 30px rgba(30,123,255,0.45), 0 0 40px rgba(30,123,255,0.25)',
    transition: 'filter 0.15s ease, transform 0.12s ease',
  },
  submitLoading: { opacity: 0.8, cursor: 'wait' },
  spinner: {
    width: 15, height: 15, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.35)',
    borderTopColor: '#FFFFFF', animation: 'sc-spin 0.7s linear infinite',
  },

  divider: { display: 'flex', alignItems: 'center', gap: 12, margin: '24px 0 16px' },
  dividerLine: { flex: 1, height: 1, background: 'rgba(110,140,190,0.18)' },
  dividerText: { fontSize: 12, color: '#6F80A0' },

  switchArea: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, fontSize: 13.5, color: '#93A3BF', flexWrap: 'wrap' },
  switchButton: {
    border: 'none', background: 'transparent', color: '#3D93FF', fontSize: 13.5, fontWeight: 650,
    cursor: 'pointer', padding: 0, fontFamily: 'inherit',
  },
};
