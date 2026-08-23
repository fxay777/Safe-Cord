import React, { useEffect, useRef, useState } from 'react';
import { resolveAssetUrl } from '../api';
import { SearchIcon, BellIcon, SmileyIcon, ArrowUpIcon } from './Icons';

export default function ChatView({
  channel,
  messages = [],
  onSend,
  typingUsers = [],
  isDM = false,
}) {
  const [text, setText] = useState('');
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages]);

  if (!channel) {
    return (
      <div style={styles.empty}>
        <div style={styles.emptyIcon}>#</div>
        <h2 style={styles.emptyTitle}>Nenhum canal selecionado</h2>
        <p style={styles.emptyText}>
          Selecione um canal ao lado para começar a conversar.
        </p>
      </div>
    );
  }

  function submit(e) {
    e.preventDefault();

    const value = text.trim();

    if (!value) return;

    onSend(value);
    setText('');

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(e);
    }
  }

  function handleInput(e) {
    setText(e.target.value);

    const textarea = e.target;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  }

  return (
    <div style={styles.wrap}>

      {/* HEADER */}
      <header style={styles.header}>
        <div style={styles.channelIcon}>{isDM ? '@' : '#'}</div>

        <div style={styles.headerInfo}>
          <div style={styles.channelName}>
            {channel.name}
          </div>

          <div style={styles.channelDescription}>
            {isDM ? 'Conversa direta' : 'Converse com os membros deste canal'}
          </div>
        </div>

        <div style={styles.headerActions}>
          <button
            type="button"
            style={styles.headerButton}
            title="Pesquisar"
          >
            <SearchIcon size={16} />
          </button>

          <button
            type="button"
            style={styles.headerButton}
            title="Notificações"
          >
            <BellIcon size={16} />
          </button>
        </div>
      </header>

      {/* MESSAGES */}
      <main style={styles.messages}>
        {messages.length === 0 ? (
          <div style={styles.welcome}>
            <div style={styles.welcomeIcon}>
              {isDM ? '@' : '#'}
            </div>

            <h2 style={styles.welcomeTitle}>
              {isDM ? `Início da conversa com ${channel.name}` : `Bem-vindo ao #${channel.name}!`}
            </h2>

            <p style={styles.welcomeText}>
              {isDM ? 'Esta é a primeira mensagem entre vocês dois.' : 'Este é o começo deste canal. Envie uma mensagem e comece a conversa.'}
            </p>
          </div>
        ) : (
          messages.map((m, i) => {
            const prev = messages[i - 1];
            const authorName = m.display_name || m.username || 'Usuário';
            const initials = (authorName || '?')
              .split(' ')
              .map((part) => part[0])
              .join('')
              .slice(0, 2)
              .toUpperCase();

            const grouped =
              prev &&
              prev.author_id === m.author_id &&
              new Date(m.created_at) -
                new Date(prev.created_at) <
                5 * 60 * 1000;

            const showDate =
              !prev ||
              !isSameDay(
                new Date(prev.created_at),
                new Date(m.created_at)
              );

            return (
              <React.Fragment key={m.id}>

                {showDate && (
                  <DateDivider date={m.created_at} />
                )}

                <div
                  style={styles.msgRow(grouped)}
                  className="chat-message"
                >
                  {!grouped ? (
                    m.avatar_url ? (
                      <img src={resolveAssetUrl(m.avatar_url)} alt={authorName} style={styles.avatarImage} />
                    ) : (
                      <div style={styles.avatar(m.avatar_color)}>
                        {initials || '?'}
                      </div>
                    )
                  ) : (
                    <div style={styles.groupTime}>
                      {formatTime(m.created_at)}
                    </div>
                  )}

                  <div style={styles.messageBody}>
                    {!grouped && (
                      <div style={styles.authorLine}>
                        <span style={styles.author}>
                          {authorName}
                        </span>

                        <span style={styles.time}>
                          {formatTime(m.created_at)}
                        </span>
                      </div>
                    )}

                    <div style={styles.content}>
                      {m.content}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}

        <div ref={bottomRef} />
      </main>

      {/* TYPING */}
      <div style={styles.typingContainer}>
        {typingUsers.length > 0 && (
          <>
            <div style={styles.typingDots}>
              <span />
              <span />
              <span />
            </div>

            <span>
              {formatTypingUsers(typingUsers)}
            </span>
          </>
        )}
      </div>

      {/* INPUT */}
      <div style={styles.inputContainer}>
        <form
          onSubmit={submit}
          style={styles.inputBox}
        >
          <button
            type="button"
            style={styles.inputAction}
            title="Adicionar arquivo"
          >
            +
          </button>

          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={isDM ? `Conversar com ${channel.name}` : `Conversar em #${channel.name}`}
            rows={1}
            style={styles.textarea}
          />

          <button
            type="button"
            style={styles.inputAction}
            title="Emoji"
          >
            <SmileyIcon size={18} />
          </button>

          <button
            type="submit"
            disabled={!text.trim()}
            style={{
              ...styles.sendButton,
              ...(text.trim()
                ? styles.sendButtonActive
                : {}),
            }}
            title="Enviar mensagem"
          >
            <ArrowUpIcon size={16} />
          </button>
        </form>

        <div style={styles.inputHint}>
          <span>
            Pressione <strong>Enter</strong> para enviar
          </span>

          <span>
            <strong>Shift + Enter</strong> para nova linha
          </span>
        </div>
      </div>
    </div>
  );
}

/* =========================
   DATE DIVIDER
========================= */

function DateDivider({ date }) {
  return (
    <div style={styles.dateDivider}>
      <div style={styles.dateLine} />

      <span style={styles.dateText}>
        {formatDate(date)}
      </span>

      <div style={styles.dateLine} />
    </div>
  );
}

/* =========================
   FORMATTERS
========================= */

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString(
    'pt-BR',
    {
      hour: '2-digit',
      minute: '2-digit',
    }
  );
}

function formatDate(ts) {
  const date = new Date(ts);
  const today = new Date();

  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (isSameDay(date, today)) {
    return 'Hoje';
  }

  if (isSameDay(date, yesterday)) {
    return 'Ontem';
  }

  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function isSameDay(a, b) {
  return (
    a.getDate() === b.getDate() &&
    a.getMonth() === b.getMonth() &&
    a.getFullYear() === b.getFullYear()
  );
}

function formatTypingUsers(users) {
  if (users.length === 1) {
    return `${users[0]} está digitando...`;
  }

  if (users.length === 2) {
    return `${users[0]} e ${users[1]} estão digitando...`;
  }

  return `${users.length} pessoas estão digitando...`;
}

/* =========================
   STYLES
========================= */

const styles = {
  wrap: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-void)',
    position: 'relative',
  },

  /* EMPTY */

  empty: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    padding: 30,
    background:
      'radial-gradient(circle at center, rgba(45,212,191,0.05), transparent 45%)',
  },

  emptyIcon: {
    width: 70,
    height: 70,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    color: 'var(--accent)',
    fontSize: 36,
    fontWeight: 800,
    marginBottom: 18,
  },

  emptyTitle: {
    margin: 0,
    color: 'var(--text-hi)',
    fontSize: 20,
  },

  emptyText: {
    marginTop: 8,
    color: 'var(--text-low)',
    fontSize: 13,
  },

  /* HEADER */

  header: {
    height: 58,
    minHeight: 58,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 18px',
    background: 'rgba(10,14,19,0.78)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderBottom: '1px solid var(--border)',
    boxShadow: '0 1px 10px rgba(0,0,0,0.12)',
    zIndex: 5,
  },

  channelIcon: {
    color: 'var(--text-mid)',
    fontSize: 23,
    fontWeight: 700,
  },

  headerInfo: {
    flex: 1,
    minWidth: 0,
  },

  channelName: {
    color: 'var(--text-hi)',
    fontSize: 14,
    fontWeight: 750,
  },

  channelDescription: {
    marginTop: 2,
    color: 'var(--text-low)',
    fontSize: 10.5,
  },

  headerActions: {
    display: 'flex',
    gap: 5,
  },

  headerButton: {
    width: 34,
    height: 34,
    border: 'none',
    borderRadius: 8,
    background: 'transparent',
    color: 'var(--text-mid)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  },

  /* MESSAGES */

  messages: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '18px 20px 8px',
    scrollbarWidth: 'thin',
    scrollbarColor:
      'var(--border) transparent',
  },

  welcome: {
    padding: '35px 8px 25px',
    borderBottom: '1px solid var(--border)',
    marginBottom: 12,
  },

  welcomeIcon: {
    width: 54,
    height: 54,
    borderRadius: 16,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    color: 'var(--accent)',
    fontSize: 30,
    fontWeight: 800,
    marginBottom: 15,
  },

  welcomeTitle: {
    margin: 0,
    fontSize: 21,
    color: 'var(--text-hi)',
    letterSpacing: -0.4,
  },

  welcomeText: {
    maxWidth: 470,
    margin: '8px 0 0',
    color: 'var(--text-low)',
    fontSize: 13,
    lineHeight: 1.5,
  },

  msgRow: (grouped) => ({
    position: 'relative',
    display: 'flex',
    gap: 12,
    marginTop: grouped ? 2 : 15,
    padding: grouped
      ? '1px 6px'
      : '3px 6px',
    borderRadius: 7,
    transition: 'background 0.12s ease',
  }),

  avatar: (color) => ({
    width: 38,
    height: 38,
    minWidth: 38,
    borderRadius: 12,
    background:
      color ||
      'var(--accent-gradient)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 800,
    fontSize: 14,
    color: '#071311',
    boxShadow:
      '0 4px 12px rgba(0,0,0,0.18)',
  }),

  avatarImage: {
    width: 38,
    height: 38,
    minWidth: 38,
    borderRadius: 12,
    objectFit: 'cover',
    display: 'block',
    border: '1px solid rgba(255,255,255,0.12)',
    boxShadow: '0 4px 12px rgba(0,0,0,0.18)',
  },

  groupTime: {
    width: 38,
    minWidth: 38,
    textAlign: 'center',
    color: 'var(--text-low)',
    fontSize: 9,
    paddingTop: 4,
    opacity: 0,
  },

  messageBody: {
    minWidth: 0,
    flex: 1,
  },

  authorLine: {
    display: 'flex',
    alignItems: 'baseline',
    gap: 8,
    marginBottom: 2,
  },

  author: {
    color: 'var(--text-hi)',
    fontSize: 13.5,
    fontWeight: 750,
  },

  time: {
    color: 'var(--text-low)',
    fontSize: 10.5,
  },

  content: {
    color: 'var(--text-hi)',
    fontSize: 13.5,
    lineHeight: 1.55,
    wordBreak: 'break-word',
    whiteSpace: 'pre-wrap',
  },

  /* DATE */

  dateDivider: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    margin: '22px 0 8px',
  },

  dateLine: {
    flex: 1,
    height: 1,
    background: 'var(--border)',
  },

  dateText: {
    color: 'var(--text-low)',
    fontSize: 10.5,
    fontWeight: 700,
    whiteSpace: 'nowrap',
  },

  /* TYPING */

  typingContainer: {
    height: 20,
    minHeight: 20,
    display: 'flex',
    alignItems: 'center',
    gap: 7,
    padding: '0 22px',
    color: 'var(--text-low)',
    fontSize: 10.5,
  },

  typingDots: {
    display: 'flex',
    gap: 2,
    alignItems: 'center',
  },

  /* INPUT */

  inputContainer: {
    padding: '4px 18px 15px',
    background:
      'linear-gradient(to bottom, transparent, var(--bg-void) 25%)',
  },

  inputBox: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 4,
    minHeight: 48,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 13,
    padding: '5px 6px 5px 8px',
    boxShadow:
      '0 8px 30px rgba(0,0,0,0.16)',
  },

  inputAction: {
    width: 36,
    height: 36,
    flexShrink: 0,
    border: 'none',
    borderRadius: 9,
    background: 'transparent',
    color: 'var(--text-mid)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.15s ease',
  },

  textarea: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    maxHeight: 140,
    resize: 'none',
    border: 'none',
    outline: 'none',
    background: 'transparent',
    color: 'var(--text-hi)',
    fontSize: 13.5,
    lineHeight: 1.45,
    padding: '9px 5px',
    fontFamily: 'inherit',
    overflowY: 'auto',
  },

  sendButton: {
    width: 36,
    height: 36,
    flexShrink: 0,
    border: 'none',
    borderRadius: 9,
    background: 'rgba(255,255,255,0.04)',
    color: 'var(--text-low)',
    fontWeight: 700,
    cursor: 'default',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    transition: 'all 0.2s ease',
  },

  sendButtonActive: {
    background: 'var(--accent)',
    color: 'var(--accent-contrast)',
    cursor: 'pointer',
    boxShadow:
      '0 5px 15px rgba(45,212,191,0.18)',
  },

  inputHint: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 4px 0',
    color: 'var(--text-low)',
    fontSize: 9.5,
    opacity: 0.7,
  },
};