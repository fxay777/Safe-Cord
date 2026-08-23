import axios from 'axios';
import { io } from 'socket.io-client';

// No Android emulator use 10.0.2.2 no lugar de localhost.
// Em um celular físico, use o IP local da sua máquina (ex: 192.168.0.10).
export const API_URL = 'http://localhost:4000';

export function createApiClient(token) {
  return axios.create({
    baseURL: API_URL + '/api',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

export function createSocket(token) {
  return io(API_URL, { auth: { token }, transports: ['websocket'], autoConnect: false });
}
