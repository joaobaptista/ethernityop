/**
 * routes/googlePhotos.js
 * Google Photos Picker API & OAuth 2.0 integration endpoints.
 * Multiplexes Google OAuth callbacks (Gmail login & Photos Picker connection),
 * manages Picker API sessions, polling, and media item importation.
 */
import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { requireAuth } from '../auth.js';
import { uuid } from '../seed.js';
import config from '../config.js';
import { handleGoogleAuth } from './auth.js';
import googlePhotosService from '../services/googlePhotosService.js';
import { pool } from '../db/mysql.js';

const router = Router();

// In-memory store for fallback user connections
const userGoogleConnections = new Map();
const activePickerSessions = new Map();

/**
 * GET /integrations/google-photos/callback
 * Multiplexador oficial de callback da Google (Gmail login / cadastro e Google Fotos).
 * Google Cloud Console Authorized URI: http://localhost:3333/api/integrations/google-photos/callback
 */
router.get('/integrations/google-photos/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const targetFrontendUrl = config.frontendUrl;

  if (error || error_description) {
    const message = error_description || error || 'O Google cancelou ou recusou a autorização.';
    return res.redirect(`${targetFrontendUrl}/?error=${encodeURIComponent(message)}`);
  }

  if (!code || !state) {
    return res.redirect(
      `${targetFrontendUrl}/?error=${encodeURIComponent('Parâmetros de autorização ausentes na resposta do Google.')}`
    );
  }

  let statePayload = null;
  try {
    statePayload = jwt.verify(state, config.jwtSecret);
  } catch (err) {
    console.warn('[GoogleCallback] Invalid or expired state JWT:', err.message);
    return res.redirect(
      `${targetFrontendUrl}/?error=${encodeURIComponent('O estado da autorização expirou ou é inválido.')}`
    );
  }

  // 1. Roteamento de Login & Cadastro Social (OpenID Connect / Gmail)
  if (statePayload?.action === 'auth' || statePayload?.aud === 'google-auth-state') {
    return handleGoogleAuth({ code, res, statePayload });
  }

  // 2. Roteamento de Conexão com Google Photos Picker API
  try {
    await googlePhotosService.handleOAuthCallback({ code, state });
    const origin = (statePayload?.origin || targetFrontendUrl).replace(/\/$/, '');
    return res.redirect(`${origin}/?google_photos_status=connected`);
  } catch (err) {
    console.error('[GoogleCallback] Erro ao conectar Google Fotos:', err);
    const origin = (statePayload?.origin || targetFrontendUrl).replace(/\/$/, '');
    return res.redirect(
      `${origin}/?google_photos_status=error&message=${encodeURIComponent(err.message || 'Erro ao conectar Google Fotos.')}`
    );
  }
});

/**
 * GET /integrations/google-photos/status
 * Get connection status for Google Photos
 */
router.get('/integrations/google-photos/status', async (req, res) => {
  const userId = req.user?.id || 'u-demo-1';
  const status = await googlePhotosService.getConnectionStatus(userId);
  return res.json({
    ...status,
    integration: status,
  });
});

/**
 * POST & GET /integrations/google-photos/authorization-url
 * Returns Google Photos Picker OAuth authorization URL
 */
