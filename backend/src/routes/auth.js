/**
 * routes/auth.js
 * Authentication router: Register, Login, Google Social Login (Gmail), Session Profile.
 */
import { Router } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { store, findUserByEmail, findUserById, publicUser } from '../db.js';
import { uuid } from '../seed.js';
import { signToken, requireAuth, isRootAdminEmail } from '../auth.js';
import { pool } from '../db/mysql.js';
import config, { isAllowedOrigin } from '../config.js';
import { loginLimiters, registerLimiters } from '../rateLimit.js';

const router = Router();

export const MIN_PASSWORD_LENGTH = 8;

export async function cacheGoogleAvatar(remoteUrl, userId) {
  if (!remoteUrl || !remoteUrl.startsWith('http')) return remoteUrl;
  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) return remoteUrl;
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = `avatar-google-${userId}.jpg`;
    const uploadDir = path.resolve(config.uploadFolder);
    await fs.mkdir(uploadDir, { recursive: true });
    await fs.writeFile(path.join(uploadDir, filename), buffer);
    return `/uploads/${filename}`;
  } catch (err) {
    console.warn('[GoogleAuth] Failed to cache avatar locally:', err.message);
    return remoteUrl;
  }
}

// GET /auth/me — retorna o usuário autenticado atual sincronizado com o banco
router.get('/auth/me', requireAuth, async (req, res) => {
  let user = findUserById(req.user?.id) || req.user;
  if (!user) return res.status(401).json({ detail: 'Esta conta não existe mais.' });

  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, phone, avatar_url, plan_id, is_admin FROM users WHERE id = ? OR email = ? LIMIT 1',
      [user.id, user.email]
    );
    if (rows && rows.length > 0) {
      const dbUser = rows[0];
      user.name = dbUser.name || user.name;
      user.email = dbUser.email || user.email;
      user.is_admin = dbUser.is_admin ? 1 : 0;
      if (dbUser.avatar_url) {
        user.avatar_url = dbUser.avatar_url;
        user.photo_url = dbUser.avatar_url;
      }
    }
  } catch (err) {
    console.warn('[Auth] /auth/me database query error:', err.message);
  }

  return res.json({ user: publicUser(user) });
});

// GET /auth/google/url — Gera a URL oficial de consentimento do Google OAuth 2.0 (OpenID Connect)
router.get('/auth/google/url', (req, res) => {
  if (!config.googlePhotos.clientId || !config.googlePhotos.redirectUri) {
    return res.status(500).json({ detail: 'Google OAuth não está configurado no servidor.' });
  }

  const rawOrigin =
    req.headers.origin ||
    (req.headers.referer ? new URL(req.headers.referer).origin : null) ||
    config.frontendUrl;
  const requestedOrigin = rawOrigin.replace(/\/$/, '');
  // Só redireciona (com o JWT na URL) para origens confiáveis — evita roubo de token via open redirect.
  const clientOrigin = isAllowedOrigin(requestedOrigin) ? requestedOrigin : config.frontendUrl;

  const stateToken = jwt.sign(
    {
      action: 'auth',
      origin: clientOrigin,
      nonce: crypto.randomBytes(16).toString('hex'),
    },
    config.jwtSecret,
    { expiresIn: 600, audience: 'google-auth-state' }
  );

  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', config.googlePhotos.clientId);
  url.searchParams.set('redirect_uri', config.googlePhotos.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('prompt', 'select_account');
  url.searchParams.set('state', stateToken);

  return res.json({ url: url.toString() });
});

// POST /register — create a new user. Duplicate email => 400.
router.post('/register', ...registerLimiters, async (req, res) => {
  const { email, password, name, phone } = req.body || {};

  if (!email || !password || !name || !phone) {
    return res
      .status(422)
      .json({ detail: 'email, password, name and phone are required' });
  }

  if (String(password).length < MIN_PASSWORD_LENGTH) {
    return res.status(422).json({ detail: `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.` });
  }

  if (findUserByEmail(email.trim().toLowerCase())) {
    return res.status(400).json({ detail: 'Email already registered' });
  }

  // A memória pode não conter usuários que só existem no MySQL (ex.: após restart).
  try {
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [
      email.trim().toLowerCase(),
    ]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ detail: 'Email already registered' });
    }
  } catch (err) {
    console.warn('[Auth] MySQL lookup failed in /register:', err.message);
  }

  const newId = uuid();
  // Nunca manter a senha em texto puro, nem na memória: o cache guarda só o hash.
  const passwordHash = bcrypt.hashSync(password, 10);
  const user = {
    id: newId,
    email: email.trim().toLowerCase(),
    name: name.trim(),
    phone: phone.trim(),
    password_hash: passwordHash,
  };

  // Só confirma o cadastro depois de gravado no MySQL; antes, uma falha aqui
  // deixava a conta apenas em memória e ela sumia no próximo restart.
  try {
    await pool.query(
      `INSERT INTO users (id, name, email, phone, password_hash, plan_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'infinity', NOW(3), NOW(3))`,
      [newId, user.name, user.email, user.phone, passwordHash]
    );
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ detail: 'Email already registered' });
    }
    console.error('[Auth] Falha ao gravar cadastro no MySQL:', err.message);
    return res.status(503).json({ detail: 'Não foi possível concluir o cadastro agora. Tente novamente.' });
  }

  store.users.push(user);
  return res.json(publicUser(user));
});

