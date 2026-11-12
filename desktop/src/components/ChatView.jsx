import React, { useEffect, useRef, useState } from 'react';
import { resolveAssetUrl } from '../api';
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react';
import BadgeRow from './BadgeRow';
import { SearchIcon, SmileyIcon, EditIcon, LeaveIcon, UserPlusIcon, ImageIcon, SendIcon, PlusIcon, CheckIcon, CloseIcon } from './Icons';
import logo from '../assets/logo.png';
import { EmptyChannelArt, EmptyMessagesArt } from './EmptyStateArt';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB: cobre imagem e vídeo curto

export default function ChatView({
  channel,
  messages = [],
  onSend,
  onTyping,
  onUploadAttachment,
  typingUsers = [],
  isDM = false,
  onRenameGroup,
  onLeaveGroup,
  serverName,
  inviteCode,
  canEditTopic = false,
  onUpdateTopic,
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [topicDraft, setTopicDraft] = useState(null); // null = não está editando
  const [inviteCopied, setInviteCopied] = useState(false);
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState([]); // [{tempId,url,name,size,type,previewUrl,uploading}]
  const [uploadError, setUploadError] = useState('');
  const [emojiOpen, setEmojiOpen] = useState(false);
  const bottomRef = useRef(null);
  const textareaRef = useRef(null);
  const fileInputRef = useRef(null);
  const emojiWrapRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: 'smooth',
    });
  }, [messages]);

  // Fecha o seletor de emoji ao clicar fora
  useEffect(() => {
    if (!emojiOpen) return;
    function onClickOutside(e) {
      if (emojiWrapRef.current && !emojiWrapRef.current.contains(e.target)) setEmojiOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [emojiOpen]);

  // Limpa o rascunho ao trocar de canal/conversa
  useEffect(() => {
    setText('');
    setAttachments([]);
    setUploadError('');
    setEmojiOpen(false);
    setSearchQuery('');
    setTopicDraft(null);
  }, [channel?.id]);

  if (!channel) {
    return (
      <div style={styles.empty}>
        <EmptyChannelArt />
        <h2 style={styles.emptyTitle}>Nenhum canal selecionado</h2>
        <p style={styles.emptyText}>
          Selecione um canal ao lado para começar a conversar.
        </p>
      </div>
    );
  }

  const query = searchQuery.trim().toLowerCase();
  const visibleMessages = query
    ? messages.filter((m) => (m.content || '').toLowerCase().includes(query)
      || (m.display_name || m.username || '').toLowerCase().includes(query))
    : messages;

  function submit(e) {
    e.preventDefault();

    const value = text.trim();
    const ready = attachments.filter((a) => !a.uploading && a.url);

    if (!value && ready.length === 0) return;

    onSend(value, ready.map((a) => ({
      url: a.url, name: a.name, size: a.size, width: a.width, height: a.height, type: a.type,
    })));
    setText('');
    setAttachments([]);

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }

  function insertEmoji(emojiData) {
    const emoji = emojiData.emoji;
    const el = textareaRef.current;
    if (!el) { setText((prev) => prev + emoji); return; }
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    setText(text.slice(0, start) + emoji + text.slice(end));
    setTimeout(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + emoji.length;
    }, 0);
  }

  async function handleFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // deixa escolher o mesmo arquivo de novo depois
    setUploadError('');

    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      if (!isImage && !isVideo) { setUploadError('Só imagens e vídeos por enquanto.'); continue; }
      if (file.size > MAX_ATTACHMENT_BYTES) { setUploadError('Arquivo grande demais (máx. 25MB).'); continue; }
      if (!onUploadAttachment) { setUploadError('Upload indisponível nesta tela.'); continue; }

      const tempId = `${Date.now()}-${Math.random()}`;
      const previewUrl = URL.createObjectURL(file);
      setAttachments((prev) => [...prev, { tempId, name: file.name, previewUrl, type: file.type, uploading: true }]);

      try {
        const uploaded = await onUploadAttachment(file);
        setAttachments((prev) => prev.map((a) => (a.tempId === tempId ? { ...a, ...uploaded, uploading: false } : a)));
      } catch (err) {
        setUploadError(err?.response?.data?.error || 'Falha ao enviar o arquivo.');
        setAttachments((prev) => prev.filter((a) => a.tempId !== tempId));
      }
    }
  }

  function removeAttachment(key) {
    setAttachments((prev) => prev.filter((a) => a.tempId !== key && a.url !== key));
  }

  function renameGroup() {
    const next = window.prompt('Novo nome do grupo:', channel.name || '');
    if (next !== null) onRenameGroup?.(next.trim());
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(e);
    }
  }

  function handleInput(e) {
    setText(e.target.value);
    onTyping?.();

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
          <div style={styles.channelName}>{channel.name}</div>
          {topicDraft !== null ? (
            <form
              style={styles.topicForm}
              onSubmit={(e) => { e.preventDefault(); onUpdateTopic?.(topicDraft); setTopicDraft(null); }}
            >
              <input
                autoFocus
                value={topicDraft}
                maxLength={160}
                onChange={(e) => setTopicDraft(e.target.value)}
                onKeyDown={(e) => e.key === 'Escape' && setTopicDraft(null)}
                placeholder="Sobre o que é esse canal?"
                style={styles.topicInput}
              />
              <button type="submit" style={styles.topicSave} title="Salvar"><CheckIcon size={13} /></button>
            </form>
          ) : (
            <div
              style={{ ...styles.channelDescription, cursor: canEditTopic && !isDM ? 'pointer' : 'default' }}
              title={canEditTopic && !isDM ? 'Clique pra editar a descrição' : undefined}
              onClick={() => canEditTopic && !isDM && setTopicDraft(channel.topic || '')}
            >
              {channel.isGroup
                ? `${channel.memberCount} membros`
                : isDM
                  ? 'Conversa direta'
                  : channel.topic || (canEditTopic ? 'Adicionar uma descrição ao canal' : 'Converse sobre qualquer assunto com a comunidade.')}
            </div>
          )}
        </div>

        <div style={styles.headerActions}>
          {channel.isGroup && onRenameGroup && (
            <button type="button" className="sc-icon-btn" style={styles.headerButton} title="Renomear grupo" onClick={renameGroup}>
              <EditIcon size={15} />
            </button>
          )}
          {channel.isGroup && onLeaveGroup && (
            <button type="button" className="sc-icon-btn" style={styles.headerButton} title="Sair do grupo" onClick={onLeaveGroup}>
              <LeaveIcon size={16} />
            </button>
          )}
          {!isDM && inviteCode && (
            <button
              type="button"
              className="sc-icon-btn"
              style={styles.headerButton}
              title={inviteCopied ? 'Convite copiado!' : `Convidar pessoas (copia #${inviteCode})`}
              onClick={() => {
                navigator.clipboard?.writeText(inviteCode);
                setInviteCopied(true);
                setTimeout(() => setInviteCopied(false), 1600);
              }}
            >
              {inviteCopied ? <CheckIcon size={16} /> : <UserPlusIcon size={17} />}
            </button>
          )}
          <label style={styles.searchBox}>
            <SearchIcon size={14} style={{ color: 'var(--text-low)', flexShrink: 0 }} />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Escape' && setSearchQuery('')}
              placeholder={serverName && !isDM ? `Buscar em ${serverName}…` : 'Buscar na conversa…'}
              style={styles.searchInput}
            />
            {searchQuery && (
              <button type="button" style={styles.searchClear} onClick={() => setSearchQuery('')} title="Limpar">
                <CloseIcon size={12} />
              </button>
            )}
          </label>
        </div>
      </header>

      {/* MESSAGES */}
      <main style={styles.messages}>
        {searchQuery.trim() && (
          <div style={styles.searchResultBar}>
            {visibleMessages.length === 0
              ? `Nada encontrado pra "${searchQuery.trim()}" nas mensagens carregadas`
              : `${visibleMessages.length} mensagem(ns) com "${searchQuery.trim()}"`}
          </div>
        )}

        {!isDM && !searchQuery.trim() && <ChannelWelcome channelName={channel.name} />}

        {messages.length === 0 && !isDM ? null : messages.length === 0 ? (
          <div style={styles.welcome}>
            <EmptyMessagesArt />

            <h2 style={styles.welcomeTitle}>
              {isDM ? `Início da conversa com ${channel.name}` : `Bem-vindo ao #${channel.name}!`}
            </h2>

            <p style={styles.welcomeText}>
              {isDM ? 'Esta é a primeira mensagem entre vocês dois.' : 'Este é o começo deste canal. Envie uma mensagem e comece a conversa.'}
            </p>
          </div>
        ) : (
          visibleMessages.map((m, i) => {
            const prev = visibleMessages[i - 1];
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

                        {m.badges?.length > 0 && <BadgeRow badges={m.badges} size={14} max={3} />}

                        <span style={styles.time}>
                          {formatTime(m.created_at)}
                        </span>
                      </div>
                    )}

                    {m.content && (
                      <div style={styles.content}>
                        {m.content}
                      </div>
                    )}

                    {m.attachments?.length > 0 && (
                      <div style={styles.attachmentGrid}>
                        {m.attachments.map((att, idx) => (
                          att.type?.startsWith('video/') ? (
                            <video
                              key={idx}
                              src={resolveAssetUrl(att.url)}
                              controls
                              style={styles.attachmentVideo}
                            />
                          ) : (
                            <a key={idx} href={resolveAssetUrl(att.url)} target="_blank" rel="noreferrer">
                              <img
                                src={resolveAssetUrl(att.url)}
                                alt={att.name || 'imagem'}
                                style={styles.attachmentImage}
                                loading="lazy"
                              />
                            </a>
                          )
                        ))}
                      </div>
                    )}
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

      {/* ANEXOS PENDENTES */}
      {(attachments.length > 0 || uploadError) && (
        <div style={styles.attachmentBar}>
          {uploadError && <div style={styles.uploadError}>{uploadError}</div>}
          {attachments.map((a) => (
            <div key={a.tempId || a.url} style={styles.attachmentCard}>
              {a.type?.startsWith('video/') ? (
                <video src={a.previewUrl || resolveAssetUrl(a.url)} style={styles.attachmentThumb} muted />
              ) : (
                <img src={a.previewUrl || resolveAssetUrl(a.url)} alt={a.name} style={styles.attachmentThumb} />
              )}
              {a.uploading && <div style={styles.attachmentUploading}>Enviando…</div>}
              <button
                type="button"
                style={styles.attachmentRemove}
                onClick={() => removeAttachment(a.tempId || a.url)}
                title="Remover"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* INPUT */}
      <div style={styles.inputContainer}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          style={{ display: 'none' }}
          onChange={handleFilesSelected}
        />
        <button
          type="button"
          className="sc-icon-btn"
          style={styles.plusButton}
          title="Anexar imagem ou vídeo"
          onClick={() => fileInputRef.current?.click()}
        >
          <PlusIcon size={18} />
        </button>

        <form onSubmit={submit} style={styles.inputBox}>
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder={isDM ? `Escreva para ${channel.name}` : `Escreva em #${channel.name}`}
            rows={1}
            style={styles.textarea}
          />

          <div ref={emojiWrapRef} style={{ position: 'relative' }}>
            <button
              type="button"
              className="sc-icon-btn"
              style={styles.inputAction}
              title="Emoji"
              onClick={() => setEmojiOpen((v) => !v)}
            >
              <SmileyIcon size={18} />
            </button>
            {emojiOpen && (
              <div style={styles.emojiPickerWrap}>
                <EmojiPicker
                  onEmojiClick={insertEmoji}
                  theme={document.documentElement.getAttribute('data-mode') === 'light' ? EmojiTheme.LIGHT : EmojiTheme.DARK}
                  height={360}
                  width={320}
                />
              </div>
            )}
          </div>

          <button
            type="button"
            className="sc-icon-btn"
            style={styles.inputAction}
            title="Enviar imagem"
            onClick={() => fileInputRef.current?.click()}
          >
            <ImageIcon size={18} />
          </button>
        </form>

        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() && !attachments.some((a) => !a.uploading)}
          style={{
            ...styles.sendButton,
            opacity: (text.trim() || attachments.some((a) => !a.uploading)) ? 1 : 0.55,
          }}
          title="Enviar mensagem (Enter)"
        >
          <SendIcon size={18} />
        </button>
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

// Card de boas-vindas no começo de todo canal de texto (ilustração + texto), como na referência
function ChannelWelcome({ channelName }) {
  return (
    <div style={styles.channelWelcome}>
      <svg viewBox="0 0 300 150" style={styles.channelWelcomeArt} aria-hidden="true">
        <defs>
          <linearGradient id="scw-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#0B1630" />
            <stop offset="1" stopColor="#13254A" />
          </linearGradient>
          <radialGradient id="scw-moon" cx="0.4" cy="0.35" r="0.7">
            <stop offset="0" stopColor="#3B5C9A" />
            <stop offset="1" stopColor="#1B2E58" />
          </radialGradient>
        </defs>
        <rect width="300" height="150" fill="url(#scw-sky)" />
        <circle cx="205" cy="92" r="64" fill="url(#scw-moon)" opacity="0.9" />
        {[[30, 22], [70, 50], [120, 18], [260, 28], [280, 70], [150, 44], [48, 88], [236, 12]].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 === 0 ? 1.6 : 1} fill="#BFD6FF" opacity={0.8} />
        ))}
        <path d="M0 118 C60 96 110 112 160 104 C210 96 250 112 300 102 V150 H0Z" fill="#1A3062" />
        <path d="M0 132 C70 118 120 134 180 126 C230 120 270 132 300 126 V150 H0Z" fill="#22396F" />
        <image href={logo} x="58" y="66" width="62" height="62" />
      </svg>
      <div style={styles.channelWelcomeText}>
        <div style={styles.channelWelcomeTitle}>Boas conversas<br />levam a grandes ideias.</div>
        <div style={styles.channelWelcomeSub}>
          Este é o #{channelName}, um espaço livre para você conversar, se apresentar e se sentir em casa.
        </div>
      </div>
    </div>
  );
}

function formatDate(ts) {
  const date = new Date(ts);
  const today = new Date();

  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const full = date.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

  if (isSameDay(date, today)) {
    return `Hoje, ${full}`;
  }

  if (isSameDay(date, yesterday)) {
    return `Ontem, ${full}`;
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
    background: 'var(--bg-surface)',
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
    height: 72,
    minHeight: 72,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 16px 0 22px',
    background: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border)',
    zIndex: 5,
  },

  channelIcon: {
    color: 'var(--text-low)',
    fontSize: 26,
    fontWeight: 500,
    lineHeight: 1,
  },

  headerInfo: {
    flex: 1,
    minWidth: 0,
  },

  channelName: {
    color: 'var(--text-hi)',
    fontSize: 19,
    fontWeight: 700,
    letterSpacing: -0.3,
  },

  channelDescription: {
    marginTop: 2,
    color: 'var(--text-low)',
    fontSize: 12.5,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  topicForm: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 3, maxWidth: 420 },
  topicInput: {
    flex: 1, background: 'var(--bg-elevated)', border: '1px solid var(--accent)', borderRadius: 9,
    color: 'var(--text-hi)', fontSize: 12.5, padding: '5px 9px', outline: 'none', fontFamily: 'inherit',
  },
  topicSave: {
    width: 26, height: 26, borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  },
  searchBox: {
    display: 'flex', alignItems: 'center', gap: 8, width: 220, height: 38, marginLeft: 4,
    background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 12, padding: '0 10px 0 12px',
    cursor: 'text',
  },
  searchInput: {
    flex: 1, minWidth: 0, border: 'none', outline: 'none', background: 'transparent',
    color: 'var(--text-hi)', fontSize: 12.5, fontFamily: 'inherit',
  },
  searchClear: {
    width: 20, height: 20, borderRadius: 10, border: 'none', background: 'var(--bg-hover)', color: 'var(--text-mid)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0,
  },
  searchResultBar: {
    fontSize: 12, color: 'var(--text-mid)', background: 'var(--accent-softer)', borderRadius: 10,
    padding: '7px 12px', marginBottom: 10,
  },
  channelWelcome: {
    display: 'flex', alignItems: 'center', gap: 22, margin: '4px 0 6px', padding: 12,
    background: 'linear-gradient(120deg, color-mix(in srgb, var(--accent) 7%, var(--bg-surface)), var(--bg-surface))',
    border: '1px solid var(--border)', borderRadius: 18,
  },
  channelWelcomeArt: { width: 260, maxWidth: '45%', height: 'auto', borderRadius: 12, flexShrink: 0, display: 'block' },
  channelWelcomeText: { minWidth: 0 },
  channelWelcomeTitle: { fontSize: 18, fontWeight: 750, color: 'var(--text-hi)', lineHeight: 1.25, letterSpacing: -0.3 },
  channelWelcomeSub: { fontSize: 13, color: 'var(--text-mid)', lineHeight: 1.55, marginTop: 8, maxWidth: 320 },

  headerActions: {
    display: 'flex',
    gap: 5,
  },

  headerButton: {
    width: 38,
    height: 38,
    border: '1px solid var(--border)',
    borderRadius: 12,
    background: 'var(--bg-elevated)',
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
    borderRadius: 14,
    transition: 'background 0.12s ease',
  }),

  avatar: (color) => ({
    width: 40,
    height: 40,
    minWidth: 40,
    borderRadius: '50%',
    background:
      color ||
      'var(--accent)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontWeight: 650,
    fontSize: 15,
    color: 'var(--on-color)',
  }),

  avatarImage: {
    width: 40,
    height: 40,
    minWidth: 40,
    borderRadius: '50%',
    objectFit: 'cover',
    display: 'block',
  },

  groupTime: {
    width: 40,
    minWidth: 40,
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
    fontSize: 14.5,
    fontWeight: 650,
  },

  time: {
    color: 'var(--text-low)',
    fontSize: 11.5,
  },

  content: {
    color: 'var(--text-hi)',
    fontSize: 14.5,
    lineHeight: 1.5,
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
    background: 'transparent',
  },

  dateText: {
    color: 'var(--text-low)',
    fontSize: 11.5,
    fontWeight: 500,
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
    display: 'flex',
    alignItems: 'flex-end',
    gap: 10,
    padding: '6px 16px 16px',
    background: 'var(--bg-surface)',
  },
  plusButton: {
    width: 46,
    height: 46,
    flexShrink: 0,
    border: '1px solid var(--border)',
    borderRadius: '50%',
    background: 'var(--bg-elevated)',
    color: 'var(--text-mid)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },

  inputBox: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'flex-end',
    gap: 2,
    minHeight: 46,
    background: 'var(--bg-elevated)',
    border: '1px solid var(--border)',
    borderRadius: 23,
    padding: '4px 6px 4px 12px',
  },

  inputAction: {
    width: 36,
    height: 36,
    flexShrink: 0,
    border: 'none',
    borderRadius: 20,
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
    fontSize: 14,
    lineHeight: 1.45,
    padding: '9px 4px',
    fontFamily: 'inherit',
    overflowY: 'auto',
  },

  sendButton: {
    width: 46,
    height: 46,
    flexShrink: 0,
    border: 'none',
    borderRadius: '50%',
    background: 'var(--accent)',
    color: 'var(--accent-contrast)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 8px 22px var(--accent-glow)',
    transition: 'opacity 0.15s ease',
  },

  sendButtonActive: {
    background: 'var(--accent)',
    color: 'var(--accent-contrast)',
    cursor: 'pointer',
  },

  attachmentGrid: { display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  attachmentImage: {
    maxWidth: 320, maxHeight: 260, borderRadius: 14, border: '1px solid var(--border)',
    display: 'block', objectFit: 'cover', cursor: 'zoom-in',
  },
  attachmentVideo: {
    maxWidth: 360, maxHeight: 280, borderRadius: 14, border: '1px solid var(--border)',
    display: 'block', background: '#000',
  },
  attachmentBar: { display: 'flex', flexWrap: 'wrap', gap: 8, padding: '0 18px 8px' },
  uploadError: {
    fontSize: 11.5, color: 'var(--danger)', background: 'rgba(240,101,79,0.1)',
    borderRadius: 10, padding: '5px 9px', width: '100%',
  },
  attachmentCard: {
    position: 'relative', width: 64, height: 64, borderRadius: 12,
    overflow: 'hidden', border: '1px solid var(--border)',
  },
  attachmentThumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  attachmentUploading: {
    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', color: '#fff',
    fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  attachmentRemove: {
    position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%',
    border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 12,
    lineHeight: '18px', cursor: 'pointer', padding: 0,
  },
  emojiPickerWrap: {
    position: 'absolute', bottom: 48, right: -40, zIndex: 20,
    boxShadow: '0 12px 40px rgba(0,0,0,0.4)', borderRadius: 16, overflow: 'hidden',
  },
  inputHint: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 4px 0',
    color: 'var(--text-low)',
    fontSize: 10.5,
    opacity: 0.6,
  },
};