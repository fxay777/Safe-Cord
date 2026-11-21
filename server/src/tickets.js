const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { hasPermission } = require('./permissions');

// ─── Regras dos tickets ─────────────────────────────────────────────────────
// Canal de ticket é privado: só vê quem abriu, quem foi adicionado e a staff.
// Staff = dono do servidor, quem tem "gerenciar_tickets" e quem tem um dos cargos do painel.

const parse = (json, fallback) => { try { const v = JSON.parse(json || ''); return v ?? fallback; } catch { return fallback; } };

function getTicket(id) {
  return db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
}

function getPanel(id) {
  return id ? db.prepare('SELECT * FROM ticket_panels WHERE id = ?').get(id) : null;
}

function isMember(serverId, userId) {
  return Boolean(db.prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId));
}

/** Atende tickets desse painel? (sem painel = só dono/gerenciar_tickets) */
function isTicketStaff(serverId, userId, panel) {
  if (!isMember(serverId, userId)) return false;
  if (hasPermission(serverId, userId, 'gerenciar_tickets')) return true;
  const roleIds = parse(panel?.staff_role_ids, []);
  if (!roleIds.length) return false;
  const ph = roleIds.map(() => '?').join(',');
  return Boolean(db.prepare(`SELECT 1 FROM member_roles WHERE server_id = ? AND user_id = ? AND role_id IN (${ph})`).get(serverId, userId, ...roleIds));
}

function canViewTicket(ticket, userId) {
  if (!ticket || !isMember(ticket.server_id, userId)) return false;
  if (ticket.opener_id === userId) return true;
  if (db.prepare('SELECT 1 FROM ticket_members WHERE ticket_id = ? AND user_id = ?').get(ticket.id, userId)) return true;
  return isTicketStaff(ticket.server_id, userId, getPanel(ticket.panel_id));
}

/** Regra única de "pode ver esse canal?" — usada no histórico, no socket e na lista de canais. */
function canViewChannel(channel, userId) {
  if (!channel) return false;
  if (!channel.ticket_id) return isMember(channel.server_id, userId);
  return canViewTicket(getTicket(channel.ticket_id), userId);
}

function visibleChannels(serverId, userId) {
  const rows = db.prepare('SELECT * FROM channels WHERE server_id = ? ORDER BY position ASC').all(serverId);
  const out = [];
  for (const c of rows) {
    if (!c.ticket_id) { out.push(c); continue; }
    const t = getTicket(c.ticket_id);
    if (canViewTicket(t, userId)) out.push({ ...c, ticket: ticketSummary(t) });
  }
  return out;
}

/** Todo mundo que enxerga o ticket (pra mandar eventos só pra essas pessoas). */
function ticketAudience(ticket) {
  const members = db.prepare('SELECT user_id FROM server_members WHERE server_id = ?').all(ticket.server_id).map((m) => m.user_id);
  return members.filter((id) => canViewTicket(ticket, id));
}

function userBrief(id) {
  if (!id) return null;
  return db.prepare('SELECT id, username, tag, display_name, avatar_url, avatar_color FROM users WHERE id = ?').get(id) || null;
}

function ticketSummary(t) {
  if (!t) return null;
  return {
    id: t.id,
    number: t.number,
    status: t.status,
    option_label: t.option_label,
    panel_id: t.panel_id,
    opener: userBrief(t.opener_id),
    claimed_by: userBrief(t.claimed_by),
    created_at: t.created_at,
    closed_at: t.closed_at,
    close_reason: t.close_reason,
  };
}

function ticketDetail(t) {
  const members = db.prepare('SELECT user_id FROM ticket_members WHERE ticket_id = ?').all(t.id).map((r) => userBrief(r.user_id)).filter(Boolean);
  return { ...ticketSummary(t), channel_id: t.channel_id, answers: parse(t.answers, []), members, closed_by: userBrief(t.closed_by) };
}

function panelWithOptions(p) {
  const options = db.prepare('SELECT * FROM ticket_options WHERE panel_id = ? ORDER BY position ASC').all(p.id)
    .map((o) => ({ ...o, questions: parse(o.questions, []) }));
  return { ...p, staff_role_ids: parse(p.staff_role_ids, []), options };
}

/** Grava uma mensagem especial (painel ou aviso de sistema) e manda pra quem pode ver o canal. */
function postSpecialMessage(io, channel, authorId, kind, meta, content = '') {
  const id = uuidv4();
  const created_at = Date.now();
  db.prepare('INSERT INTO messages (id, channel_id, author_id, content, created_at, attachments, kind, meta) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(id, channel.id, authorId, content, created_at, '[]', kind, JSON.stringify(meta || {}));
  const author = db.prepare('SELECT username, tag, avatar_color, avatar_url, display_name FROM users WHERE id = ?').get(authorId) || {};
  const payload = {
    id, channelId: channel.id, serverId: channel.server_id, content, attachments: [], created_at, kind, meta: meta || {},
    author_id: authorId, ...author, badges: [],
  };
  emitToChannelAudience(io, channel, 'message:new', payload);
  return payload;
}

function emitToChannelAudience(io, channel, event, payload) {
  if (!io) return;
  let rooms;
  if (channel.ticket_id) {
    const t = getTicket(channel.ticket_id);
    rooms = t ? ticketAudience(t).map((u) => `user:${u}`) : [];
  } else {
    rooms = db.prepare('SELECT user_id FROM server_members WHERE server_id = ?').all(channel.server_id).map((m) => `user:${m.user_id}`);
  }
  if (rooms.length) io.to(rooms).emit(event, payload);
}

/** Avisa a mudança do ticket: quem ainda vê recebe o canal atualizado; quem perdeu acesso recebe a remoção. */
function broadcastTicket(io, ticket, previousAudience = []) {
  if (!io) return;
  const channel = ticket.channel_id ? db.prepare('SELECT * FROM channels WHERE id = ?').get(ticket.channel_id) : null;
  const now = ticketAudience(ticket);
  const payloadChannel = channel ? { ...channel, ticket: ticketSummary(ticket) } : null;
  if (payloadChannel) {
    for (const u of now) io.to(`user:${u}`).emit('channel:upsert', { serverId: ticket.server_id, channel: payloadChannel });
  }
  const lost = previousAudience.filter((u) => !now.includes(u));
  for (const u of lost) io.to(`user:${u}`).emit('channel:removed', { serverId: ticket.server_id, channelId: ticket.channel_id });
  if (ticket.channel_id) for (const u of lost) io.in(`user:${u}`).socketsLeave(`channel:${ticket.channel_id}`);
  for (const u of now) io.to(`user:${u}`).emit('ticket:updated', { serverId: ticket.server_id, ticket: ticketSummary(ticket) });
}

module.exports = {
  parse, getTicket, getPanel, isMember, isTicketStaff, canViewTicket, canViewChannel, visibleChannels, ticketAudience,
  ticketSummary, ticketDetail, panelWithOptions, postSpecialMessage, emitToChannelAudience, broadcastTicket, userBrief,
};