// POST /login — validate credentials, return a JWT.
router.post('/login', ...loginLimiters, async (req, res) => {
  const { email, password } = req.body || {};
  let user = findUserByEmail(email);

  // Se não encontrar na memória, busca no MySQL
  if (!user && email) {
    try {
      const [rows] = await pool.query(
        'SELECT id, name, email, phone, password_hash, avatar_url, plan_id, is_admin FROM users WHERE email = ? LIMIT 1',
        [email.trim().toLowerCase()]
      );
      if (rows && rows.length > 0) {
        user = rows[0];
      }
    } catch (err) {
      console.warn('[Auth] MySQL lookup failed in /login:', err.message);
    }
  }

  const isDemoEmail =
    email === 'demo@ethernity.com' ||
    user?.email === 'demo@ethernity.com';

  // Senhas de demonstração valem SOMENTE para a conta demo, e nunca em produção (salvo ENABLE_DEMO_LOGIN=1).
  const isDemoPassword =
    config.demoLoginEnabled &&
    isDemoEmail &&
    (password === 'password123' || password === 'Ethernity2026!Demo');

  if (!user && isDemoEmail) {
    user = store.users.find((u) => u.id === 'u-demo-1') || store.users[0];
  }

  let passwordMatches = false;
  if (user) {
    if (isDemoPassword) {
      passwordMatches = true;
    } else if (config.demoLoginEnabled && user.password && user.password === password) {
      // Senha em texto puro só existe nos usuários semeados em memória (dev/testes).
      // Em produção esse caminho fica fechado: a semente é pública no repositório.
      passwordMatches = true;
    } else if (user.password_hash) {
      try {
        passwordMatches = bcrypt.compareSync(String(password || ''), user.password_hash);
      } catch {
        passwordMatches = false;
      }
    }
  }

  if (!user || !passwordMatches) {
    return res
      .status(401)
      .json({ detail: 'Incorrect email or password' });
  }

  const access_token = signToken(user);
  return res.json({ access_token, token_type: 'bearer', user: publicUser(user) });
});

/**
 * Processador oficial do retorno do Google OAuth (Gmail Login & Cadastro)
 */
