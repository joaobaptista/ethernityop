/**
 * socket.js — Socket.io WebSocket server layer for Ethernity DMS real-time telemetry.
 */
import { Server } from 'socket.io';
import config from './config.js';
import { verifyToken } from './auth.js';
import { findUserByEmail } from './db.js';

let io = null;

export function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: config.allowedOrigins,
      credentials: true,
    },
    pingInterval: 10000,
    pingTimeout: 5000,
  });

  io.on('connection', (socket) => {
    const clientIp = socket.handshake.address;
    console.log(`[Socket.io] Client connected: ${socket.id} (${clientIp})`);

    // Só conexões com JWT válido entram na sala privada do usuário (recebem notificações).
    const payload = verifyToken(socket.handshake.auth?.token);
    const user = payload?.sub ? findUserByEmail(payload.sub) : null;
    if (user) {
      socket.join(`user:${user.id}`);
    }

    socket.on('disconnect', (reason) => {
      console.log(`[Socket.io] Client disconnected: ${socket.id} (Reason: ${reason})`);
    });
  });

  return io;
}

// Broadcast de eventos em tempo real do Ethernity DMS
export function broadcastNotification(userId, notification) {
  if (!io) return;
  io.to(`user:${userId}`).emit(`notification:${userId}`, notification);
}

export function broadcastTelemetryUpdate() {
  // Deprecated no-op
}

export function getIO() {
  return io;
}
