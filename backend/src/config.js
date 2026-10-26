/**
 * config.js
 * Central configuration for the mock backend.
 *
 * SECURITY NOTE: This mock deliberately uses its OWN fake signing secret.
 * No secrets from the real Ethernity DMS backend are ever read or used
 * here. Real secrets are not required (and should not be) for a mock.
 */
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const UPLOAD_FOLDER = path.resolve(
  ROOT,
  process.env.UPLOAD_FOLDER ?? './uploads'
);

const VAULT_FOLDER = path.resolve(
  ROOT,
  process.env.VAULT_FOLDER ?? './vault_storage'
);

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const DEV_JWT_SECRET = 'eternity-local-development-only-change-before-production-2026';

function parseFileSize(value) {
  if (typeof value !== 'string') return 50 * 1024 * 1024; // 50 MB default
  const match = value.trim().match(/^(\d+)\s*([kKmMgG])?[bB]?$/);
  if (!match) return 50 * 1024 * 1024;
  const num = parseInt(match[1], 10);
  const unit = (match[2] || '').toLowerCase();
  if (unit === 'k') return num * 1024;
  if (unit === 'm') return num * 1024 * 1024;
  if (unit === 'g') return num * 1024 * 1024 * 1024;
  return num;
}

export const config = {
  port: Number(process.env.PORT || 3333),
  secondaryPort: Number(process.env.SECONDARY_PORT || 8000),
  frontendUrl: (process.env.FRONTEND_URL || process.env.CLIENT_URL || 'http://localhost:5173').split(',')[0].trim(),
  isProduction: IS_PRODUCTION,
  // JWT signing secret (em produção é obrigatório via env — validado abaixo)
  jwtSecret: process.env.JWT_SECRET || process.env.MOCK_JWT_SECRET || (IS_PRODUCTION ? '' : DEV_JWT_SECRET),
  // Login com senhas demo e pagamentos simulados: liberados só fora de produção (ou com opt-in explícito)
  demoLoginEnabled: !IS_PRODUCTION || process.env.ENABLE_DEMO_LOGIN === '1',
  paymentSimulationEnabled: !IS_PRODUCTION || process.env.ENABLE_PAYMENT_SIMULATION === '1',
  // Limite de tentativas em login/cadastro: ligado em produção (RATE_LIMIT_ENABLED=0 desliga, =1 força)
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED ? process.env.RATE_LIMIT_ENABLED === '1' : IS_PRODUCTION,
  // Atrás do Nginx o IP real vem em X-Forwarded-For; número de proxies confiáveis (0 = nenhum)
  trustProxy: Number(process.env.TRUST_PROXY ?? (IS_PRODUCTION ? 1 : 0)),
  jwtAlgorithm: 'HS256',
  accessTokenExpireMs: 24 * 60 * 60 * 1000, // 1 day
  uploadFolder: UPLOAD_FOLDER,
  vaultFolder: VAULT_FOLDER,
  maxUploadBytes: parseFileSize(process.env.MAX_UPLOAD_BYTES),
  allowedUploadTypes: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/avif',
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-matroska',
    'video/ogg',
    'audio/mpeg',
    'audio/wav',
    'audio/webm',
    'audio/ogg',
    'audio/aac',
    'audio/mp4',
    'text/plain',
    'text/markdown',
    'text/csv',
    'application/pdf',
    'application/json',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
  telemetryEnabled: process.env.TELEMETRY_ENABLED === '1' || process.env.MOCK_TELEMETRY === '1',
  telemetryIntervalMs: Number(process.env.TELEMETRY_INTERVAL_MS || process.env.MOCK_TELEMETRY_INTERVAL_MS || 8000),
  geofencingApiKey: process.env.GEOFENCING_API_KEY || process.env.MOCK_GEOFENCING_API_KEY || 'geofencing-service-key-2024',
  allowedOrigins: [process.env.CORS_ORIGINS, process.env.CLIENT_URL, process.env.FRONTEND_URL]
    .filter(Boolean)
    .join(',')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .concat([
      'http://localhost:3333',
      'http://127.0.0.1:3333',
      'http://localhost:8000',
      'http://127.0.0.1:8000',
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://localhost:5174',
      'http://127.0.0.1:5174',
      'http://localhost:5175',
      'http://127.0.0.1:5175',
    ]),
  googlePhotos: {
    clientId: process.env.GOOGLE_PHOTOS_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || '553558864113-veta0pst9uks8215qb7fuvodnjrq6sgc.apps.googleusercontent.com',
    clientSecret: process.env.GOOGLE_PHOTOS_CLIENT_SECRET || process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_PHOTOS_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3333/api/integrations/google-photos/callback',
    tokenEncryptionKey: process.env.GOOGLE_PHOTOS_TOKEN_ENCRYPTION_KEY || '',
    stateTtlSeconds: Number(process.env.GOOGLE_PHOTOS_STATE_TTL_SECONDS || 600),
    maxFileSizeBytes: Number(process.env.GOOGLE_PHOTOS_MAX_FILE_SIZE_MB || 50) * 1024 * 1024,
    maxItemsPerSession: Number(process.env.GOOGLE_PHOTOS_MAX_ITEMS_PER_SESSION || 50),
  },
  version: '1.0.0',
  title: 'Ethernity DMS API',
  root: ROOT,
};

if (IS_PRODUCTION && (!config.jwtSecret || config.jwtSecret === DEV_JWT_SECRET)) {
  throw new Error('[Ethernity] JWT_SECRET precisa ser definido (e diferente do valor de desenvolvimento) em produção.');
}

/** Origem confiável para CORS e redirects com token: localhost ou listada em allowedOrigins. */
export function isAllowedOrigin(origin) {
  if (!origin) return false;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return true;
  return config.allowedOrigins.includes(origin);
}

// Ensure upload folder exists (mirrors backend main.py behavior).
fs.mkdirSync(UPLOAD_FOLDER, { recursive: true });

export default config;
