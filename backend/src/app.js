/**
 * app.js
 * Builds (but does not start) the Express application. Importing this module
 * never binds a port, which lets tests drive it via supertest/TestAgent.
 */
import express from 'express';
import cors from 'cors';
import path from 'node:path';
import config, { isAllowedOrigin } from './config.js';
import api from './routes/index.js';
import swaggerRouter from './docs/swagger.js';
import { reseed } from './db.js';
import { requireAdmin } from './auth.js';
import { pool } from './db/mysql.js';

export function createApp() {
  const app = express();
  if (config.trustProxy > 0) app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  // Cabeçalhos de segurança básicos. Sem CSP global (o Swagger UI carrega scripts da CDN)
  // e sem Cross-Origin-Resource-Policy restritiva: o frontend carrega mídias da API em outra origem.
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('X-Frame-Options', 'DENY');
    res.set('Referrer-Policy', 'no-referrer');
    if (config.isProduction) {
      res.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.use(
    cors({
      origin: (origin, callback) => {
        // Sem Origin (apps nativos, curl, server-to-server) não há risco de CSRF via navegador.
        if (!origin) return callback(null, true);
        return callback(null, isAllowedOrigin(origin));
      },
      credentials: true,
    })
  );

  // Serve previously uploaded files (mirrors mounted /uploads static dir).
  // nosniff + CSP sandbox impedem que um arquivo enviado seja executado como HTML/script.
  const uploadsStatic = express.static(config.uploadFolder, {
    maxAge: '1d',
    setHeaders: (res) => {
      res.set('X-Content-Type-Options', 'nosniff');
      res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    },
  });
  app.use('/uploads', uploadsStatic);
  app.use('/api/uploads', uploadsStatic);

  app.use(express.json());

  // Root banner: {"message":"Ethernity DMS API"}
  app.get('/', (_req, res) =>
    res.json({ message: config.title })
  );

  // Health check real: a API só está saudável se o MySQL responder.
  app.get('/health', async (_req, res) => {
    try {
      await Promise.race([
        pool.query('SELECT 1'),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 2000)),
      ]);
      return res.json({ status: 'healthy', database: 'up' });
    } catch {
      return res.status(503).json({ status: 'unhealthy', database: 'down' });
    }
  });

  // Prometheus-metrics
  app.get('/metrics', (_req, res) => {
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(
      [
        '# HELP tracker_requests_total Total requests handled by the service.',
        '# TYPE tracker_requests_total counter',
        `tracker_requests_total 0`,
        '',
      ].join('\n')
    );
  });

  // Reseed data
  app.post('/reset', requireAdmin, (_req, res) => {
    if (config.isProduction) {
      return res.status(403).json({ detail: 'Reset desabilitado em produção.' });
    }
    reseed();
    return res.json({ message: 'Database reseeded' });
  });

  // OpenAPI 3.0 & Swagger UI documentation (/docs, /redoc, /openapi.json)
  app.use(swaggerRouter);

  // All domain routes (mounted on /api and root / for dual compatibility).
  app.use('/api', api);
  app.use(api);

  // 404 fallback (FastAPI returns {"detail":"Not Found"}).
  app.use((_req, res) => res.status(404).json({ detail: 'Not Found' }));

  // JSON error fallback.
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) {
      // Detalhes internos (SQL, caminhos, stack) ficam só no log do servidor.
      console.error(`[Ethernity] Erro ${status} em ${req.method} ${req.originalUrl}:`, err);
      return res.status(status).json({ detail: 'Erro interno do servidor.' });
    }
    const message = status === 413 ? 'File too large' : err.message;
    return res.status(status).json({ detail: message });
  });

  return app;
}

export default createApp;
export { path, config };