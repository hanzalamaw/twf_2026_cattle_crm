import { io } from 'socket.io-client';
import { API_BASE } from '../config/api';

let socket;

function getSocketBaseUrl() {
  return String(API_BASE || '').replace(/\/api\/?$/, '');
}

export function getOperationsSocket() {
  if (!socket) {
    socket = io(getSocketBaseUrl(), {
      transports: ['websocket'],
      autoConnect: true,
    });
  }
  return socket;
}

export function closeOperationsSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