export async function handleGoogleAuth({ code, res, statePayload }) {
  const stateOrigin = String(statePayload?.origin || '').replace(/\/$/, '');
  const targetFrontendUrl = (isAllowedOrigin(stateOrigin) ? stateOrigin : config.frontendUrl).replace(/\/$/, '');

  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
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
      const message =
        tokenData.error_description || tokenData.error || 'Falha ao autenticar com o Google.';
      return res.redirect(`${targetFrontendUrl}/?error=${encodeURIComponent(message)}`);
    }

    const userinfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userinfoRes.ok) {
      return res.redirect(
        `${targetFrontendUrl}/?error=${encodeURIComponent('Não foi possível obter dados do perfil Google.')}`
      );
    }

    const profile = await userinfoRes.json();
    const email = profile.email?.trim().toLowerCase();
    const name = profile.name?.trim() || profile.given_name?.trim() || email.split('@')[0];
    const avatarUrl = profile.picture || null;

    if (!email) {
      return res.redirect(
        `${targetFrontendUrl}/?error=${encodeURIComponent('E-mail não fornecido pelo Google.')}`
      );
    }

    // 1. Procurar ou cadastrar no MySQL
    let userRecord = null;
    let cachedAvatarUrl = avatarUrl;
    // Promoção automática apenas para e-mails raiz verificados pelo Google.
    const isRootAdmin = profile.email_verified !== false && isRootAdminEmail(email);

    try {
      const [existing] = await pool.query(
        'SELECT id, name, email, phone, avatar_url, plan_id, is_admin FROM users WHERE email = ? LIMIT 1',
        [email]
      );

      const resolvedUserId = existing[0]?.id || uuid();
      if (avatarUrl) {
        cachedAvatarUrl = await cacheGoogleAvatar(avatarUrl, resolvedUserId);
      }

      if (existing.length > 0) {
        userRecord = existing[0];
        const newIsAdmin = isRootAdmin ? 1 : (userRecord.is_admin ? 1 : 0);
        await pool.query(
          'UPDATE users SET name = ?, avatar_url = ?, is_admin = ? WHERE id = ?',
          [name, cachedAvatarUrl, newIsAdmin, userRecord.id]
        );
        userRecord.name = name;
        userRecord.avatar_url = cachedAvatarUrl;
        userRecord.is_admin = newIsAdmin;
      } else {
        const initialIsAdmin = isRootAdmin ? 1 : 0;
        await pool.query(
          `INSERT INTO users (id, name, email, avatar_url, plan_id, is_admin, created_at, updated_at)
           VALUES (?, ?, ?, ?, 'infinity', ?, NOW(3), NOW(3))`,
          [resolvedUserId, name, email, cachedAvatarUrl, initialIsAdmin]
        );
        userRecord = {
          id: resolvedUserId,
          name,
          email,
          phone: null,
          avatar_url: cachedAvatarUrl,
          plan_id: 'infinity',
          is_admin: initialIsAdmin,
        };
      }
    } catch (dbErr) {
      console.warn('[GoogleAuth] Database fallback to memory store:', dbErr.message);
    }

    // 2. Sincronizar com in-memory store
    let memUser = findUserByEmail(email);
    if (!memUser) {
      memUser = {
        id: userRecord?.id || uuid(),
        email,
        name,
        avatar_url: cachedAvatarUrl,
        photo_url: cachedAvatarUrl,
        phone: userRecord?.phone || null,
        is_admin: isRootAdmin ? 1 : (userRecord?.is_admin ? 1 : 0),
      };
      store.users.push(memUser);
    } else {
      memUser.name = name || memUser.name;
      memUser.avatar_url = cachedAvatarUrl || memUser.avatar_url;
      memUser.photo_url = memUser.avatar_url;
      memUser.is_admin = isRootAdmin ? 1 : (memUser.is_admin ? 1 : 0);
    }

    const access_token = signToken(memUser);
    const serialized = publicUser(memUser);

    return res.redirect(
      `${targetFrontendUrl}/?token=${encodeURIComponent(access_token)}&user=${encodeURIComponent(JSON.stringify(serialized))}`
    );
  } catch (err) {
    console.error('[GoogleAuth] Erro inesperado no login Google:', err);
    return res.redirect(
      `${targetFrontendUrl}/?error=${encodeURIComponent(err.message || 'Erro inesperado durante login social.')}`
    );
  }
}

export default router;