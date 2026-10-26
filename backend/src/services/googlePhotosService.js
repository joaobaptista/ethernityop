import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import config from '../config.js';
import { pool } from '../db/mysql.js';
import path from 'node:path';
import fs from 'node:fs/promises';
import imageProcessorService from './imageProcessorService.js';
import vaultEncryptionService from './vaultEncryptionService.js';

const GOOGLE_PICKER_BASE = 'https://photospicker.googleapis.com/v1';
const GOOGLE_AUTH_BASE = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getEncryptionKey() {
  const rawKey = config.googlePhotos.tokenEncryptionKey;
  if (!rawKey) {
    throw new Error('Chave de criptografia de tokens do Google Photos não configurada.');
  }
  const keyBuffer = Buffer.from(rawKey, 'base64');
  if (keyBuffer.length !== 32) {
    throw new Error('A chave GOOGLE_PHOTOS_TOKEN_ENCRYPTION_KEY deve ter 32 bytes (base64).');
  }
  return keyBuffer;
}

function encryptJson(payload) {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('base64'),
    data: encrypted.toString('base64'),
    tag: authTag.toString('base64'),
  });
}

function decryptJson(serialized) {
  const { iv, data, tag } = JSON.parse(serialized);
  const decipher = crypto.createDecipheriv(
    ENCRYPTION_ALGORITHM,
    getEncryptionKey(),
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(data, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

export const CURATED_DEMO_PHOTOS = [
  {
    id: 'gp-photo-1',
    title: 'Viagem em Família — Serra da Mantiqueira',
    description: 'Passeio inesquecível com as crianças e piquenique ao pôr do sol.',
    category: 'family',
    categoryLabel: 'Família & Filhos',
    date: '15 de Julho, 2024',
    timestamp: '2024-07-15T16:30:00Z',
    location: 'Campos do Jordão, SP',
    dimensions: { width: 3840, height: 2160 },
    thumbnailUrl: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=800&q=80',
    fullUrl: 'https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=2000&q=90',
    tags: ['família', 'filhos', 'natureza', 'viagem'],
  },
  {
    id: 'gp-photo-2',
    title: 'Primeiros Passos da Beatriz',
    description: 'Momento mágico na sala de estar dando os primeiros passinhos sozinha.',
    category: 'special',
    categoryLabel: 'Momentos Especiais',
    date: '22 de Outubro, 2023',
    timestamp: '2023-10-22T10:15:00Z',
    location: 'Casa da Família, São Paulo',
    dimensions: { width: 3000, height: 2000 },
    thumbnailUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=800&q=80',
    fullUrl: 'https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=2000&q=90',
    tags: ['bebê', 'filha', 'infância', 'amor'],
  },
  {
    id: 'gp-photo-3',
    title: 'Aniversário de 5 Anos do Lucas',
    description: 'Comemoração dos 5 aninhos com todos os primos e avós reunidos.',
    category: 'family',
    categoryLabel: 'Família & Filhos',
    date: '04 de Abril, 2024',
    timestamp: '2024-04-04T18:00:00Z',
    location: 'Salão de Festas, SP',
    dimensions: { width: 3200, height: 2400 },
    thumbnailUrl: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=800&q=80',
    fullUrl: 'https://images.unsplash.com/photo-1530103862676-de8c9debad1d?auto=format&fit=crop&w=2000&q=90',
    tags: ['aniversário', 'festa', 'alegria', 'primos'],
  },
  {
    id: 'gp-photo-rock-1',
    title: 'Show The Rolling Stones — Turnê Histórica',
    description: 'Palco iluminado, solo de guitarra inesquecível e energia eletrizante no estádio com 70 mil pessoas.',
    category: 'special',
    categoryLabel: 'Shows & Música',
    date: '14 de Outubro, 2023',
    timestamp: '2023-10-14T21:30:00Z',
    location: 'Allianz Parque, São Paulo',
    dimensions: { width: 3840, height: 2160 },
    thumbnailUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=800&q=80',
    fullUrl: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?auto=format&fit=crop&w=2000&q=90',
    tags: ['show de rock', 'rock', 'concerto', 'música', 'festival', 'palco', 'guitarra', 'rolling stones'],
  },
  {
    id: 'gp-photo-rock-2',
    title: 'Rock in Rio — Palco Mundo ao Pôr do Sol',
    description: 'Multidão cantando junto, clássicos do rock e o melhor fim de semana do ano com os amigos.',
    category: 'special',
    categoryLabel: 'Shows & Música',
    date: '08 de Setembro, 2024',
    timestamp: '2024-09-08T19:00:00Z',
    location: 'Cidade do Rock, Rio de Janeiro',
    dimensions: { width: 4000, height: 2500 },
    thumbnailUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=800&q=80',
    fullUrl: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?auto=format&fit=crop&w=2000&q=90',
    tags: ['show de rock', 'rock in rio', 'festival', 'rock', 'banda', 'música', 'multidão'],
  },
];

export const googlePhotosService = {
  isConfigured() {
    return Boolean(config.googlePhotos.clientId && config.googlePhotos.clientSecret && config.googlePhotos.redirectUri);
  },

  async getConnectionStatus(userId) {
    if (!this.isConfigured()) {
      return {
        configured: false,
        connected: false,
        provider: 'google_photos',
        displayName: null,
        lastSyncedAt: null,
      };
    }

    try {
      const [rows] = await pool.query(
        "SELECT * FROM integration_connections WHERE user_id = ? AND provider = 'google_photos' AND status = 'ACTIVE' LIMIT 1",
        [userId]
      );

      const conn = rows[0];
      if (!conn) {
        return {
          configured: true,
          connected: false,
          provider: 'google_photos',
          displayName: null,
          lastSyncedAt: null,
        };
      }

      return {
        configured: true,
        connected: true,
        provider: 'google_photos',
        displayName: conn.display_name,
        lastSyncedAt: conn.last_synced_at,
        externalAccountId: conn.external_account_id,
      };
    } catch (err) {
      console.warn('[GooglePhotosService] Error querying connection status:', err.message);
      return {
        configured: true,
        connected: false,
        provider: 'google_photos',
        displayName: null,
        lastSyncedAt: null,
      };
    }
  },

  async generateAuthorizationUrl(userId, origin = null) {
    if (!this.isConfigured()) {
      throw new Error('Google Photos Picker integration is not configured on this server.');
    }

    const stateToken = jwt.sign(
      {
        userId,
        action: 'integrate_photos',
        origin: (origin || config.frontendUrl).replace(/\/$/, ''),
        nonce: crypto.randomBytes(16).toString('hex'),
      },
      config.jwtSecret,
      { expiresIn: config.googlePhotos.stateTtlSeconds }
    );

    const url = new URL(GOOGLE_AUTH_BASE);
    url.searchParams.set('client_id', config.googlePhotos.clientId);
    url.searchParams.set('redirect_uri', config.googlePhotos.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set(
      'scope',
      'https://www.googleapis.com/auth/photospicker.mediaitems.readonly openid email profile'
    );
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', stateToken);

    return {
      authorizationUrl: url.toString(),
      url: url.toString(),
    };
  },

  async handleOAuthCallback({ code, state }) {
    let payload;
    try {
      payload = jwt.verify(state, config.jwtSecret);
    } catch {
      throw new Error('O estado da autorização expirou ou é inválido.');
    }

    const userId = payload.userId;
    if (!userId) {
      throw new Error('Identificador de usuário ausente no estado da autorização.');
    }

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.googlePhotos.clientId,
        client_secret: config.googlePhotos.clientSecret,
        redirect_uri: config.googlePhotos.redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok) {
      throw new Error(tokenData.error_description || tokenData.error || 'Falha ao trocar código de autorização por tokens.');
    }

    let profile = { email: 'google.user@gmail.com', name: 'Google Photos User', sub: `sub-${userId}` };
    try {
      const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      });
      if (userinfoRes.ok) {
        profile = await userinfoRes.json();
      }
    } catch {}

    const credentialsToStore = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Date.now() + (Number(tokenData.expires_in) || 3600) * 1000,
      scope: tokenData.scope,
    };

    const encryptedCredentials = encryptJson(credentialsToStore);

    await pool.query(
      `INSERT INTO integration_connections (
         user_id, provider, external_account_id, display_name, scopes,
         credentials_encrypted, status, last_synced_at
       ) VALUES (?, 'google_photos', ?, ?, ?, ?, 'ACTIVE', NOW(3))
       ON DUPLICATE KEY UPDATE
         display_name = VALUES(display_name),
         scopes = VALUES(scopes),
         credentials_encrypted = VALUES(credentials_encrypted),
         status = 'ACTIVE',
         last_synced_at = NOW(3)`,
      [
        userId,
        profile.sub || profile.email,
        profile.email || profile.name,
        JSON.stringify(tokenData.scope ? tokenData.scope.split(' ') : []),
        encryptedCredentials,
      ]
    );

    return { success: true, email: profile.email };
  },

  async getValidAccessToken(userId) {
    const [rows] = await pool.query(
      "SELECT * FROM integration_connections WHERE user_id = ? AND provider = 'google_photos' AND status = 'ACTIVE' LIMIT 1",
      [userId]
    );

    const conn = rows[0];
    if (!conn || !conn.credentials_encrypted) {
      throw new Error('Conexão com o Google Fotos não encontrada. Conecte sua conta Google primeiro.');
    }

    const credentials = decryptJson(conn.credentials_encrypted);

    // If access token is valid and not expiring in next 2 minutes:
    if (credentials.accessToken && credentials.expiresAt && Date.now() < credentials.expiresAt - 120000) {
      return credentials.accessToken;
    }

    // Refresh token if needed
    if (!credentials.refreshToken) {
      if (credentials.accessToken) return credentials.accessToken;
      throw new Error('Sua autorização com o Google Fotos expirou. Por favor, reconecte sua conta.');
    }

    const refreshResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: config.googlePhotos.clientId,
        client_secret: config.googlePhotos.clientSecret,
        refresh_token: credentials.refreshToken,
        grant_type: 'refresh_token',
      }),
    });

    const refreshData = await refreshResponse.json();
    if (!refreshResponse.ok) {
      throw new Error('Não foi possível renovar a autorização com o Google Fotos. Reconecte sua conta.');
    }

    credentials.accessToken = refreshData.access_token;
    credentials.expiresAt = Date.now() + (Number(refreshData.expires_in) || 3600) * 1000;
    if (refreshData.refresh_token) {
      credentials.refreshToken = refreshData.refresh_token;
    }

    const reEncrypted = encryptJson(credentials);
    await pool.query(
      "UPDATE integration_connections SET credentials_encrypted = ?, last_synced_at = NOW(3) WHERE id = ?",
      [reEncrypted, conn.id]
    );

    return credentials.accessToken;
  },

  async createPickerSession(userId, capsuleId) {
    let accessToken;
    try {
      accessToken = await this.getValidAccessToken(userId);
    } catch (err) {
      // In development / demo mode, return simulated session if no real Google token
      console.warn('[GooglePhotosService] Falling back to simulated Picker session:', err.message);
      const simulatedSessionId = `session-sim-${crypto.randomUUID()}`;
      return {
        id: simulatedSessionId,
        sessionId: simulatedSessionId,
        pickerUri: `https://photospicker.googleapis.com/v1/sessions/${simulatedSessionId}`,
        pollingConfig: { pollInterval: '3s' },
        mediaItemsSet: false,
        isSimulated: true,
      };
    }

    const googleRes = await fetch(`${GOOGLE_PICKER_BASE}/sessions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    const sessionData = await googleRes.json();
    if (!googleRes.ok) {
      throw new Error(sessionData.error?.message || 'Falha ao criar sessão no Google Photos Picker API.');
    }

    const [insertResult] = await pool.query(
      `INSERT INTO google_photos_picker_sessions (
         user_id, capsule_id, google_session_id, picker_uri, status,
         metadata, expires_at, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 'PICKING', ?, ?, NOW(3), NOW(3))`,
      [
        userId,
        capsuleId || 'capsule-default',
        sessionData.id,
        sessionData.pickerUri,
        JSON.stringify(sessionData),
        sessionData.expireTime ? new Date(sessionData.expireTime) : null,
      ]
    );

    return {
      id: insertResult.insertId,
      sessionId: sessionData.id,
      pickerUri: sessionData.pickerUri,
      pollingConfig: sessionData.pollingConfig || { pollInterval: '3s' },
      mediaItemsSet: Boolean(sessionData.mediaItemsSet),
    };
  },

  async getPickerSession(userId, capsuleId, sessionId) {
    const isNumeric = /^\d+$/.test(String(sessionId).trim());
    const query = isNumeric
      ? 'SELECT * FROM google_photos_picker_sessions WHERE id = ? AND user_id = ? LIMIT 1'
      : 'SELECT * FROM google_photos_picker_sessions WHERE google_session_id = ? AND user_id = ? LIMIT 1';

    const [rows] = await pool.query(query, [sessionId, userId]);
    const session = rows[0];

    if (!session) {
      return {
        id: sessionId,
        sessionId,
        status: 'PICKING',
        mediaItemsSet: false,
        itemCount: 0,
        pollingConfig: { pollInterval: '3s' },
      };
    }

    if (session.status === 'COMPLETED' || session.status === 'SELECTION_READY') {
      return {
        id: session.id,
        sessionId: session.google_session_id,
        pickerUri: session.picker_uri,
        status: session.status,
        mediaItemsSet: true,
        itemCount: session.selected_count || 1,
        pollingConfig: { pollInterval: '3s' },
      };
    }

    const accessToken = await this.getValidAccessToken(userId);
    const googleRes = await fetch(`${GOOGLE_PICKER_BASE}/sessions/${encodeURIComponent(session.google_session_id)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const googleData = await googleRes.json();
    if (!googleRes.ok) {
      throw new Error(googleData.error?.message || 'Falha ao verificar status da sessão no Google Fotos.');
    }

    if (googleData.mediaItemsSet) {
      await pool.query(
        "UPDATE google_photos_picker_sessions SET status = 'SELECTION_READY', selection_ready_at = NOW(3), last_polled_at = NOW(3) WHERE id = ?",
        [session.id]
      );
      return {
        id: session.id,
        sessionId: session.google_session_id,
        pickerUri: session.picker_uri,
        status: 'SELECTION_READY',
        mediaItemsSet: true,
        itemCount: 1,
        pollingConfig: googleData.pollingConfig || { pollInterval: '3s' },
      };
    }

    return {
      id: session.id,
      sessionId: session.google_session_id,
      pickerUri: session.picker_uri,
      status: 'PICKING',
      mediaItemsSet: false,
      itemCount: 0,
      pollingConfig: googleData.pollingConfig || { pollInterval: '3s' },
    };
  },

  async importPickerSession(userId, capsuleId, sessionId) {
    const isNumeric = /^\d+$/.test(String(sessionId).trim());
    const query = isNumeric
      ? 'SELECT * FROM google_photos_picker_sessions WHERE id = ? AND user_id = ? LIMIT 1'
      : 'SELECT * FROM google_photos_picker_sessions WHERE google_session_id = ? AND user_id = ? LIMIT 1';

    const [rows] = await pool.query(query, [sessionId, userId]);
    const session = rows[0];

    // If simulated session or no DB session
    if (!session) {
      return {
        importedCount: 0,
        memories: [],
        message: 'Nenhuma sessão do Google Fotos encontrada.',
      };
    }

    const accessToken = await this.getValidAccessToken(userId);

    // Fetch media items from Google
    const itemsRes = await fetch(`${GOOGLE_PICKER_BASE}/mediaItems?sessionId=${encodeURIComponent(session.google_session_id)}&pageSize=50`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const itemsData = await itemsRes.json();
    if (!itemsRes.ok) {
      throw new Error(itemsData.error?.message || 'Falha ao buscar itens da seleção no Google Fotos.');
    }

    const items = itemsData.mediaItems || [];
    const createdMemories = [];

    for (const item of items) {
      const mimeType = item.mediaFile?.mimeType || item.mimeType || 'image/jpeg';
      const baseUrl = item.mediaFile?.baseUrl || item.baseUrl;
      if (!baseUrl) continue;

      const downloadUrl = baseUrl.endsWith('=d') ? baseUrl : `${baseUrl}=d`;
      let downloadRes = await fetch(downloadUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!downloadRes.ok) {
        downloadRes = await fetch(baseUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      }
      if (!downloadRes.ok) continue;

      const originalFilename = item.mediaFile?.filename || `google-photos-${item.id}.jpg`;
      const arrayBuffer = await downloadRes.arrayBuffer();
      const rawBuffer = Buffer.from(arrayBuffer);

      // Processamento em WebP Multi-Tier (Master 300 DPI, Display, Thumb)
      const processed = await imageProcessorService.processImage(rawBuffer);
      const mediaId = `gp-${crypto.randomUUID()}`;
      const mediaDir = path.join(config.vaultFolder, userId, mediaId);
      await fs.mkdir(mediaDir, { recursive: true });

      // Criptografa variantes com AES-256-GCM
      const masterEnc = vaultEncryptionService.encryptSingleBlock(processed.master.buffer, {
        userId,
        mediaId,
        variant: 'master',
      });
      const displayEnc = vaultEncryptionService.encryptSingleBlock(processed.display.buffer, {
        userId,
        mediaId,
        variant: 'display',
      });
      const thumbEnc = vaultEncryptionService.encryptSingleBlock(processed.thumb.buffer, {
        userId,
        mediaId,
        variant: 'thumb',
      });

      await fs.writeFile(path.join(mediaDir, 'master.webp.enc'), masterEnc);
      await fs.writeFile(path.join(mediaDir, 'display.webp.enc'), displayEnc);
      await fs.writeFile(path.join(mediaDir, 'thumb.webp.enc'), thumbEnc);

      const variantsJson = {
        master: { width: processed.master.width, height: processed.master.height, size: processed.master.sizeBytes, dpi: 300 },
        display: { width: processed.display.width, height: processed.display.height, size: processed.display.sizeBytes },
        thumb: { width: processed.thumb.width, height: processed.thumb.height, size: processed.thumb.sizeBytes },
      };

      const mediaUrl = `/api/vault/media/${mediaId}`;
      const storageKey = `vault/${userId}/${mediaId}`;

      const [ins] = await pool.query(
        `INSERT INTO memories (
           capsule_id, author_id, type, title, content, media_url,
           storage_key, mime_type, file_size_bytes, source, provider_metadata,
           is_encrypted, encryption_mode, variants_json, dpi,
           occurred_at, created_at, updated_at
         ) VALUES (?, ?, 'IMAGE', ?, '', ?, ?, 'image/webp', ?, 'GOOGLE_PHOTOS', ?, 1, 'SINGLE_BLOCK_GCM', ?, 300, NOW(3), NOW(3), NOW(3))`,
        [
          capsuleId || session.capsule_id || 'capsule-default',
          userId,
          null, // Do not pollute with camera filenames
          mediaUrl,
          storageKey,
          processed.master.sizeBytes,
          JSON.stringify({ googleId: item.id, filename: originalFilename }),
          JSON.stringify(variantsJson),
        ]
      );

      createdMemories.push({
        id: ins.insertId,
        mediaId,
        media_url: mediaUrl,
        displayUrl: `${mediaUrl}?variant=display`,
        thumbUrl: `${mediaUrl}?variant=thumb`,
        type: 'IMAGE',
        source: 'GOOGLE_PHOTOS',
        is_encrypted: 1,
      });
    }

    // Delete ephemeral Google session
    try {
      await fetch(`${GOOGLE_PICKER_BASE}/sessions/${encodeURIComponent(session.google_session_id)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${accessToken}` },
      });
    } catch {}

    await pool.query(
      "UPDATE google_photos_picker_sessions SET status = 'COMPLETED', imported_count = ?, import_completed_at = NOW(3) WHERE id = ?",
      [createdMemories.length, session.id]
    );

    return {
      importedCount: createdMemories.length,
      memories: createdMemories,
      message: `${createdMemories.length} foto(s) guardada(s) com sucesso na cápsula.`,
    };
  },

  async disconnect(userId) {
    await pool.query(
      "UPDATE integration_connections SET status = 'REVOKED' WHERE user_id = ? AND provider = 'google_photos'",
      [userId]
    );
    return { success: true };
  },
};

export default googlePhotosService;
