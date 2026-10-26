/**
 * auth.js
 * JWT issuance/verification + Express middleware for protected routes.
 *
 * Parity notes (matching the real FastAPI backend):
 *  - No `Authorization` header => 403 (HTTPBearer returns 403 when missing).
 *  - Invalid/expired token or unknown user => 401.
 *  - Token payload carries `sub` = user email (like the real `create_access_token`).
 */
import jwt from 'jsonwebtoken';
import config from './config.js';
import { findUserByEmail } from './db.js';
import { pool } from './db/mysql.js';

/**
 * Administradores raiz: protegidos contra rebaixamento/exclusão e promovidos
 * automaticamente apenas quando o e-mail é verificado (Google OAuth) ou semeado.
 * Nunca derive privilégio do nome exibido — qualquer um pode escolher o nome.
 */
export const ROOT_ADMIN_EMAILS = [
  // A conta demo tem senha pública no repositório: nunca é admin raiz em produção.
  ...(config.isProduction ? [] : ['demo@ethernity.com']),
  'vameri@gmail.com',
  ...(process.env.ADMIN_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
];

export function isRootAdminEmail(email) {
  return ROOT_ADMIN_EMAILS.includes(String(email || '').trim().toLowerCase());
}

export function hasAdminFlag(user) {
  return user?.is_admin === 1 || user?.is_admin === true;
}

export function signToken(user, expiresInMs = config.accessTokenExpireMs) {
  const options = expiresInMs
    ? { algorithm: config.jwtAlgorithm, expiresIn: Math.floor(expiresInMs / 1000) }
    : { algorithm: config.jwtAlgorithm };
  return jwt.sign({ sub: user.email }, config.jwtSecret, options);
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret, {
      algorithms: [config.jwtAlgorithm],
    });
  } catch {
    return null;
  }
}

/**
 * Express middleware. On success attaches `req.user` (the full user record).
 * Mirrors FastAPI's HTTPBearer + get_current_user behavior (403 / 401).
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || req.headers.Authorization;
  let token = null;
  if (header && header.startsWith('Bearer ')) {
    token = header.slice('Bearer '.length).trim();
  } else if (req.query && req.query.token) {
    token = String(req.query.token).trim();
  }

  if (!token) {
    return res.status(403).json({ detail: 'Not authenticated' });
  }

  const payload = verifyToken(token);
  if (!payload || !payload.sub) {
    return res.status(401).json({ detail: 'Could not validate credentials' });
  }

  // O MySQL é a fonte da verdade a cada requisição: usuário excluído ou rebaixado
  // perde o acesso na hora, e todas as instâncias enxergam o mesmo estado.
  const memUser = findUserByEmail(payload.sub);
  let user = null;
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, phone, avatar_url, plan_id, is_admin FROM users WHERE email = ? LIMIT 1',
      [payload.sub]
    );
    if (rows && rows.length > 0) {
      const dbUser = rows[0];
      const dbFields = {
        id: dbUser.id,
        name: dbUser.name,
        email: dbUser.email,
        phone: dbUser.phone,
        avatar_url: dbUser.avatar_url,
        photo_url: dbUser.avatar_url,
        avatar: dbUser.avatar_url,
        plan_id: dbUser.plan_id,
        plan: dbUser.plan_id === 'infinity' ? 'Plano Infinity' : 'Gratuito',
        is_admin: dbUser.is_admin ? 1 : 0,
      };
      if (memUser) {
        // Mantém o mesmo objeto (rotas legadas guardam estado nele), com dados frescos do banco.
        Object.assign(memUser, dbFields);
        user = memUser;
      } else {
        user = dbFields;
      }
    }
  } catch (e) {
    console.warn('[requireAuth] Erro ao consultar usuário no MySQL:', e.message);
  }

  // Usuários só em memória (semente e testes) valem apenas fora de produção.
  if (!user && !config.isProduction) {
    user = memUser || null;
  }

  if (!user) {
    return res.status(401).json({ detail: 'Could not validate credentials' });
  }

  req.user = user;
  return next();
}

/**
 * Middleware requireAdmin
 * Exige que o usuário autenticado possua flag is_admin = 1 (persistida no MySQL).
 */
export async function requireAdmin(req, res, next) {
  return requireAuth(req, res, () => {
    if (hasAdminFlag(req.user)) {
      return next();
    }

    return res.status(403).json({
      detail: 'Acesso restrito. Privilégios de Administrador requeridos.',
    });
  });
}

/** Build the `Authorization` header value for a given user (tests / tooling). */
export function bearerHeader(user, expiresInMs) {
  return `Bearer ${signToken(user, expiresInMs)}`;
}

export default { signToken, verifyToken, requireAuth, requireAdmin, bearerHeader, isRootAdminEmail, hasAdminFlag };