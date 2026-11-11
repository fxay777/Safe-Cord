import React from 'react';
import { AlertIcon } from './Icons';

// Sem isso, um erro de render em QUALQUER componente derruba a árvore React inteira —
// o app vira uma tela preta e parece que "tudo" quebrou, mesmo o problema sendo em uma
// única tela. Com isso, o crash fica contido: só aquela parte mostra o erro.
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('SafeCord — erro capturado pelo ErrorBoundary:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={styles.wrap}>
          <div style={styles.card}>
            <div style={styles.icon}><AlertIcon size={26} /></div>
            <h2 style={styles.title}>Essa parte da tela deu erro</h2>
            <p style={styles.message}>
              {this.props.label ? `Falhou em: ${this.props.label}. ` : ''}
              O resto do app continua funcionando — clique abaixo pra tentar de novo.
            </p>
            <pre style={styles.details}>{String(this.state.error?.message || this.state.error)}</pre>
            <button style={styles.button} onClick={() => this.setState({ error: null })}>
              Tentar novamente
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const styles = {
  wrap: {
    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: 24, background: 'var(--bg-void)', height: '100%', width: '100%',
  },
  card: {
    maxWidth: 420, textAlign: 'center', background: 'var(--bg-surface)',
    border: '1px solid var(--border)', borderRadius: 20, padding: '28px 24px',
  },
  icon: {
    width: 52, height: 52, margin: '0 auto 12px', borderRadius: 16, display: 'flex',
    alignItems: 'center', justifyContent: 'center', color: 'var(--danger)', background: 'rgba(240,101,79,0.12)',
  },
  title: { color: 'var(--text-hi)', fontSize: 17, margin: '0 0 8px' },
  message: { color: 'var(--text-mid)', fontSize: 13, lineHeight: 1.5, margin: '0 0 12px' },
  details: {
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 10,
    padding: '8px 10px', fontSize: 11, color: 'var(--danger)', textAlign: 'left',
    overflowX: 'auto', marginBottom: 16, whiteSpace: 'pre-wrap',
  },
  button: {
    background: 'var(--accent)', color: 'var(--accent-contrast, #052622)', border: 'none',
    borderRadius: 14, padding: '9px 18px', fontWeight: 700, fontSize: 13, cursor: 'pointer',
  },
};
