import React, { useEffect, useRef, useState } from 'react';
import { resolveAssetUrl } from '../api';
import EmojiPicker, { Theme as EmojiTheme } from 'emoji-picker-react';
import BadgeRow from './BadgeRow';
import { SearchIcon, BellIcon, SmileyIcon, ArrowUpIcon, EditIcon, LeaveIcon } from './Icons';
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
}) {
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
          <div style={styles.channelName}>
            {channel.name}
          </div>

          <div style={styles.channelDescription}>
            {channel.isGroup
              ? `${channel.memberCount} membros`
              : isDM ? 'Conversa direta' : 'Converse com os membros deste canal'}
          </div>
        </div>

        <div style={styles.headerActions}>
          {channel.isGroup && onRenameGroup && (
            <button type="button" style={styles.headerButton} title="Renomear grupo" onClick={renameGroup}>
              <EditIcon size={15} />
            </button>
          )}
          {channel.isGroup && onLeaveGroup && (
            <button type="button" style={styles.headerButton} title="Sair do grupo" onClick={onLeaveGroup}>
              <LeaveIcon size={16} />
            </button>
          )}
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
            <EmptyMessagesArt />

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
        <form
          onSubmit={submit}
          style={styles.inputBox}
        >
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
            style={styles.inputAction}
            title="Anexar imagem ou vídeo"
            onClick={() => fileInputRef.current?.click()}
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

          <div ref={emojiWrapRef} style={{ position: 'relative' }}>
            <button
              type="button"
              style={styles.inputAction}
              title="Emoji"
              onClick={() => setEmojiOpen((v) => !v)}
            >
              <SmileyIcon size={18} />
            </button>
            {emojiOpen && (
              <div style={styles.emojiPickerWrap}>
                <EmojiPicker onEmojiClick={insertEmoji} theme={EmojiTheme.DARK} height={360} width={320} />
              </div>
            )}
          </div>

          <button
            type="submit"
            disabled={!text.trim() && attachments.every((a) => a.uploading)}
            style={{
              ...styles.sendButton,
              ...((text.trim() || attachments.some((a) => !a.uploading))
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
    height: 58,
    minHeight: 58,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    padding: '0 14px 0 20px',
    background: 'var(--bg-surface)',
    borderBottom: '1px solid var(--border)',
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
    fontSize: 15,
    fontWeight: 650,
  },

  channelDescription: {
    marginTop: 1,
    color: 'var(--text-low)',
    fontSize: 11.5,
  },

  headerActions: {
    display: 'flex',
    gap: 5,
  },

  headerButton: {
    width: 36,
    height: 36,
    border: 'none',
    borderRadius: 18,
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
    background: 'var(--border)',
  },

  dateText: {
    color: 'var(--text-low)',
    fontSize: 11.5,
    fontWeight: 600,
    whiteSpace: 'nowrap',
    background: 'var(--bg-elevated)',
    padding: '3px 10px',
    borderRadius: 'var(--radius-pill)',
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
    padding: '4px 16px 14px',
    background: 'var(--bg-surface)',
  },

  inputBox: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: 4,
    minHeight: 50,
    background: 'var(--bg-elevated)',
    border: 'none',
    borderRadius: 25,
    padding: '5px 6px 5px 6px',
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
    fontSize: 14.5,
    lineHeight: 1.45,
    padding: '10px 6px',
    fontFamily: 'inherit',
    overflowY: 'auto',
  },

  sendButton: {
    width: 36,
    height: 36,
    flexShrink: 0,
    border: 'none',
    borderRadius: 20,
    background: 'transparent',
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
    position: 'absolute', bottom: 44, right: 0, zIndex: 20,
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