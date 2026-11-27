import axios from 'axios';
import { io } from 'socket.io-client';

// Troque pela URL do seu backend em produção
export const API_URL = 'http://localhost:4000';

export function createApiClient(token) {
  return axios.create({
    baseURL: API_URL + '/api',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export function createSocket(token) {
  return io(API_URL, { auth: { token }, autoConnect: false });
}

// Avatar/banner vêm do backend como caminho relativo (ex: /uploads/avatars/xxx.webp).
// Isso resolve pra URL completa; se algum dia vier uma URL http(s) pronta, usa ela direto.
export function resolveAssetUrl(url) {
  if (!url) return null;
  if (/^(https?:|blob:|data:)/i.test(url)) return url;
  return `${API_URL}${url}`;
}

// Envia uma imagem (avatar ou banner) já validada no cliente pro endpoint de upload,
// que redimensiona/otimiza (sharp) e retorna o usuário atualizado.
export async function uploadProfileImage(api, kind, file) {
  const field = kind === 'avatar' ? 'avatar' : 'banner';
  const form = new FormData();
  form.append(field, file);
  const { data } = await api.post(`/uploads/${field}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.user;
}

export async function removeProfileImage(api, kind) {
  const field = kind === 'avatar' ? 'avatar' : 'banner';
  const { data } = await api.delete(`/uploads/${field}`);
  return data.user;
}

// Ícone/banner do SERVIDOR (separados do avatar/banner pessoal do usuário logado).
// Só o dono do servidor pode chamar isso — o backend também valida.
export async function uploadServerImage(api, serverId, kind, file) {
  const field = kind === 'icon' ? 'icon' : 'banner';
  const form = new FormData();
  form.append(field, file);
  const { data } = await api.post(`/uploads/server/${serverId}/${field}`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.server;
}

export async function removeServerImage(api, serverId, kind) {
  const field = kind === 'icon' ? 'icon' : 'banner';
  const { data } = await api.delete(`/uploads/server/${serverId}/${field}`);
  return data.server;
}

// Edita nome, cor de destaque e descrição do servidor.
export async function updateServer(api, serverId, patch) {
  const { data } = await api.put(`/servers/${serverId}`, patch);
  return data.server;
}

// Muda o status de presença (online/ausente/não incomodar/invisível).
export async function updateStatus(api, statusMode) {
  const { data } = await api.put('/auth/me/status', { status_mode: statusMode });
  return data.user;
}

// Gera um novo código de convite (invalida o antigo).
export async function regenerateInviteCode(api, serverId) {
  const { data } = await api.post(`/servers/${serverId}/invite/regenerate`);
  return data.invite_code;
}

// --- Anexos de mensagem (imagem e vídeo) ---
// Sobe o arquivo; o servidor otimiza e devolve {url, name, size, width, height, type}
// pra mandar junto com a mensagem pelo socket.
export async function uploadMessageAttachment(api, file, { onProgress, signal, meta } = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(meta || {})) if (v) form.append(k, String(v));
  form.append('file', file);
  const { data } = await api.post('/uploads/message-attachment', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    signal,
    onUploadProgress: (e) => { if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100)); },
  });
  return data.attachment;
}

/** Largura/altura/duração de um vídeo local, antes de subir (pra o player não "pular"). */
export function readVideoMeta(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    const url = URL.createObjectURL(file);
    const done = (m) => { URL.revokeObjectURL(url); resolve(m); };
    v.preload = 'metadata';
    v.muted = true;
    v.onloadedmetadata = () => done({ width: v.videoWidth, height: v.videoHeight, duration: v.duration });
    v.onerror = () => done({});
    setTimeout(() => done({}), 5000);
    v.src = url;
  });
}

// --- Verificação de email ---
export async function verifyEmail(api, code) {
  const { data } = await api.post('/auth/verify-email', { code });
  return data;
}

export async function resendVerification(api) {
  const { data } = await api.post('/auth/resend-verification');
  return data;
}

export async function changeEmail(api, email) {
  const { data } = await api.put('/auth/me/email', { email });
  return data;
}

// --- Insígnias e loja ---
export async function fetchBadges(api) {
  const { data } = await api.get('/badges');
  return data.badges;
}

export async function fetchShopProducts(api) {
  const { data } = await api.get('/shop/products');
  return data;
}

export async function startCheckout(api, productId) {
  const { data } = await api.post('/shop/checkout', { productId });
  return data;
}

export async function confirmPurchase(api, purchaseId) {
  const { data } = await api.post(`/shop/purchases/${purchaseId}/confirm`);
  return data;
}

// --- Conversas em grupo ---
export async function createGroupConversation(api, memberIds, name) {
  const { data } = await api.post('/dms/groups', { memberIds, name });
  return data.conversation;
}

export async function renameGroupConversation(api, conversationId, name) {
  const { data } = await api.put(`/dms/groups/${conversationId}`, { name });
  return data.conversation;
}

export async function addGroupMember(api, conversationId, userId) {
  const { data } = await api.post(`/dms/groups/${conversationId}/members`, { userId });
  return data.conversation;
}

export async function leaveGroupConversation(api, conversationId) {
  await api.delete(`/dms/groups/${conversationId}/members/me`);
}

/** Mostra o nome do jeito que o app exibe em todo lugar: "Apelido" ou "nome#0000". */
export function formatHandle(user) {
  if (!user) return '';
  return `${user.username}#${user.tag}`;
}

export function displayNameOf(user) {
  if (!user) return '';
  return user.display_name || user.username || '';
}
