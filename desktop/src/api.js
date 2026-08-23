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
  if (/^https?:\/\//i.test(url)) return url;
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

// Gera um novo código de convite (invalida o antigo).
export async function regenerateInviteCode(api, serverId) {
  const { data } = await api.post(`/servers/${serverId}/invite/regenerate`);
  return data.invite_code;
}
