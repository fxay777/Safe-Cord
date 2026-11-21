const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../auth');
const { requireServerPermission, hasPermission } = require('../permissions');
const T = require('../tickets');

// Montado em /api/servers/:serverId/tickets
const router = express.Router({ mergeParams: true });
router.use(requireAuth);

const HEX = /^#[0-9a-f]{6}$/i;
const ICONS = ['ticket', 'help', 'alert', 'cart', 'shield', 'star', 'chat', 'bug'];
const str = (v, max) => String(v ?? '').trim().slice(0, max);

function requireMember(req, res, next) {
  if (!db.prepare('SELECT 1 FROM servers WHERE id = ?').get(req.params.serverId)) return res.status(404).json({ error: 'Servidor não encontrado' });
  if (!T.isMember(req.params.serverId, req.user.id)) return res.status(403).json({ error: 'Você não é membro deste servidor' });
  next();
}

function loadTicket(req, res) {
  const t = T.getTicket(req.params.ticketId);
  if (!t || t.server_id !== req.params.serverId || !T.canViewTicket(t, req.user.id)) {
    res.status(404).json({ error: 'Ticket não encontrado' });
    return null;
  }
  return t;
}

const io = (req) => req.app.get('io');
const channelOf = (t) => (t.channel_id ? db.prepare('SELECT * FROM channels WHERE id = ?').get(t.channel_id) : null);

function event(req, ticket, payload) {
  const ch = channelOf(ticket);
  if (ch) T.postSpecialMessage(io(req), ch, req.user.id, 'ticket_event', { ticketId: ticket.id, number: ticket.number, ...payload });
}

// ─── painéis ────────────────────────────────────────────────────────────────
function readPanelBody(serverId, body) {
  const title = str(body.title, 80);
  if (title.length < 3) return { error: 'Dê um título pro painel (3 letras ou mais)' };
  const description = str(body.description, 400);
  const color = HEX.test(body.color || '') ? body.color : '#1E7BFF';
  const welcome = str(body.welcome_message, 500);
  const max = Math.min(5, Math.max(1, Number(body.max_open_per_user) || 1));

  const channel = db.prepare('SELECT * FROM channels WHERE id = ? AND server_id = ?').get(body.channel_id, serverId);
  if (!channel || channel.type !== 'text' || channel.ticket_id) return { error: 'Escolha um canal de texto pra postar o painel' };

  const roleIds = [...new Set(Array.isArray(body.staff_role_ids) ? body.staff_role_ids : [])];
  for (const r of roleIds) {
    if (!db.prepare('SELECT 1 FROM roles WHERE id = ? AND server_id = ?').get(r, serverId)) return { error: 'Cargo de staff inválido' };
  }

  let categoryId = body.category_id || null;
  if (categoryId && !db.prepare('SELECT 1 FROM categories WHERE id = ? AND server_id = ?').get(categoryId, serverId)) {
    return { error: 'Categoria inválida' };
  }

  const rawOptions = Array.isArray(body.options) ? body.options : [];
  if (rawOptions.length < 1 || rawOptions.length > 5) return { error: 'O painel precisa de 1 a 5 botões' };
  const options = [];
  for (const [i, o] of rawOptions.entries()) {
    const label = str(o.label, 40);
    if (!label) return { error: `Dê um nome pro botão ${i + 1}` };
    const qs = Array.isArray(o.questions) ? o.questions : [];
    if (qs.length > 3) return { error: 'Cada botão pode ter no máximo 3 perguntas' };
    const questions = [];
    for (const q of qs) {
      const ql = str(q.label, 100);
      if (ql.length < 3) return { error: `Escreva a pergunta do botão "${label}"` };
      questions.push({ label: ql, required: q.required !== false, long: Boolean(q.long) });
    }
    options.push({
      id: o.id || null, label, description: str(o.description, 100), position: i, questions,
      color: HEX.test(o.color || '') ? o.color : color, icon: ICONS.includes(o.icon) ? o.icon : 'ticket',
    });
  }
  return { title, description, color, welcome, max, channel, roleIds, categoryId, options };
}

