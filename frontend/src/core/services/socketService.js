/**
 * socketService.js — Singleton client for Socket.io WebSocket connection to Ethernity DMS backend.
 */
import { io } from 'socket.io-client';

const SOCKET_URL = import.meta.env.VITE_WS_URL || 'http://localhost:8000';

class SocketService {
  constructor() {
    this.socket = null;
    this.isConnected = false;
  }

  connect() {
    if (this.socket) return this.socket;

    this.socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      // JWT no handshake: o servidor só inscreve na sala privada do usuário autenticado.
      auth: (cb) => {
        let token = null;
        try {
          token = localStorage.getItem('ethernity_auth_token');
        } catch {
          // storage indisponível (modo privado / SSR)
        }
        cb({ token });
      },
    });

    this.socket.on('connect', () => {
      this.isConnected = true;
      console.log('[SocketService] Connected to Ethernity DMS WebSocket server:', this.socket.id);
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnected = false;
      console.warn('[SocketService] Disconnected from WebSocket server:', reason);
    });

    this.socket.on('connect_error', (error) => {
      this.isConnected = false;
      console.error('[SocketService] Connection error:', error.message);
    });

    return this.socket;
  }

  getSocket() {
    if (!this.socket) {
      return this.connect();
    }
    return this.socket;
  }

  on(event, callback) {
    const s = this.getSocket();
    s.on(event, callback);
    return () => s.off(event, callback);
  }

  off(event, callback) {
    const s = this.getSocket();
    s.off(event, callback);
  }

  emit(event, data, callback) {
    const s = this.getSocket();
    s.emit(event, data, callback);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.isConnected = false;
    }
  }
}

export const socketService = new SocketService();
export default socketService;
