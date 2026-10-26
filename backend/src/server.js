import http from 'node:http';
import { createApp } from './app.js';
import { config } from './config.js';
import { startTelemetry } from './telemetry.js';
import { initSocketServer } from './socket.js';
import { initDatabase } from './db/mysql.js';

// Conectar e inicializar banco monolito MySQL
initDatabase().catch((err) => {
  console.error('[Ethernity] Falha ao inicializar MySQL:', err);
});

const app = createApp();
const httpServer = http.createServer(app);

// Initialize Socket.io WebSocket Layer
const io = initSocketServer(httpServer);

httpServer.listen(config.port, () => {
  console.log(`Ethernity DMS Backend API listening on http://localhost:${config.port}`);
  console.log(`  Root:       http://localhost:${config.port}/`);
  console.log(`  Health:     http://localhost:${config.port}/health`);
  console.log(`  Login:      POST http://localhost:${config.port}/login`);
  console.log(`  Demo login: demo@ethernity.com / password123`);
  console.log(`  WebSocket:  Socket.io active on ws://localhost:${config.port}/socket.io/`);
});

// Secondary port listener (e.g. 8000) for seamless backward compatibility
if (config.secondaryPort && config.secondaryPort !== config.port) {
  const secondaryServer = http.createServer(app);
  secondaryServer.listen(config.secondaryPort, () => {
    console.log(`  Compatibility listener active on http://localhost:${config.secondaryPort}`);
  }).on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`  Notice: Port ${config.secondaryPort} in use by another instance.`);
    } else {
      console.warn(`  Warning on port ${config.secondaryPort}:`, err.message);
    }
  });
}

export default httpServer;
export { io };