function ensureTicketCategory(serverId, userId) {
  const existing = db.prepare("SELECT id FROM categories WHERE server_id = ? AND lower(name) = 'tickets'").get(serverId);
  if (existing) return existing.id;
  const id = uuidv4();
  const pos = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM categories WHERE server_id = ?').get(serverId).p + 1;
  db.prepare('INSERT INTO categories (id, server_id, name, position, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, serverId, 'Tickets', pos, userId, Date.now());
  return id;
}

function saveOptions(panelId, options) {
  const keep = options.map((o) => o.id).filter(Boolean);
  const current = db.prepare('SELECT id FROM ticket_options WHERE panel_id = ?').all(panelId).map((r) => r.id);
  for (const id of current) if (!keep.includes(id)) db.prepare('DELETE FROM ticket_options WHERE id = ?').run(id);
  for (const o of options) {
    if (o.id && current.includes(o.id)) {
      db.prepare('UPDATE ticket_options SET label = ?, description = ?, color = ?, icon = ?, questions = ?, position = ? WHERE id = ?')
        .run(o.label, o.description, o.color, o.icon, JSON.stringify(o.questions), o.position, o.id);
    } else {
      db.prepare('INSERT INTO ticket_options (id, panel_id, label, description, color, icon, questions, position) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), panelId, o.label, o.description, o.color, o.icon, JSON.stringify(o.questions), o.position);
    }
  }
}

router.get('/panels', requireMember, (req, res) => {
  const panels = db.prepare('SELECT * FROM ticket_panels WHERE server_id = ? ORDER BY created_at ASC').all(req.params.serverId).map(T.panelWithOptions);
  res.json({ panels, canManage: hasPermission(req.params.serverId, req.user.id, 'gerenciar_tickets') });
});

router.post('/panels', requireServerPermission('gerenciar_tickets'), (req, res) => {
  const b = readPanelBody(req.params.serverId, req.body || {});
  if (b.error) return res.status(400).json({ error: b.error });
  if (db.prepare('SELECT COUNT(*) AS n FROM ticket_panels WHERE server_id = ?').get(req.params.serverId).n >= 10) {
    return res.status(400).json({ error: 'Limite de 10 painéis por servidor' });
  }
  const id = uuidv4();
  const categoryId = b.categoryId || ensureTicketCategory(req.params.serverId, req.user.id);
  db.transaction(() => {
    db.prepare(`INSERT INTO ticket_panels (id, server_id, channel_id, title, description, color, staff_role_ids, category_id,
      max_open_per_user, welcome_message, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(id, req.params.serverId, b.channel.id, b.title, b.description, b.color, JSON.stringify(b.roleIds), categoryId, b.max, b.welcome, req.user.id, Date.now());
    saveOptions(id, b.options);
  })();
  const msg = T.postSpecialMessage(io(req), b.channel, req.user.id, 'ticket_panel', { panelId: id });
  db.prepare('UPDATE ticket_panels SET message_id = ? WHERE id = ?').run(msg.id, id);
  const panel = T.panelWithOptions(T.getPanel(id));
  io(req)?.to(`server:${req.params.serverId}`).emit('ticket:panel-updated', { serverId: req.params.serverId, panel });
  res.status(201).json({ panel, createdCategory: !b.categoryId });
});

router.put('/panels/:panelId', requireServerPermission('gerenciar_tickets'), (req, res) => {
  const panel = T.getPanel(req.params.panelId);
  if (!panel || panel.server_id !== req.params.serverId) return res.status(404).json({ error: 'Painel não encontrado' });
  const b = readPanelBody(req.params.serverId, { channel_id: panel.channel_id, ...req.body });
  if (b.error) return res.status(400).json({ error: b.error });
  db.transaction(() => {
    db.prepare(`UPDATE ticket_panels SET title = ?, description = ?, color = ?, staff_role_ids = ?, category_id = ?,
      max_open_per_user = ?, welcome_message = ? WHERE id = ?`)
      .run(b.title, b.description, b.color, JSON.stringify(b.roleIds), b.categoryId || panel.category_id, b.max, b.welcome, panel.id);
    saveOptions(panel.id, b.options);
  })();
  // Mudou o painel de canal? Apaga o cartão antigo e posta no novo
  if (b.channel.id !== panel.channel_id) {
    if (panel.message_id) {
      db.prepare('DELETE FROM messages WHERE id = ?').run(panel.message_id);
      io(req)?.to(`server:${req.params.serverId}`).emit('message:removed', { channelId: panel.channel_id, messageId: panel.message_id });
    }
    const msg = T.postSpecialMessage(io(req), b.channel, req.user.id, 'ticket_panel', { panelId: panel.id });
    db.prepare('UPDATE ticket_panels SET channel_id = ?, message_id = ? WHERE id = ?').run(b.channel.id, msg.id, panel.id);
  }
  const updated = T.panelWithOptions(T.getPanel(panel.id));
  io(req)?.to(`server:${req.params.serverId}`).emit('ticket:panel-updated', { serverId: req.params.serverId, panel: updated });
  res.json({ panel: updated });
});

router.delete('/panels/:panelId', requireServerPermission('gerenciar_tickets'), (req, res) => {
  const panel = T.getPanel(req.params.panelId);
  if (!panel || panel.server_id !== req.params.serverId) return res.status(404).json({ error: 'Painel não encontrado' });
  if (panel.message_id) {
    db.prepare('DELETE FROM messages WHERE id = ?').run(panel.message_id);
    io(req)?.to(`server:${req.params.serverId}`).emit('message:removed', { channelId: panel.channel_id, messageId: panel.message_id });
  }
  db.prepare('DELETE FROM ticket_panels WHERE id = ?').run(panel.id); // tickets já abertos continuam
  res.json({ ok: true });
});

// ─── abrir ──────────────────────────────────────────────────────────────────
router.post('/open', requireMember, (req, res) => {
  const { serverId } = req.params;
  const panel = T.getPanel(req.body?.panelId);
  if (!panel || panel.server_id !== serverId) return res.status(404).json({ error: 'Esse painel não existe mais' });
  const option = db.prepare('SELECT * FROM ticket_options WHERE id = ? AND panel_id = ?').get(req.body?.optionId, panel.id);
  if (!option) return res.status(404).json({ error: 'Essa opção não existe mais' });

  const questions = T.parse(option.questions, []);
  const given = Array.isArray(req.body?.answers) ? req.body.answers : [];
  const answers = [];
  for (const [i, q] of questions.entries()) {
    const a = str(given[i], q.long ? 1000 : 200);
    if (q.required && !a) return res.status(400).json({ error: `Responda: ${q.label}`, field: i });
    answers.push({ question: q.label, answer: a });
  }

  const open = db.prepare("SELECT * FROM tickets WHERE server_id = ? AND panel_id = ? AND opener_id = ? AND status = 'open'").all(serverId, panel.id, req.user.id);
  if (open.length >= panel.max_open_per_user) {
    return res.status(409).json({
      error: open.length === 1 ? 'Você já tem um ticket aberto aqui' : `Você já tem ${open.length} tickets abertos aqui`,
      channelId: open[0].channel_id,
    });
  }
  const totalOpen = db.prepare("SELECT COUNT(*) AS n FROM tickets WHERE server_id = ? AND opener_id = ? AND status = 'open'").get(serverId, req.user.id).n;
  if (totalOpen >= 10) return res.status(429).json({ error: 'Muitos tickets abertos — feche algum antes' });

  const ticketId = uuidv4();
  const channelId = uuidv4();
  const now = Date.now();
  const opener = db.prepare('SELECT username FROM users WHERE id = ?').get(req.user.id);
  let number;
  db.transaction(() => {
    db.prepare('UPDATE servers SET ticket_counter = ticket_counter + 1 WHERE id = ?').run(serverId);
    number = db.prepare('SELECT ticket_counter AS n FROM servers WHERE id = ?').get(serverId).n;
    const categoryOk = panel.category_id && db.prepare('SELECT 1 FROM categories WHERE id = ?').get(panel.category_id);
    const categoryId = categoryOk ? panel.category_id : ensureTicketCategory(serverId, req.user.id);
    if (!categoryOk) db.prepare('UPDATE ticket_panels SET category_id = ? WHERE id = ?').run(categoryId, panel.id);
    const pos = db.prepare('SELECT COALESCE(MAX(position), -1) AS p FROM channels WHERE server_id = ?').get(serverId).p + 1;
    db.prepare('INSERT INTO tickets (id, server_id, panel_id, option_id, option_label, number, opener_id, answers, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(ticketId, serverId, panel.id, option.id, option.label, number, req.user.id, JSON.stringify(answers), now);
    db.prepare('INSERT INTO channels (id, server_id, name, type, position, category_id, created_at, topic, ticket_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(channelId, serverId, `ticket-${String(number).padStart(4, '0')}`, 'text', pos, categoryId, now, `${option.label} · aberto por @${opener.username}`, ticketId);
    db.prepare('UPDATE tickets SET channel_id = ? WHERE id = ?').run(channelId, ticketId);
  })();

  const ticket = T.getTicket(ticketId);
  T.broadcastTicket(io(req), ticket);
  event(req, ticket, { event: 'opened', option: option.label, answers, welcome: panel.welcome_message || '' });
  // Avisa a staff (pra badge/notificação), menos quem abriu
  for (const u of T.ticketAudience(ticket)) {
    if (u !== req.user.id) io(req)?.to(`user:${u}`).emit('ticket:opened', { serverId, ticket: T.ticketSummary(ticket), channelId });
  }
  const channel = { ...db.prepare('SELECT * FROM channels WHERE id = ?').get(channelId), ticket: T.ticketSummary(ticket) };
  res.status(201).json({ ticket: T.ticketDetail(ticket), channel });
});

// ─── lista ──────────────────────────────────────────────────────────────────
router.get('/', requireMember, (req, res) => {
  const status = ['open', 'closed'].includes(req.query.status) ? req.query.status : null;
  const rows = db.prepare(`SELECT * FROM tickets WHERE server_id = ? ${status ? 'AND status = ?' : ''} ORDER BY created_at DESC LIMIT 200`)
    .all(...[req.params.serverId, status].filter(Boolean));
  const visible = rows.filter((t) => T.canViewTicket(t, req.user.id) || (!t.channel_id && (t.opener_id === req.user.id || T.isTicketStaff(t.server_id, req.user.id, T.getPanel(t.panel_id)))));
  const counts = { open: 0, closed: 0 };
  for (const t of db.prepare('SELECT * FROM tickets WHERE server_id = ?').all(req.params.serverId)) {
    if (T.canViewTicket(t, req.user.id)) counts[t.status] += 1;
  }
  res.json({ tickets: visible.map((t) => ({ ...T.ticketSummary(t), channel_id: t.channel_id })), counts });
});

router.get('/:ticketId', requireMember, (req, res) => {
  const t = loadTicket(req, res); if (!t) return;
  const staff = T.isTicketStaff(t.server_id, req.user.id, T.getPanel(t.panel_id));
  res.json({ ticket: T.ticketDetail(t), isStaff: staff, canManage: hasPermission(t.server_id, req.user.id, 'gerenciar_tickets') });
});

// ─── ações ──────────────────────────────────────────────────────────────────
function staffOnly(req, res, t) {
  if (!T.isTicketStaff(t.server_id, req.user.id, T.getPanel(t.panel_id))) {
    res.status(403).json({ error: 'Só a staff de atendimento pode fazer isso' });
    return false;
  }
  return true;
}

router.post('/:ticketId/claim', requireMember, (req, res) => {
  const t = loadTicket(req, res); if (!t || !staffOnly(req, res, t)) return;
  if (t.status !== 'open') return res.status(409).json({ error: 'Ticket fechado' });
  const release = t.claimed_by === req.user.id;
  db.prepare('UPDATE tickets SET claimed_by = ? WHERE id = ?').run(release ? null : req.user.id, t.id);
  const next = T.getTicket(t.id);
  event(req, next, { event: release ? 'unclaimed' : 'claimed' });
  T.broadcastTicket(io(req), next);
  res.json({ ticket: T.ticketDetail(next) });
});

router.post('/:ticketId/close', requireMember, (req, res) => {
  const t = loadTicket(req, res); if (!t) return;
  const staff = T.isTicketStaff(t.server_id, req.user.id, T.getPanel(t.panel_id));
  if (!staff && t.opener_id !== req.user.id) return res.status(403).json({ error: 'Só quem abriu ou a staff pode fechar' });
  if (t.status !== 'open') return res.status(409).json({ error: 'Esse ticket já está fechado' });
  const reason = str(req.body?.reason, 300);
  db.prepare("UPDATE tickets SET status = 'closed', closed_at = ?, closed_by = ?, close_reason = ? WHERE id = ?").run(Date.now(), req.user.id, reason || null, t.id);
  const next = T.getTicket(t.id);
  event(req, next, { event: 'closed', reason });
  T.broadcastTicket(io(req), next);
  res.json({ ticket: T.ticketDetail(next) });
});

router.post('/:ticketId/reopen', requireMember, (req, res) => {
  const t = loadTicket(req, res); if (!t || !staffOnly(req, res, t)) return;
  if (t.status !== 'closed') return res.status(409).json({ error: 'Esse ticket já está aberto' });
  if (!t.channel_id) return res.status(409).json({ error: 'O canal desse ticket foi excluído' });
  db.prepare("UPDATE tickets SET status = 'open', closed_at = NULL, closed_by = NULL, close_reason = NULL WHERE id = ?").run(t.id);
  const next = T.getTicket(t.id);
  event(req, next, { event: 'reopened' });
  T.broadcastTicket(io(req), next);
  res.json({ ticket: T.ticketDetail(next) });
});

router.post('/:ticketId/members', requireMember, (req, res) => {
  const t = loadTicket(req, res); if (!t || !staffOnly(req, res, t)) return;
  const userId = String(req.body?.userId || '');
  if (!T.isMember(t.server_id, userId)) return res.status(400).json({ error: 'Essa pessoa não está no servidor' });
  if (T.canViewTicket(t, userId)) return res.status(409).json({ error: 'Essa pessoa já vê o ticket' });
  db.prepare('INSERT OR IGNORE INTO ticket_members (ticket_id, user_id, added_by) VALUES (?, ?, ?)').run(t.id, userId, req.user.id);
  const u = T.userBrief(userId);
  T.broadcastTicket(io(req), t);
  event(req, t, { event: 'member_added', user: u });
  res.json({ ticket: T.ticketDetail(t) });
});

router.delete('/:ticketId/members/:userId', requireMember, (req, res) => {
  const t = loadTicket(req, res); if (!t || !staffOnly(req, res, t)) return;
  const before = T.ticketAudience(t);
  const r = db.prepare('DELETE FROM ticket_members WHERE ticket_id = ? AND user_id = ?').run(t.id, req.params.userId);
  if (!r.changes) return res.status(404).json({ error: 'Essa pessoa não foi adicionada ao ticket' });
  event(req, t, { event: 'member_removed', user: T.userBrief(req.params.userId) });
  T.broadcastTicket(io(req), t, before);
  res.json({ ticket: T.ticketDetail(t) });
});

// Excluir o canal (só ticket fechado). O registro do ticket fica pro histórico.
router.delete('/:ticketId', requireMember, (req, res) => {
  const t = loadTicket(req, res); if (!t || !staffOnly(req, res, t)) return;
  if (t.status !== 'closed') return res.status(409).json({ error: 'Feche o ticket antes de excluir' });
  const audience = T.ticketAudience(t);
  if (t.channel_id) db.prepare('DELETE FROM channels WHERE id = ?').run(t.channel_id);
  for (const u of audience) io(req)?.to(`user:${u}`).emit('channel:removed', { serverId: t.server_id, channelId: t.channel_id });
  res.json({ ok: true });
});

// Transcrição em texto (pra guardar ou mandar pra alguém)
router.get('/:ticketId/transcript', requireMember, (req, res) => {
  const t = loadTicket(req, res); if (!t) return;
  const rows = db.prepare(`SELECT m.content, m.created_at, m.kind, m.meta, m.attachments, u.username, u.tag FROM messages m
    JOIN users u ON u.id = m.author_id WHERE m.channel_id = ? ORDER BY m.created_at ASC`).all(t.channel_id);
  const server = db.prepare('SELECT name FROM servers WHERE id = ?').get(t.server_id);
  const fmt = (ms) => new Date(ms).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const lines = [
    `Ticket #${String(t.number).padStart(4, '0')} — ${t.option_label}`,
    `Servidor: ${server?.name || ''}`,
    `Aberto por: @${T.userBrief(t.opener_id)?.username} em ${fmt(t.created_at)}`,
    t.closed_at ? `Fechado em ${fmt(t.closed_at)}${t.close_reason ? ` — motivo: ${t.close_reason}` : ''}` : 'Status: aberto',
    '─'.repeat(48),
  ];
  const EV = { opened: 'abriu o ticket', claimed: 'assumiu o atendimento', unclaimed: 'liberou o atendimento', closed: 'fechou o ticket', reopened: 'reabriu o ticket', member_added: 'adicionou', member_removed: 'removeu' };
  for (const m of rows) {
    const meta = T.parse(m.meta, {});
    if (m.kind === 'ticket_event') {
      lines.push(`[${fmt(m.created_at)}] * @${m.username} ${EV[meta.event] || meta.event}${meta.user ? ` @${meta.user.username}` : ''}${meta.reason ? ` — ${meta.reason}` : ''}`);
      if (meta.event === 'opened') for (const a of meta.answers || []) lines.push(`    ${a.question}: ${a.answer || '—'}`);
      continue;
    }
    const files = T.parse(m.attachments, []);
    lines.push(`[${fmt(m.created_at)}] @${m.username}: ${m.content}${files.length ? ` [${files.length} anexo(s)]` : ''}`);
  }
  res.set({ 'Content-Type': 'text/plain; charset=utf-8', 'Content-Disposition': `attachment; filename="ticket-${String(t.number).padStart(4, '0')}.txt"` });
  res.send(lines.join('\n'));
});

module.exports = router;