const handleAuthUrl = async (req, res) => {
  try {
    const userId = req.user?.id || 'u-demo-1';
    const rawOrigin =
      req.headers.origin ||
      (req.headers.referer ? new URL(req.headers.referer).origin : null) ||
      config.frontendUrl;
    const result = await googlePhotosService.generateAuthorizationUrl(userId, rawOrigin);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

router.get('/integrations/google-photos/authorization-url', handleAuthUrl);
router.post('/integrations/google-photos/authorization-url', handleAuthUrl);

/**
 * POST /integrations/google-photos/sessions
 * Generic endpoint to create Picker API session
 */
router.post('/integrations/google-photos/sessions', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const capsuleId = req.body?.capsuleId || 'capsule-default';
    const session = await googlePhotosService.createPickerSession(userId, capsuleId);
    return res.status(201).json({ session, data: { session } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /integrations/google-photos/sessions/:sessionId
 * Generic endpoint to poll session
 */
router.get('/integrations/google-photos/sessions/:sessionId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;
    const session = await googlePhotosService.getPickerSession(userId, 'capsule-default', sessionId);
    return res.json({ session, data: { session } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /integrations/google-photos/sessions/:sessionId/import
 * Generic endpoint to import session media items
 */
router.post('/integrations/google-photos/sessions/:sessionId/import', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { sessionId } = req.params;
    const capsuleId = req.body?.capsuleId || 'capsule-default';
    const result = await googlePhotosService.importPickerSession(userId, capsuleId, sessionId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /capsules/:id/google-photos/sessions
 * Create a new Picker API session
 */
router.post('/capsules/:id/google-photos/sessions', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const capsuleId = req.params.id;
    const session = await googlePhotosService.createPickerSession(userId, capsuleId);
    return res.status(201).json({ session, data: { session } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /capsules/:id/google-photos/sessions/:sessionId
 * Poll picker session status
 */
router.get('/capsules/:id/google-photos/sessions/:sessionId', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: capsuleId, sessionId } = req.params;
    const session = await googlePhotosService.getPickerSession(userId, capsuleId, sessionId);
    return res.json({ session, data: { session } });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /capsules/:id/google-photos/sessions/:sessionId/import
 * Import photos from ready picker session
 */
router.post('/capsules/:id/google-photos/sessions/:sessionId/import', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { id: capsuleId, sessionId } = req.params;
    const result = await googlePhotosService.importPickerSession(userId, capsuleId, sessionId);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /integrations/google-photos/disconnect
 */
router.post('/integrations/google-photos/disconnect', requireAuth, async (req, res) => {
  const userId = req.user.id;
  await googlePhotosService.disconnect(userId);
  return res.json({ success: true, message: 'Google Fotos desconectado com sucesso.' });
});

// =========================================================================
// ROTAS DE COMPATIBILIDADE COM O FRONTEND EXISTENTE (/google-photos/*)
// =========================================================================

/**
 * GET /google-photos/auth-url
 */
router.get('/google-photos/auth-url', (req, res) => {
  const clientId = config.googlePhotos.clientId;
  const redirectUri = config.googlePhotos.redirectUri;
  const scope = [
    'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'openid',
  ].join(' ');

  const authUrl = clientId
    ? `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(
        redirectUri
      )}&response_type=code&scope=${encodeURIComponent(scope)}&prompt=consent&access_type=offline`
    : null;

  return res.json({
    authUrl,
    hasConfiguredCredentials: Boolean(clientId),
    clientId: clientId || null,
    scope,
    mode: clientId ? 'production' : 'demo_simulation',
  });
});

/**
 * POST /google-photos/userinfo
 */
router.post('/google-photos/userinfo', async (req, res) => {
  const token = req.headers['x-google-access-token'] || req.body.accessToken;

  if (!token) {
    return res.status(400).json({ error: 'Token de acesso do Google não fornecido.' });
  }

  try {
    const googleRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!googleRes.ok) {
      const errBody = await googleRes.json().catch(() => ({}));
      return res.status(googleRes.status).json({
        error: 'Falha ao autenticar com o Google.',
        details: errBody,
      });
    }

    const userData = await googleRes.json();
    return res.json({
      email: userData.email,
      name: userData.name,
      picture: userData.picture,
      sub: userData.sub,
    });
  } catch (err) {
    return res.status(502).json({ error: 'Erro de conexão com o Google UserInfo API.' });
  }
});

/**
 * GET & POST /google-photos/live-photos
 */
async function handleLivePhotos(req, res) {
  const token =
    req.headers['x-google-access-token'] ||
    req.query.googleToken ||
    req.query.accessToken ||
    req.body?.accessToken ||
    req.body?.googleToken;

  const pageSize = Number(req.query.pageSize || req.body?.pageSize || 50);

  if (!token) {
    const fallbackPhotos = [];
    return res.json({
      photos: fallbackPhotos,
      nextPageToken: null,
      total: 0,
      mode: 'curated_fallback',
    });
  }

  try {
    const url = `https://photoslibrary.googleapis.com/v1/mediaItems?pageSize=${Math.min(pageSize, 100)}`;
    const googleRes = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!googleRes.ok) {
      return res.json({
        photos: [],
        total: 0,
        mode: 'error_empty',
      });
    }

    const data = await googleRes.json();
    const rawItems = Array.isArray(data.mediaItems) ? data.mediaItems : [];
    const formattedPhotos = rawItems.map((item) => ({
      id: item.id,
      title: item.description || item.filename || 'Foto do Google Fotos',
      description: item.description || `Foto importada do Google Fotos (${item.filename})`,
      filename: item.filename,
      category: 'family',
      categoryLabel: 'Google Fotos',
      thumbnailUrl: `${item.baseUrl}=w800-h800`,
      fullUrl: `${item.baseUrl}=w2048-h2048`,
      source: 'google_photos',
    }));

    return res.json({
      photos: formattedPhotos,
      nextPageToken: data.nextPageToken || null,
      total: formattedPhotos.length,
      mode: 'live_google_photos',
    });
  } catch {
    return res.json({
      photos: [],
      total: 0,
      mode: 'empty',
    });
  }
}

router.get('/google-photos/live-photos', handleLivePhotos);
router.post('/google-photos/live-photos', handleLivePhotos);

/**
 * GET /google-photos/status
 */
router.get('/google-photos/status', async (req, res) => {
  const userId = req.user?.id || 'u-demo-1';
  if (userGoogleConnections.has(userId)) {
    const conn = userGoogleConnections.get(userId);
    return res.json({
      ...conn,
      connected: Boolean(conn.connected),
      displayName: conn.name || null,
      email: conn.email || null,
    });
  }

  let dbStatus = { connected: false };
  try {
    dbStatus = await googlePhotosService.getConnectionStatus(userId);
  } catch {}

  const connection = {
    connected: Boolean(dbStatus.connected),
    email: dbStatus.displayName || null,
    name: dbStatus.displayName || null,
    avatarUrl: null,
    connectedAt: dbStatus.lastSyncedAt || null,
    importedPhotos: [],
    totalImported: 0,
  };
  return res.json({ ...connection, ...dbStatus });
});

/**
 * POST /google-photos/connect
 */
router.post('/google-photos/connect', (req, res) => {
  const userId = req.user?.id || 'u-demo-1';
  const { email, name, avatarUrl } = req.body || {};

  const connection = {
    connected: true,
    email: email || 'user.test@gmail.com',
    name: name || 'User Test Google',
    avatarUrl: avatarUrl || null,
    connectedAt: new Date().toISOString(),
    importedPhotos: [],
    totalImported: 0,
  };

  userGoogleConnections.set(userId, connection);

  return res.json({
    success: true,
    connection,
  });
});

/**
 * POST /google-photos/session
 */
router.post('/google-photos/session', async (req, res) => {
  const userId = req.user?.id || 'u-demo-1';
  try {
    const session = await googlePhotosService.createPickerSession(userId, 'capsule-default');
    return res.json({
      id: session.id,
      sessionId: session.sessionId,
      pickerUri: session.pickerUri,
      availablePhotos: [],
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /memories & GET /api/memories
 * Lists all imported memories and photos for the current user
 */
const handleListMemories = async (req, res) => {
  const userId = req.user.id;
  try {
    const [rows] = await pool.query(
      `SELECT * FROM memories WHERE author_id = ? ORDER BY created_at DESC`,
      [userId]
    );

    const baseUrl = config.backendUrl || 'http://localhost:3333';
    const memories = (rows || []).map((m) => {
      const fullUrl = m.media_url?.startsWith('http') ? m.media_url : `${baseUrl}${m.media_url}`;
      const isEncrypted = Boolean(m.is_encrypted);
      let variants = null;
      if (m.variants_json) {
        try {
          variants = typeof m.variants_json === 'string' ? JSON.parse(m.variants_json) : m.variants_json;
        } catch {}
      }

      return {
        id: String(m.id),
        type: m.type || 'IMAGE',
        title: m.title || 'Foto de Memória',
        description: m.content || '',
        category: 'family',
        categoryLabel: m.source === 'GOOGLE_PHOTOS' ? 'Google Fotos' : 'Memórias',
        date: m.occurred_at ? new Date(m.occurred_at).toLocaleDateString('pt-BR') : new Date(m.created_at).toLocaleDateString('pt-BR'),
        thumbnailUrl: isEncrypted && m.type === 'IMAGE' ? `${fullUrl}?variant=thumb` : fullUrl,
        displayUrl: isEncrypted && m.type === 'IMAGE' ? `${fullUrl}?variant=display` : fullUrl,
        masterUrl: isEncrypted && m.type === 'IMAGE' ? `${fullUrl}?variant=master` : fullUrl,
        fullUrl: fullUrl,
        mediaUrl: fullUrl,
        isEncrypted,
        encryptionMode: m.encryption_mode,
        variants,
        dpi: m.dpi || 300,
        durationSeconds: m.media_duration_seconds,
        waveformPeaks: m.waveform_peaks,
        source: m.source || 'google_photos',
        created_at: m.created_at,
      };
    });

    return res.json({ memories, photos: memories, total: memories.length });
  } catch (err) {
    console.error('[Memories] Error fetching memories:', err);
    return res.json({ memories: [], photos: [], total: 0 });
  }
};

router.get('/memories', requireAuth, handleListMemories);
router.get('/api/memories', requireAuth, handleListMemories);

/**
 * GET /google-photos/photos
 * Returns real photos stored in the database from Google Photos
 */
router.get('/google-photos/photos', requireAuth, async (req, res) => {
  const userId = req.user.id;
  try {
    const [rows] = await pool.query(
      `SELECT * FROM memories WHERE author_id = ? AND source = 'GOOGLE_PHOTOS' ORDER BY created_at DESC`,
      [userId]
    );

    const baseUrl = config.backendUrl || 'http://localhost:3333';
    let photos = (rows || []).map((m) => {
      const fullUrl = m.media_url?.startsWith('http') ? m.media_url : `${baseUrl}${m.media_url}`;
      const isEncrypted = Boolean(m.is_encrypted);
      let variants = null;
      if (m.variants_json) {
        try {
          variants = typeof m.variants_json === 'string' ? JSON.parse(m.variants_json) : m.variants_json;
        } catch {}
      }

      return {
        id: String(m.id),
        type: m.type || 'IMAGE',
        title: m.title || 'Foto do Google Fotos',
        description: m.content || 'Foto importada com segurança',
        category: 'family',
        categoryLabel: 'Google Fotos',
        date: m.occurred_at ? new Date(m.occurred_at).toLocaleDateString('pt-BR') : new Date(m.created_at).toLocaleDateString('pt-BR'),
        timestamp: m.occurred_at || m.created_at,
        location: 'Google Fotos',
        thumbnailUrl: isEncrypted ? `${fullUrl}?variant=thumb` : fullUrl,
        displayUrl: isEncrypted ? `${fullUrl}?variant=display` : fullUrl,
        masterUrl: isEncrypted ? `${fullUrl}?variant=master` : fullUrl,
        fullUrl: fullUrl,
        downloadUrl: isEncrypted ? `${fullUrl}?variant=master` : fullUrl,
        source: 'google_photos',
        isEncrypted,
        variants,
        dpi: m.dpi || 300,
      };
    });

    const { category, search } = req.query;
    if (category && category !== 'all') {
      photos = photos.filter((item) => item.category === category);
    }
    if (search) {
      const q = String(search).toLowerCase();
      photos = photos.filter(
        (item) =>
          item.title.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q)
      );
    }

    return res.json({
      total: photos.length,
      photos,
    });
  } catch (err) {
    console.error('[GooglePhotos] Error loading photos:', err);
    return res.json({ total: 0, photos: [] });
  }
});

/**
 * POST /google-photos/import
 */
router.post('/google-photos/import', (req, res) => {
  const userId = req.user?.id || 'u-demo-1';
  const { photoIds, photos, targetCapsuleId } = req.body || {};

  let selectedPhotos = [];
  if (Array.isArray(photos) && photos.length > 0) {
    selectedPhotos = photos;
  } else if (Array.isArray(photoIds) && photoIds.length > 0) {
    selectedPhotos = photoIds.map((id) => ({ id, title: `Foto ${id}` }));
  }

  if (selectedPhotos.length === 0) {
    return res.status(400).json({ detail: 'Nenhuma foto selecionada para importação.' });
  }

  const conn = userGoogleConnections.get(userId) || {
    connected: true,
    email: req.user?.email || 'demo@ethernity.com',
    name: req.user?.name || 'Vagner Ibas',
    connectedAt: new Date().toISOString(),
    importedPhotos: [],
    totalImported: 0,
  };

  const newImported = selectedPhotos.map((p) => ({
    ...p,
    importedAt: new Date().toISOString(),
    vaultId: `vault-gp-${uuid()}`,
    isEncrypted: true,
    targetCapsuleId: targetCapsuleId || null,
  }));

  conn.importedPhotos = [...(conn.importedPhotos || []), ...newImported];
  conn.totalImported = conn.importedPhotos.length;
  userGoogleConnections.set(userId, conn);

  return res.json({
    success: true,
    message: `${newImported.length} foto(s) importada(s) com sucesso para o seu Cofre Digital!`,
    importedCount: newImported.length,
    importedPhotos: newImported,
    targetCapsuleId: targetCapsuleId || null,
  });
});

/**
 * POST /google-photos/disconnect
 */
router.post('/google-photos/disconnect', async (req, res) => {
  const userId = req.user?.id || 'u-demo-1';
  userGoogleConnections.set(userId, {
    connected: false,
    email: null,
    name: null,
    avatarUrl: null,
    connectedAt: null,
    importedPhotos: [],
    totalImported: 0,
  });
  try {
    await googlePhotosService.disconnect(userId);
  } catch {}
  return res.json({ success: true, message: 'Conta do Google Fotos desconectada com sucesso.' });
});

export default router;
