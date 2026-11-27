import React, { useEffect, useRef, useState } from 'react';
import { resolveAssetUrl, readVideoMeta } from '../api';
import EmojiPicker from './emoji/EmojiPicker';
import MediaGrid from './media/MediaGrid';
import { loadEmojis, searchEmojis, withTone, getTone, pushRecent, isJumbo } from './emoji/emojiData';
import BadgeRow from './BadgeRow';
import { SearchIcon, SmileyIcon, EditIcon, LeaveIcon, UserPlusIcon, ImageIcon, SendIcon, PlusIcon, CheckIcon, CloseIcon } from './Icons';
import logo from '../assets/logo.png';
import { EmptyChannelArt, EmptyMessagesArt } from './EmptyStateArt';
import { TicketPanelCard, TicketEventRow, TicketBar, TicketClosedComposer } from './tickets/TicketChat';
import { TicketIcon, PhoneIcon } from './Icons';

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25MB: cobre imagem e vídeo curto

export default function ChatView({
  callTools = null, // conversa privada: { participants, inThisCall, onCall }
  ticketTools = null, // { api, serverId, me, members, panelsVersion, onOpenChannel, onGoToChannelId, onNotice }
  onOpenProfile,
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

  function openAuthor(m, e) {
    if (!onOpenProfile || !m.author_id) return;
    e.stopPropagation();
    onOpenProfile(m.author_id, e.currentTarget.getBoundingClientRect(), {
      id: m.author_id, username: m.username, display_name: m.display_name, avatar_url: m.avatar_url,
      avatar_color: m.avatar_color, badges: m.badges,
    });
  }
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

  // Autocompletar ":nome" enquanto digita (como no Discord): sugestões acima da caixa
  const [emojiSuggest, setEmojiSuggest] = useState(null); // { start, query, items, index }
  const caretRef = useRef(null); // posição do cursor guardada ao abrir o seletor de emoji
  const attachmentsCountRef = useRef(0);
  const uploadsRef = useRef(new Map()); // tempId -> AbortController do envio
  const [dragOver, setDragOver] = useState(false);
  const dragDepth = useRef(0);
  const emojiDataRef = useRef(null);
  useEffect(() => { loadEmojis().then((d) => { emojiDataRef.current = d; }).catch(() => {}); }, []);

  function updateSuggest(value, caret) {
    const before = value.slice(0, caret);
    const m = /(^|\s):([\p{L}\d_+-]{2,30})$/u.exec(before);
    if (!m || !emojiDataRef.current) { setEmojiSuggest(null); return; }
    const items = searchEmojis(emojiDataRef.current.emojis, m[2].replace(/_/g, ' '), 8);
    setEmojiSuggest(items.length ? { start: caret - m[2].length - 1, end: caret, query: m[2], items, index: 0 } : null);
  }

  function applySuggest(item) {
    const sug = emojiSuggest;
    if (!sug) return;
    const char = withTone(item, getTone());
    pushRecent(item.u);
    const next = `${text.slice(0, sug.start)}${char} ${text.slice(sug.end)}`;
    setText(next);
    setEmojiSuggest(null);
    const caret = sug.start + char.length + 1;
    requestAnimationFrame(() => { const el = textareaRef.current; if (el) { el.focus(); el.selectionStart = el.selectionEnd = caret; } });
  }

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
    if (attachments.some((a) => a.uploading)) { setUploadError('Espere terminar de enviar os arquivos.'); return; }
    const ready = attachments.filter((a) => a.url);

    if (!value && ready.length === 0) return;

    onSend(value, ready.map((a) => ({
      url: a.url, name: a.name, size: a.size, width: a.width, height: a.height, type: a.type,
      duration: a.duration, animated: a.animated,
    })));
    setText('');
    setAttachments([]);
    attachmentsCountRef.current = 0;

    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }

  // Insere onde está o cursor (antes ia pro lugar errado depois do 1º emoji: usava um texto velho)
  function insertEmoji(emoji, { keepOpen } = {}) {
    const el = textareaRef.current;
    const saved = caretRef.current;
    setText((prev) => {
      const start = saved?.start ?? el?.selectionStart ?? prev.length;
      const end = saved?.end ?? el?.selectionEnd ?? prev.length;
      const next = prev.slice(0, start) + emoji + prev.slice(end);
      const caret = start + emoji.length;
      caretRef.current = { start: caret, end: caret };
      requestAnimationFrame(() => { if (el) { el.focus(); el.selectionStart = el.selectionEnd = caret; } });
      return next;
    });
    if (!keepOpen) setEmojiOpen(false);
  }

  // Anexar fotos/vídeos: botão, arrastar pra dentro do chat ou colar (Ctrl+V)
  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    setUploadError('');
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');
      if (!isImage && !isVideo) { setUploadError(`"${file.name}" não é foto nem vídeo.`); continue; }
      if (file.size > MAX_ATTACHMENT_BYTES) { setUploadError(`"${file.name}" é grande demais (máx. 25 MB).`); continue; }
      if (!onUploadAttachment) { setUploadError('Upload indisponível nesta tela.'); continue; }
      if (attachmentsCountRef.current >= 10) { setUploadError('No máximo 10 arquivos por mensagem.'); break; }
      attachmentsCountRef.current += 1;

      const tempId = `${Date.now()}-${Math.random()}`;
      const previewUrl = URL.createObjectURL(file);
      const controller = new AbortController();
      uploadsRef.current.set(tempId, controller);
      setAttachments((prev) => [...prev, { tempId, name: file.name, previewUrl, type: file.type, uploading: true, progress: 0 }]);

      try {
        const meta = isVideo ? await readVideoMeta(file) : {};
        const uploaded = await onUploadAttachment(file, {
          meta,
          signal: controller.signal,
          onProgress: (p) => setAttachments((prev) => prev.map((a) => (a.tempId === tempId ? { ...a, progress: p } : a))),
        });
        setAttachments((prev) => prev.map((a) => (a.tempId === tempId ? { ...a, ...uploaded, uploading: false, progress: 100 } : a)));
      } catch (err) {
        if (err?.name !== 'CanceledError' && err?.code !== 'ERR_CANCELED') setUploadError(err?.response?.data?.error || `Falha ao enviar "${file.name}".`);
        setAttachments((prev) => prev.filter((a) => a.tempId !== tempId));
        attachmentsCountRef.current -= 1;
      } finally {
        uploadsRef.current.delete(tempId);
      }
    }
  }

  async function handleFilesSelected(e) {
    const files = e.target.files;
    await addFiles(files);
    e.target.value = ''; // deixa escolher o mesmo arquivo de novo depois
  }

  function handlePaste(e) {
    const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (files.length) { e.preventDefault(); addFiles(files); }
  }

  function removeAttachment(key) {
    uploadsRef.current.get(key)?.abort(); // cancela se ainda estiver subindo
    setAttachments((prev) => {
      const next = prev.filter((a) => a.tempId !== key && a.url !== key);
      attachmentsCountRef.current = next.length;
      return next;
    });
  }

  function renameGroup() {
    const next = window.prompt('Novo nome do grupo:', channel.name || '');
    if (next !== null) onRenameGroup?.(next.trim());
  }

  function handleKeyDown(e) {
    if (emojiSuggest) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        setEmojiSuggest((sg) => ({ ...sg, index: (sg.index + d + sg.items.length) % sg.items.length }));
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); applySuggest(emojiSuggest.items[emojiSuggest.index]); return; }
      if (e.key === 'Escape') { setEmojiSuggest(null); return; }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit(e);
    }
  }

  function handleInput(e) {
    setText(e.target.value);
    onTyping?.();
    caretRef.current = null;
    updateSuggest(e.target.value, e.target.selectionStart ?? e.target.value.length);

    const textarea = e.target;

    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 140)}px`;
  }

  return (
    <div
      style={{ ...styles.wrap, position: 'relative' }}
      onDragEnter={(e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) { e.preventDefault(); dragDepth.current += 1; setDragOver(true); } }}
      onDragOver={(e) => { if ([...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault(); }}
      onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragOver(false); }}
      onDrop={(e) => { if (!e.dataTransfer?.files?.length) return; e.preventDefault(); dragDepth.current = 0; setDragOver(false); if (channel.ticket?.status !== 'closed') addFiles(e.dataTransfer.files); }}
    >
      {dragOver && (
        <div style={styles.dropZone} data-drop-zone>
          <div style={styles.dropInner}>
            <ImageIcon size={34} />
            <div style={{ fontSize: 17, fontWeight: 750, marginTop: 10 }}>Solte pra enviar</div>
            <div style={{ fontSize: 13, opacity: 0.8, marginTop: 4 }}>Fotos e vídeos até 25 MB · {isDM ? channel.name : `#${channel.name}`}</div>
          </div>
        </div>
      )}

      {/* HEADER */}
      <header style={styles.header}>
        <div style={styles.channelIcon}>{isDM ? '@' : channel.ticket ? <TicketIcon size={17} /> : '#'}</div>

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
          {isDM && callTools && !callTools.inThisCall && (
            <button
              type="button"
              style={{ ...styles.callBtn, ...(callTools.participants.length ? styles.callBtnLive : {}) }}
              onClick={callTools.onCall}
              title={callTools.participants.length ? 'Entrar na chamada' : 'Ligar'}
              data-call-button
            >
              <PhoneIcon size={15} /> {callTools.participants.length ? `Entrar (${callTools.participants.length})` : 'Ligar'}
            </button>
          )}
          {isDM && callTools?.inThisCall && <span style={styles.inCallTag}><span style={styles.liveDot} /> Na chamada</span>}
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

      {channel.ticket && ticketTools && <TicketBar key={channel.id} tools={ticketTools} channel={channel} />}

      {/* MESSAGES */}
      <main style={styles.messages}>
        {searchQuery.trim() && (
          <div style={styles.searchResultBar}>
            {visibleMessages.length === 0
              ? `Nada encontrado pra "${searchQuery.trim()}" nas mensagens carregadas`
              : `${visibleMessages.length} mensagem(ns) com "${searchQuery.trim()}"`}
          </div>
        )}

        {!isDM && !channel.ticket && !searchQuery.trim() && <ChannelWelcome channelName={channel.name} />}

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

            const special = m.kind === 'ticket_panel' || m.kind === 'ticket_event';
            const grouped =
              prev &&
              !special &&
              (prev.kind || 'text') === 'text' &&
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

                {m.kind === 'ticket_event' ? (
                  <TicketEventRow m={m} />
                ) : (
                <div
                  style={styles.msgRow(grouped)}
                  className="chat-message"
                >
                  {!grouped ? (
                    m.avatar_url ? (
                      <img src={resolveAssetUrl(m.avatar_url)} alt={authorName} style={{ ...styles.avatarImage, cursor: onOpenProfile ? 'pointer' : undefined }} onClick={(e) => openAuthor(m, e)} />
                    ) : (
                      <div style={{ ...styles.avatar(m.avatar_color), cursor: onOpenProfile ? 'pointer' : undefined }} onClick={(e) => openAuthor(m, e)}>
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
                        <span style={styles.author} className={onOpenProfile ? 'sc-clickable-author' : undefined} data-author-id={m.author_id} onClick={(e) => openAuthor(m, e)}>
                          {authorName}
                        </span>

                        {m.badges?.length > 0 && <BadgeRow badges={m.badges} size={14} max={3} />}

                        <span style={styles.time}>
                          {formatTime(m.created_at)}
                        </span>
                      </div>
                    )}

                    {m.content && (
                      <div style={isJumbo(m.content) ? styles.jumbo : styles.content} data-jumbo={isJumbo(m.content) || undefined}>
                        {m.content}
                      </div>
                    )}

                    {m.kind === 'ticket_panel' && (ticketTools
                      ? <TicketPanelCard tools={ticketTools} panelId={m.meta?.panelId} />
                      : <div style={styles.content}>Painel de tickets</div>)}

                    {m.attachments?.length > 0 && <MediaGrid items={m.attachments} author={authorName} />}
                  </div>
                </div>
                )}
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
              {a.uploading && (
                <div style={styles.attachmentUploading}>
                  <span style={styles.progressRing(a.progress || 0)}><span style={styles.progressHole}>{a.progress || 0}%</span></span>
                </div>
              )}
              {!a.uploading && a.type?.startsWith('video/') && <span style={styles.trayBadge}>vídeo</span>}
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
      {channel.ticket?.status === 'closed' ? <TicketClosedComposer ticket={channel.ticket} /> : (
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

        <form onSubmit={submit} style={{ ...styles.inputBox, position: 'relative' }}>
          {emojiSuggest && (
            <div style={styles.suggest} data-emoji-suggest onMouseDown={(e) => e.preventDefault()}>
              <div style={styles.suggestTitle}>Emojis com "{emojiSuggest.query}"</div>
              {emojiSuggest.items.map((it, i) => (
                <button key={it.u} type="button" onClick={() => applySuggest(it)} onMouseEnter={() => setEmojiSuggest((sg) => ({ ...sg, index: i }))}
                  style={{ ...styles.suggestRow, ...(i === emojiSuggest.index ? styles.suggestOn : {}) }}>
                  <span style={{ fontFamily: 'var(--font-emoji)', fontSize: 20, width: 26, textAlign: 'center' }}>{withTone(it, getTone())}</span>
                  <span style={{ flex: 1, minWidth: 0, textAlign: 'left', textTransform: 'capitalize', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.label}</span>
                  {it.shortcodes[0] && <span style={styles.suggestCode}>:{it.shortcodes[0]}:</span>}
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={textareaRef}
            value={text}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
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
              onMouseDown={() => {
                const el = textareaRef.current;
                if (el && document.activeElement === el) caretRef.current = { start: el.selectionStart, end: el.selectionEnd };
              }}
              onClick={() => setEmojiOpen((v) => !v)}
              data-emoji-button
            >
              <SmileyIcon size={18} />
            </button>
            {emojiOpen && <EmojiPicker anchorRef={emojiWrapRef} onPick={insertEmoji} onClose={() => setEmojiOpen(false)} />}
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
      )}
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

  callBtn: {
    display: 'inline-flex', alignItems: 'center', gap: 7, border: '1px solid var(--border)', background: 'var(--bg-elevated)',
    color: 'var(--text-hi)', fontWeight: 650, fontSize: 13, padding: '7px 13px', borderRadius: 12, cursor: 'pointer', fontFamily: 'inherit',
  },
  callBtnLive: { background: 'var(--success)', borderColor: 'var(--success)', color: '#fff' },
  inCallTag: { display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: 'var(--success)', padding: '0 6px' },
  liveDot: { width: 8, height: 8, borderRadius: 4, background: 'var(--success)', boxShadow: '0 0 0 3px color-mix(in srgb, var(--success) 25%, transparent)' },
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
    position: 'relative', width: 76, height: 76, borderRadius: 12,
    overflow: 'hidden', border: '1px solid var(--border)',
  },
  attachmentThumb: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' },
  attachmentUploading: {
    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', color: '#fff',
    fontSize: 9, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  progressRing: (p) => ({ width: 40, height: 40, borderRadius: 20, background: `conic-gradient(var(--accent) ${p * 3.6}deg, rgba(255,255,255,0.25) 0deg)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }),
  progressHole: { width: 31, height: 31, borderRadius: 16, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9.5, fontWeight: 700 },
  trayBadge: { position: 'absolute', left: 3, bottom: 3, fontSize: 9, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.6)', borderRadius: 5, padding: '1px 5px' },
  dropZone: { position: 'absolute', inset: 8, zIndex: 50, borderRadius: 22, background: 'color-mix(in srgb, var(--accent) 22%, rgba(0,0,0,0.55))', border: '3px dashed var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' },
  dropInner: { textAlign: 'center', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center' },
  attachmentRemove: {
    position: 'absolute', top: 2, right: 2, width: 18, height: 18, borderRadius: '50%',
    border: 'none', background: 'rgba(0,0,0,0.65)', color: '#fff', fontSize: 12,
    lineHeight: '18px', cursor: 'pointer', padding: 0,
  },
  jumbo: { fontFamily: 'var(--font-emoji)', fontSize: 44, lineHeight: 1.15, padding: '2px 0', letterSpacing: 2 },
  suggest: { position: 'absolute', left: 0, right: 0, bottom: 'calc(100% + 8px)', zIndex: 30, background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', padding: 6, display: 'flex', flexDirection: 'column' },
  suggestTitle: { fontSize: 11, fontWeight: 750, color: 'var(--text-low)', textTransform: 'uppercase', letterSpacing: 0.5, padding: '4px 8px 6px' },
  suggestRow: { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 8px', border: 'none', background: 'transparent', borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit', fontSize: 13.5, color: 'var(--text-hi)' },
  suggestOn: { background: 'var(--accent-soft)' },
  suggestCode: { fontSize: 11.5, color: 'var(--text-low)', fontFamily: 'ui-monospace, monospace' },
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